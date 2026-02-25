"""Show service — Telegram-only visual content rendering with multi-chat routing."""

import os
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

        if service.bot_token and service.authorized_user_id:
            await service.init_bot_only()
            _telegram_service = service
            logger.info("Telegram bot client initialized for show module (send-only)")
        else:
            logger.warning("Telegram credentials not available - show module disabled")
            _telegram_service = None
    except Exception as e:
        logger.error(f"Failed to initialize Telegram bot client: {e}")
        _telegram_service = None

    return _telegram_service


def _resolve_chat_id(target: str) -> Optional[int]:
    """Resolve target name to a Telegram chat_id.

    Args:
        target: "owner", "group", or "auto" (defaults to owner)

    Returns:
        Chat ID or None if not configured
    """
    if target == "group":
        raw = os.getenv("TELEGRAM_GROUP_CHAT_IDS", "")
        if not raw:
            return None
        # Use first configured group as default
        first_id = raw.split(",")[0].strip()
        if not first_id:
            return None
        return int(first_id)
    else:
        # "owner" or "auto" both resolve to owner
        user_id_str = os.getenv("TELEGRAM_USER_ID")
        if not user_id_str:
            return None
        return int(user_id_str)


class ShowService:
    """Service for rendering visual content to Telegram."""

    def __init__(self):
        """Initialize show service."""
        self.renderers = {
            "calendar": CalendarRenderer(),
            "priorities": PrioritiesRenderer(),
            "contact": ContactRenderer(),
        }

    def _parse_what(self, what: str) -> tuple[str, Optional[str]]:
        """Parse the 'what' parameter.

        Args:
            what: Content type, e.g. "calendar", "contact:alex", "file:/path"

        Returns:
            Tuple of (content_type, parameter)
        """
        if ":" in what:
            parts = what.split(":", 1)
            return parts[0].lower(), parts[1]
        return what.lower(), None

    def _fetch_calendar_events(self) -> list[Dict[str, Any]]:
        """Fetch today's calendar events."""
        from modules.calendar import CalendarService
        from core.storage import SystemStorage
        from core.config import settings

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
        """Fetch priorities for a date."""
        if date is None:
            date = datetime.now().date().isoformat()

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
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to fetch priorities: {e}")
            return []

    def _fetch_contact(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Fetch contact by name or identifier."""
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
        target: str = "auto",
    ) -> Dict[str, Any]:
        """Render visual content and send to Telegram.

        Args:
            what: Content to show (e.g., "calendar", "priorities", "contact:alex", "file:/path")
            target: "owner" (DM), "group" (group chat), or "auto" (defaults to owner)

        Returns:
            Result dict with success status
        """
        try:
            content_type, param = self._parse_what(what)

            # Resolve target to chat_id
            chat_id = _resolve_chat_id(target)
            if chat_id is None:
                target_desc = "TELEGRAM_GROUP_CHAT_IDS" if target == "group" else "TELEGRAM_USER_ID"
                return {"success": False, "error": f"{target_desc} not configured in .env"}

            target_name = "group" if target == "group" else "owner"

            # Handle file sending
            if content_type == "file":
                return await self._send_file(param, chat_id, target_name)

            # Get renderer
            renderer = self.renderers.get(content_type)
            if not renderer:
                return {"success": False, "error": f"Unknown content type: {content_type}"}

            # Fetch data
            if content_type == "calendar":
                data = self._fetch_calendar_events()
            elif content_type == "priorities":
                data = self._fetch_priorities()
            elif content_type == "contact":
                if not param:
                    return {"success": False, "error": "Contact identifier required (e.g., 'contact:alex')"}
                data = self._fetch_contact(param)
                if not data:
                    return {"success": False, "error": f"Contact not found: {param}"}
            else:
                return {"success": False, "error": f"Unknown content type: {content_type}"}

            # Render as image
            image_bytes = renderer.render_telegram(data)

            # Send to Telegram
            telegram_service = await _get_telegram_service()
            if not telegram_service:
                return {"success": False, "error": "Telegram service not available"}

            success = await telegram_service.send_photo_to_chat(
                chat_id=chat_id,
                photo_bytes=image_bytes,
                caption=None,
            )

            if success:
                return {
                    "success": True,
                    "rendered": "telegram",
                    "target": target_name,
                    "message": f"Sent {content_type} image to Telegram ({target_name})",
                }
            else:
                return {"success": False, "error": "Failed to send image to Telegram"}

        except Exception as e:
            logger.exception(f"Error in show_content: {e}")
            return {"success": False, "error": str(e)}

    async def _send_file(self, param: Optional[str], chat_id: int, target_name: str) -> Dict[str, Any]:
        """Send a file to Telegram."""
        if not param:
            return {"success": False, "error": "File path required (e.g., 'file:/path/to/doc.pdf')"}

        from pathlib import Path
        file_path = Path(param)
        if not file_path.exists():
            return {"success": False, "error": f"File not found: {param}"}

        telegram_service = await _get_telegram_service()
        if not telegram_service:
            return {"success": False, "error": "Telegram service not available"}

        success = await telegram_service.send_document_to_chat(
            chat_id=chat_id,
            file_path=str(file_path),
            caption=None,
        )

        if success:
            return {
                "success": True,
                "rendered": "telegram",
                "target": target_name,
                "message": f"Sent document '{file_path.name}' to Telegram ({target_name})",
            }
        else:
            return {"success": False, "error": "Failed to send document to Telegram"}


# Global instance
_show_service = None


def get_show_service() -> ShowService:
    """Get or create show service instance."""
    global _show_service
    if _show_service is None:
        _show_service = ShowService()
    return _show_service


async def show_content(what: str, target: str = "auto") -> Dict[str, Any]:
    """Convenience function for showing content.

    Args:
        what: Content to show
        target: "owner", "group", or "auto"

    Returns:
        Result dict
    """
    service = get_show_service()
    return await service.show_content(what, target)
