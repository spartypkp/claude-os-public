"""Show service for rendering visual content."""

from datetime import datetime
from typing import Any, Dict, Optional
import logging

from .renderers import CalendarRenderer, PrioritiesRenderer, ContactRenderer
from core.database import get_db

logger = logging.getLogger(__name__)

# Module-level Telegram service singleton (for MCP context)
_telegram_service = None
_telegram_service_initialized = False


async def _get_telegram_service():
    """Get or create the Telegram service instance.

    MCP server runs in separate process from FastAPI, so we need our own instance.
    """
    global _telegram_service, _telegram_service_initialized

    if _telegram_service_initialized:
        return _telegram_service

    _telegram_service_initialized = True

    try:
        from adapters.telegram.service import TelegramService
        service = TelegramService()

        # Only initialize if credentials are available
        if service.bot_token and service.authorized_user_id:
            # Use init_bot_only() instead of start() - MCP runs in separate process
            # from FastAPI, so we don't want to start polling (that's FastAPI's job)
            await service.init_bot_only()
            _telegram_service = service
            logger.info("Telegram bot client initialized for show module (send-only)")
        else:
            logger.warning("Telegram credentials not available - document sending disabled")
            _telegram_service = None
    except Exception as e:
        logger.error(f"Failed to initialize Telegram bot client: {e}")
        _telegram_service = None

    return _telegram_service


