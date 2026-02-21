"""
Calendar Module - Event management via Apple Calendar.

Usage:
    from modules.calendar import get_calendar_service, CalendarEvent

    service = get_calendar_service()
    events = service.get_events(start=datetime.now())
"""

from __future__ import annotations

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

# Singleton service instance
_calendar_service: CalendarService | None = None


def get_calendar_service() -> CalendarService:
    """Get or create the calendar service singleton."""
    global _calendar_service
    if _calendar_service is None:
        from core.config import settings
        from core.storage import SystemStorage
        storage = SystemStorage(settings.db_path)
        _calendar_service = CalendarService(storage)
    return _calendar_service


def init_calendar_service(storage) -> CalendarService:
    """Initialize the calendar service singleton."""
    global _calendar_service
    _calendar_service = CalendarService(storage)
    return _calendar_service


__all__ = [
    "CalendarService",
    "get_calendar_service",
    "init_calendar_service",
    "CalendarEvent",
    "CalendarInfo",
    "EventCreate",
    "EventUpdate",
    "ProviderType",
    "AdapterConfig",
    "CalendarAdapter",
    "AppleCalendarAdapter",
    "CalendarRepository",
]
