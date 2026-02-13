"""Base adapter interface for calendar providers.

All calendar providers implement this interface. The CalendarService uses
adapters interchangeably, allowing seamless switching between providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional

from ..models import (
    CalendarEvent,
    CalendarInfo,
    EventCreate,
    EventUpdate,
    ProviderType,
)


class CalendarAdapter(ABC):
    """Abstract base class for calendar provider adapters.

    Implement this interface to add support for a new calendar provider.
    All methods should handle errors gracefully and return empty results
    rather than raising exceptions where possible.
    """

    @property
    @abstractmethod
    def provider_type(self) -> ProviderType:
        """Return the provider type for this adapter."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for this provider."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this adapter is available and configured.

        Returns:
            True if the adapter can be used, False otherwise.
        """

    @abstractmethod
    def get_calendars(self) -> List[CalendarInfo]:
        """Get list of available calendars.

        Returns:
            List of CalendarInfo objects.
        """

    @abstractmethod
    def get_events(
        self,
        calendar_id: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[CalendarEvent]:
        """Get events from calendars.

        Args:
            calendar_id: Optional calendar to filter by.
            start: Start of date range.
            end: End of date range.
            limit: Maximum events to return.

        Returns:
            List of CalendarEvent objects.
        """

    @abstractmethod
    def get_event(self, event_id: str, calendar_id: Optional[str] = None) -> Optional[CalendarEvent]:
        """Get a single event by ID.

        Args:
            event_id: Event identifier.
            calendar_id: Optional calendar ID for efficiency.

        Returns:
            CalendarEvent or None if not found.
        """

    @abstractmethod
    def create_event(self, event: EventCreate) -> Optional[CalendarEvent]:
        """Create a new event.

        Args:
            event: Event data to create.

        Returns:
            Created CalendarEvent or None on failure.
        """

    @abstractmethod
    def update_event(
        self,
        event_id: str,
        update: EventUpdate,
        calendar_id: Optional[str] = None,
    ) -> Optional[CalendarEvent]:
        """Update an existing event.

        Args:
            event_id: Event to update.
            update: Fields to update.
            calendar_id: Optional calendar ID.

        Returns:
            Updated CalendarEvent or None on failure.
        """

    @abstractmethod
    def delete_event(self, event_id: str, calendar_id: Optional[str] = None) -> bool:
        """Delete an event.

        Args:
            event_id: Event to delete.
            calendar_id: Optional calendar ID.

        Returns:
            True if deleted successfully.
        """

    @abstractmethod
    def search_events(
        self,
        query: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 20,
    ) -> List[CalendarEvent]:
        """Search for events.

        Args:
            query: Search query string.
            start: Optional start of date range.
            end: Optional end of date range.
            limit: Maximum results.

        Returns:
            List of matching CalendarEvent objects.
        """

    def sync(self) -> bool:
        """Sync with the remote provider.

        For adapters that cache locally, this fetches updates from the
        remote provider. Default implementation does nothing.

        Returns:
            True if sync was successful.
        """
        return True

    def test_connection(self) -> tuple[bool, str]:
        """Test the connection to this provider.

        Returns:
            Tuple of (success, message).
        """
        if self.is_available():
            return True, "Connected"
        return False, "Not available"
