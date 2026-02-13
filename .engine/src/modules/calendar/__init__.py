"""
Calendar Module - Event management across providers.

This is the authoritative location for calendar business logic.

Usage:
    from modules.calendar import get_calendar_service, CalendarEvent

    service = get_calendar_service()
    events = service.get_events(start=datetime.now())

Legacy compatibility (use these for simple scripts/workers):
    from modules.calendar import get_events, get_calendars, CALENDAR_ALIASES
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .service import CalendarService
from .models import (
    CalendarEvent,
    CalendarInfo,
    EventCreate,
    EventUpdate,
    ProviderType,
    AdapterConfig,
)
from .providers import (
    CalendarAdapter,
    AppleCalendarAdapter,
)
from .repository import CalendarRepository

# Singleton service instance (initialized by app loader or adapters)
_calendar_service: CalendarService | None = None


def get_calendar_service() -> CalendarService:
    """Get the calendar service instance.

    Returns:
        CalendarService singleton

    Raises:
        RuntimeError: If service not initialized
    """
    global _calendar_service
    if _calendar_service is None:
        raise RuntimeError("Calendar service not initialized. Call init_calendar_service() first.")
    return _calendar_service


def init_calendar_service(storage) -> CalendarService:
    """Initialize the calendar service singleton.

    Args:
        storage: SystemStorage instance

    Returns:
        Initialized CalendarService
    """
    global _calendar_service
    _calendar_service = CalendarService(storage)
    return _calendar_service


# =============================================================================
# CONFIG LOADING
# =============================================================================

def _get_config() -> Dict[str, Any]:
    """Load calendar config from .engine/config/modules/calendar.yaml"""
    from core.config import get_module_config
    return get_module_config("calendar")


def get_preferred_calendars() -> List[str]:
    """Get list of preferred calendars from config."""
    config = _get_config()
    return config.get("preferred_calendars", ["Personal", "Calendar", "Work", "Home"])


def get_calendar_aliases() -> Dict[str, str]:
    """Get calendar aliases from config."""
    config = _get_config()
    return config.get("aliases", {
        "exchange": "Calendar",
        "personal": "Calendar",
        "gmail": "Personal",
        "work": "Work",
    })


# Legacy constants - now computed from config
# These are kept for backwards compatibility but prefer the functions above
PREFERRED_CALENDARS = ["Personal", "Calendar", "Work", "Home"]  # Default, actual value from config
CALENDAR_ALIASES = {  # Default, actual value from config
    "exchange": "Calendar",
    "personal": "Calendar",
    "gmail": "Personal",
    "work": "Work",
}

# Cached adapter instance for legacy functions
_legacy_adapter: AppleCalendarAdapter | None = None


def _get_legacy_adapter() -> AppleCalendarAdapter:
    """Get or create the legacy adapter instance."""
    global _legacy_adapter
    if _legacy_adapter is None:
        _legacy_adapter = AppleCalendarAdapter(
            preferred_only=True,
            preferred_calendars=get_preferred_calendars(),
            aliases=get_calendar_aliases(),
            default_calendar="Calendar",
        )
    return _legacy_adapter


def get_events(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 50,
    calendar_filter: Optional[str] = None,
    use_preferred: bool = True,
) -> List[Dict[str, Any]]:
    """
    Get calendar events from Apple Calendar.

    Legacy compatibility function - wraps AppleCalendarAdapter.

    Args:
        from_date: Start of date range (default: now - 1 hour)
        to_date: End of date range (default: now + 7 days)
        limit: Maximum number of events to return
        calendar_filter: Optional calendar name to filter by
        use_preferred: If True, only return events from PREFERRED_CALENDARS

    Returns:
        List of event dictionaries with keys:
        - summary, start_ts, end_ts, location, all_day, calendar_name, id, etc.
    """
    adapter = _get_legacy_adapter()

    # Use a non-filtered adapter if use_preferred is False
    if not use_preferred:
        adapter = AppleCalendarAdapter(
            preferred_only=False,
            aliases=get_calendar_aliases(),
        )

    # Get events using the adapter
    events = adapter.get_events(
        calendar_id=calendar_filter,
        start=from_date,
        end=to_date,
        limit=limit,
    )

    # Convert CalendarEvent objects to legacy dict format
    result = []
    for event in events:
        result.append({
            "summary": event.summary,
            "start_ts": event.start.isoformat() if event.start else None,
            "end_ts": event.end.isoformat() if event.end else None,
            "location": event.location,
            "all_day": event.all_day,
            "calendar_name": event.calendar_name,
            "kind": "calendar",
            "id": event.id,
            "organizer_email": event.organizer_email,
            "organizer_name": event.organizer_name,
        })

    return result


def get_calendars() -> List[Dict[str, Any]]:
    """Get list of available calendars.

    Legacy compatibility function - wraps AppleCalendarAdapter.

    Returns:
        List of calendar dictionaries with keys: id, title, UUID
    """
    adapter = AppleCalendarAdapter(preferred_only=False)
    calendars = adapter.get_calendars()

    # Convert CalendarInfo objects to legacy dict format
    return [
        {
            "id": cal.id,
            "name": cal.name,  # Frontend expects 'name', not 'title'
            "title": cal.name,  # Keep for backwards compat
            "UUID": cal.id,
        }
        for cal in calendars
    ]


__all__ = [
    # Service
    "CalendarService",
    "get_calendar_service",
    "init_calendar_service",
    # Models
    "CalendarEvent",
    "CalendarInfo",
    "EventCreate",
    "EventUpdate",
    "ProviderType",
    "AdapterConfig",
    # Providers
    "CalendarAdapter",
    "AppleCalendarAdapter",
    # Repository
    "CalendarRepository",
    # Legacy compatibility
    "get_events",
    "get_calendars",
    "CALENDAR_ALIASES",
    "PREFERRED_CALENDARS",
    # Config functions (preferred)
    "get_preferred_calendars",
    "get_calendar_aliases",
]