class ShowService:
    """Service for rendering visual content."""

    def __init__(self):
        """Initialize show service."""
        self.renderers = {
            "calendar": CalendarRenderer(),
            "priorities": PrioritiesRenderer(),
            "contact": ContactRenderer(),
        }

    def _detect_destination(self) -> str:
        """Auto-detect destination from context.

        Returns:
            "telegram" or "dashboard"
        """
        # TODO: Check if current conversation has [Telegram HH:MM] tag
        # For now, default to telegram (will be primary use case)
        # This can be enhanced later to check session context or message source
        return "telegram"

    def _parse_what(self, what: str) -> tuple[str, Optional[str]]:
        """Parse the 'what' parameter.

        Args:
            what: Content type, e.g. "calendar", "contact:alex", "diagram:name"

        Returns:
            Tuple of (content_type, parameter)
        """
        if ":" in what:
            parts = what.split(":", 1)
            return parts[0].lower(), parts[1]
        return what.lower(), None

    def _fetch_calendar_events(self) -> list[Dict[str, Any]]:
        """Fetch today's calendar events.

        Returns:
            List of event dicts
        """
        # Import here to avoid circular dependencies
        from modules.calendar import CalendarService
        from core.storage import SystemStorage
        from core.config import settings

        # Get today's date range
        today = datetime.now().date()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())

        try:
            storage = SystemStorage(settings.db_path)
            calendar_service = CalendarService(storage)
            events = calendar_service.get_events(
                start_date=today_start,
                end_date=today_end
            )
            # Convert to dicts
            return [
                {
                    "id": e.id,
                    "title": e.title,
                    "start_time": e.start_time.isoformat() if e.start_time else None,
                    "end_time": e.end_time.isoformat() if e.end_time else None,
                    "location": e.location,
                    "calendar_name": e.calendar_name,
                    "all_day": e.all_day,
                }
                for e in events
            ]
        except Exception as e:
            logger.error(f"Failed to fetch calendar events: {e}")
            return []

    def _fetch_priorities(self, date: Optional[str] = None) -> list[Dict[str, Any]]:
        """Fetch priorities for a date.

        Args:
            date: ISO date string (defaults to today)

        Returns:
            List of priority dicts
        """
        if date is None:
            date = datetime.now().date().isoformat()

        # Query database directly
        try:
            with get_db() as conn:
                cursor = conn.execute(
                """
                SELECT id, content, level, completed, date, created_at
                FROM priorities
                WHERE date = ?
                ORDER BY
                    CASE level
                        WHEN 'critical' THEN 1
                        WHEN 'medium' THEN 2
                        WHEN 'low' THEN 3
                    END,
                    position,
                    created_at
                """,
                (date,)
            )

            priorities = [dict(row) for row in cursor.fetchall()]

            return priorities

        except Exception as e:
            logger.error(f"Failed to fetch priorities: {e}")
            return []

    def _fetch_contact(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Fetch contact by name or identifier.

        Args:
            identifier: Contact name or ID

        Returns:
            Contact dict or None
        """
        try:
            with get_db() as conn:
                search_term = f"%{identifier}%"
                cursor = conn.execute(
                    """
                    SELECT id, name, phone, email, company, role, location,
                           description, relationship, context_notes, notes,
                           pinned, tags, last_contact, created_at
                    FROM contacts
                    WHERE name LIKE ? OR email LIKE ? OR company LIKE ?
                    ORDER BY pinned DESC, last_contact DESC NULLS LAST
                    LIMIT 1
                    """,
                    (search_term, search_term, search_term)
                )

                row = cursor.fetchone()

            if row:
                return dict(row)

            logger.error(f"Contact not found: {identifier}")
            return None

        except Exception as e:
            logger.error(f"Failed to fetch contact: {e}")
            return None

    async def show_content(
        self,
        what: str,
        destination: str = "auto"
    ) -> Dict[str, Any]:
        """Render visual content.

        Args:
            what: Content to show (e.g., "calendar", "priorities", "contact:alex")
            destination: "auto", "telegram", or "dashboard"

        Returns:
            Result dict with success status
        """
        try:
            # Parse what parameter
            content_type, param = self._parse_what(what)

            # Auto-detect destination if needed
            if destination == "auto":
                destination = self._detect_destination()

            # Get appropriate renderer (file type doesn't need renderer)
            renderer = self.renderers.get(content_type)
            if not renderer and content_type != "file":
                return {
                    "success": False,
                    "error": f"Unknown content type: {content_type}"
                }

            # Fetch data based on content type
            if content_type == "calendar":
                data = self._fetch_calendar_events()
            elif content_type == "priorities":
                data = self._fetch_priorities()
            elif content_type == "contact":
                if not param:
                    return {
                        "success": False,
                        "error": "Contact identifier required (e.g., 'contact:alex')"
                    }
                data = self._fetch_contact(param)
                if not data:
                    return {
                        "success": False,
                        "error": f"Contact not found: {param}"
                    }
            elif content_type == "file":
                # File sending - only for Telegram
                if not param:
                    return {
                        "success": False,
                        "error": "File path required (e.g., 'file:/path/to/doc.pdf')"
                    }

                # Import Path for validation
                from pathlib import Path

                # Validate file exists
                file_path = Path(param)
                if not file_path.exists():
                    return {
                        "success": False,
                        "error": f"File not found: {param}"
                    }

                # Only telegram destination makes sense for files
                if destination == "telegram":
                    # Send via Telegram
                    telegram_service = await _get_telegram_service()

                    if telegram_service:
                        success = await telegram_service.send_document(
                            file_path=str(file_path),
                            caption=None
                        )

                        if success:
                            return {
                                "success": True,
                                "rendered": "telegram",
                                "message": f"Sent document '{file_path.name}' to Telegram"
                            }
                        else:
                            return {
                                "success": False,
                                "error": "Failed to send document to Telegram"
                            }
                    else:
                        return {
                            "success": False,
                            "error": "Telegram service not available"
                        }
                else:
                    return {
                        "success": False,
                        "error": "File content type only supports 'telegram' destination"
                    }

            # Render based on destination (for calendar, priorities, contact)
            if destination == "telegram":
                # Render as image
                image_bytes = renderer.render_telegram(data)

                # Send via Telegram
                telegram_service = await _get_telegram_service()

                if telegram_service:
                    success = await telegram_service.send_photo(
                        photo_bytes=image_bytes,
                        caption=None
                    )

                    if success:
                        return {
                            "success": True,
                            "rendered": "telegram",
                            "message": f"Sent {content_type} image to Telegram"
                        }
                    else:
                        return {
                            "success": False,
                            "error": "Failed to send image to Telegram"
                        }
                else:
                    return {
                        "success": False,
                        "error": "Telegram service not available"
                    }

            elif destination == "dashboard":
                # Render as component data
                component_data = renderer.render_dashboard(data)

                return {
                    "success": True,
                    "rendered": "dashboard",
                    "data": component_data
                }

            else:
                return {
                    "success": False,
                    "error": f"Unknown destination: {destination}"
                }

        except Exception as e:
            logger.exception(f"Error in show_content: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# Global instance
_show_service = None


def get_show_service() -> ShowService:
    """Get or create show service instance."""
    global _show_service
    if _show_service is None:
        _show_service = ShowService()
    return _show_service


async def show_content(what: str, destination: str = "auto") -> Dict[str, Any]:
    """Convenience function for showing content.

    Args:
        what: Content to show
        destination: Where to render

    Returns:
        Result dict
    """
    service = get_show_service()
    return await service.show_content(what, destination)
