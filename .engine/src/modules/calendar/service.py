"""Calendar service - Direct-read Apple Calendar integration.

The CalendarService provides unified access to calendar functionality:
- Reads directly from Apple Calendar SQLite (no cache)
- Uses AppleScript for mutations (create/update/delete)
- Supports calendar aliases and preferences via config

Architecture (matching email's direct-read pattern):
    CalendarService
        └── AppleCalendarAdapter (primary, always active on macOS)
            ├── Reads from ~/Library/Calendars/Calendar.sqlitedb
            └── Writes via AppleScript
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, List, Optional, TYPE_CHECKING

from .models import (
    CalendarEvent,
    CalendarInfo,
    EventCreate,
    EventUpdate,
)
from .providers import AppleCalendarAdapter, CalendarAdapter
from .repository import CalendarRepository

if TYPE_CHECKING:
    from core.database import SystemStorage

logger = logging.getLogger(__name__)


class CalendarService:
    """Service for calendar operations using direct Apple Calendar reads."""

    def __init__(self, storage: SystemStorage):
        """Initialize calendar service.

        Args:
            storage: SystemStorage instance for settings access.
        """
        self.storage = storage
        self.repository = CalendarRepository(storage)
        self.adapter: Optional[CalendarAdapter] = None

        # Load calendar config from accounts table
        self._preferred_calendars: List[str] = []
        self._aliases: Dict[str, str] = {}
        self._defaults: Dict[str, str] = {}
        self._load_account_calendars()

        # Initialize Apple adapter (primary and only adapter for now)
        self._init_adapter()

    def _load_account_calendars(self) -> None:
        """Load calendar preferences from unified accounts table."""
        preferred, aliases, defaults = self.repository.load_account_calendars()

        if not preferred:
            # Fallback to hardcoded defaults if no config found
            logger.warning("No calendar config in accounts, using fallback defaults")
            self._preferred_calendars = ["Personal", "Calendar", "Work", "Home"]
            self._aliases = {
                "exchange": "Calendar",
                "personal": "Calendar",
                "gmail": "Personal",
                "work": "Work",
            }
            self._defaults = {
                "meeting": "Personal",
                "personal": "Calendar",
                "work": "Work",
                "fallback": "Personal",
            }
        else:
            self._preferred_calendars = preferred
            self._aliases = aliases
            self._defaults = defaults

    def get_preferred_calendars(self) -> List[str]:
        """Get all preferred calendars across enabled accounts."""
        return self._preferred_calendars.copy()

    def get_aliases(self) -> Dict[str, str]:
        """Get calendar name aliases."""
        return self._aliases.copy()

    def get_default_calendar(self, event_type: Optional[str] = None) -> str:
        """Get default calendar for an event type.

        Args:
            event_type: Optional type - 'meeting', 'personal', 'work', or None for fallback

        Returns:
            Calendar name to use
        """
        if event_type and event_type in self._defaults:
            return self._defaults[event_type]
        return self._defaults.get("fallback", self._preferred_calendars[0] if self._preferred_calendars else "Calendar")

    def _init_adapter(self):
        """Initialize Apple Calendar adapter."""
        apple = AppleCalendarAdapter(
            preferred_only=True,
            preferred_calendars=self._preferred_calendars,
            aliases=self._aliases,
            default_calendar=self.get_default_calendar(),
        )
        if apple.is_available():
            self.adapter = apple
            logger.info("Apple Calendar adapter initialized (direct-read mode)")
        else:
            logger.warning("Apple Calendar not available - calendar features disabled")

    # =========================================================================
    # Calendar Operations (Direct Read)
    # =========================================================================

    def get_calendars(self, provider_type: Optional[str] = None) -> List[CalendarInfo]:
        """Get available calendars.

        Returns preferred calendars from Apple Calendar.

        Args:
            provider_type: Ignored (kept for API compatibility).

        Returns:
            List of CalendarInfo from Apple Calendar.
        """
        if not self.adapter:
            return []

        try:
            return self.adapter.get_calendars()
        except Exception as e:
            logger.error(f"Failed to get calendars: {e}")
            return []

    def get_events(
        self,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        calendar_id: Optional[str] = None,
        provider_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[CalendarEvent]:
        """Get events from Apple Calendar.

        Args:
            start: Start of date range.
            end: End of date range.
            calendar_id: Optional calendar filter (name, alias, or UUID).
            provider_type: Ignored (kept for API compatibility).
            limit: Maximum events to return.

        Returns:
            List of CalendarEvent sorted by start time.
        """
        if not self.adapter:
            return []

        try:
            return self.adapter.get_events(
                calendar_id=calendar_id,
                start=start,
                end=end,
                limit=limit,
            )
        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []

    def get_event(
        self,
        event_id: str,
        calendar_id: Optional[str] = None,
        provider_type: Optional[str] = None,
    ) -> Optional[CalendarEvent]:
        """Get a single event by ID.

        Args:
            event_id: Event UUID.
            calendar_id: Optional calendar filter.
            provider_type: Ignored (kept for API compatibility).

        Returns:
            CalendarEvent if found, None otherwise.
        """
        if not self.adapter:
            return None

        try:
            return self.adapter.get_event(event_id, calendar_id)
        except Exception as e:
            logger.error(f"Failed to get event: {e}")
            return None

    def create_event(
        self,
        event: EventCreate,
        provider_type: Optional[str] = None,
    ) -> Optional[CalendarEvent]:
        """Create a new event via AppleScript.

        Args:
            event: Event details.
            provider_type: Ignored (kept for API compatibility).

        Returns:
            Created CalendarEvent if successful.
        """
        if not self.adapter:
            logger.error("No calendar adapter available")
            return None

        try:
            return self.adapter.create_event(event)
        except Exception as e:
            logger.error(f"Failed to create event: {e}")
            return None

    def update_event(
        self,
        event_id: str,
        update: EventUpdate,
        calendar_id: Optional[str] = None,
        provider_type: Optional[str] = None,
    ) -> Optional[CalendarEvent]:
        """Update an existing event via AppleScript.

        Args:
            event_id: Event UUID.
            update: Fields to update.
            calendar_id: Optional calendar context.
            provider_type: Ignored (kept for API compatibility).

        Returns:
            Updated CalendarEvent if successful.
        """
        if not self.adapter:
            logger.error("No calendar adapter available")
            return None

        try:
            return self.adapter.update_event(event_id, update, calendar_id)
        except Exception as e:
            logger.error(f"Failed to update event: {e}")
            return None

    def delete_event(
        self,
        event_id: str,
        calendar_id: Optional[str] = None,
        provider_type: Optional[str] = None,
    ) -> bool:
        """Delete an event via AppleScript.

        Args:
            event_id: Event UUID.
            calendar_id: Optional calendar context.
            provider_type: Ignored (kept for API compatibility).

        Returns:
            True if deletion initiated successfully.
        """
        if not self.adapter:
            logger.error("No calendar adapter available")
            return False

        try:
            return self.adapter.delete_event(event_id, calendar_id)
        except Exception as e:
            logger.error(f"Failed to delete event: {e}")
            return False

    def search_events(
        self,
        query: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 20,
    ) -> List[CalendarEvent]:
        """Search for events by summary text.

        Args:
            query: Search text.
            start: Optional start of date range.
            end: Optional end of date range.
            limit: Maximum results.

        Returns:
            List of matching CalendarEvent.
        """
        if not self.adapter:
            return []

        try:
            return self.adapter.search_events(query, start, end, limit)
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    # =========================================================================
    # Settings Access
    # =========================================================================

    def get_setting(self, key: str, default: str = None) -> Optional[str]:
        """Get a calendar setting from system DB.

        Args:
            key: Setting key.
            default: Default value if not found.

        Returns:
            Setting value or default.
        """
        return self.repository.get_setting(key, default)

    def set_setting(self, key: str, value: str) -> bool:
        """Set a calendar setting in system DB.

        Args:
            key: Setting key.
            value: Setting value.

        Returns:
            True if successful.
        """
        return self.repository.set_setting(key, value)

    # =========================================================================
    # Provider Status (Simplified)
    # =========================================================================

    def get_available_providers(self) -> List[dict]:
        """Get provider status (simplified for direct-read pattern).

        Returns single provider: Apple Calendar.
        """
        apple_available = self.adapter is not None

        return [{
            'type': 'apple',
            'name': 'Apple Calendar',
            'description': 'macOS Calendar.app (iCloud, Exchange, Google via CalDAV)',
            'available': apple_available,
            'configured': apple_available,
            'requires_config': False,
        }]

    def test_provider(self, provider_type: str, config: dict = None) -> dict:
        """Test connection to Apple Calendar.

        Args:
            provider_type: Should be 'apple'.
            config: Ignored (Apple doesn't need config).

        Returns:
            Dict with success status and message.
        """
        if provider_type != 'apple':
            return {'success': False, 'error': f"Unknown provider: {provider_type}"}

        if not self.adapter:
            return {'success': False, 'error': 'Apple Calendar not available'}

        try:
            success, message = self.adapter.test_connection()
            return {'success': success, 'message': message}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # =========================================================================
    # Stub Methods (for API compatibility)
    # =========================================================================

    def get_accounts(self) -> List[dict]:
        """Get calendar accounts (stub - returns empty for direct-read mode)."""
        # Direct-read mode doesn't manage accounts
        return []

    def add_account(self, provider_type: str, name: str, config: dict, email: str = None) -> dict:
        """Add account (stub - not supported in direct-read mode)."""
        return {
            'success': False,
            'error': 'Account management not available in direct-read mode. Use Apple System Preferences.'
        }

    def remove_account(self, account_id: str) -> dict:
        """Remove account (stub - not supported in direct-read mode)."""
        return {
            'success': False,
            'error': 'Account management not available in direct-read mode. Use Apple System Preferences.'
        }

    def set_primary_account(self, account_id: str) -> dict:
        """Set primary account (stub - not supported in direct-read mode)."""
        return {
            'success': False,
            'error': 'Account management not available in direct-read mode. Use Apple System Preferences.'
        }

    async def sync_all(self) -> dict:
        """Sync all (stub - not needed in direct-read mode)."""
        # Direct-read mode doesn't need sync - reads directly from Apple Calendar
        return {'apple': {'success': True, 'message': 'Direct-read mode - no sync needed'}}
