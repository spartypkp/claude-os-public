"""Base adapter interface for calendar providers.

All calendar providers implement this interface. The CalendarService uses
adapters interchangeably, allowing seamless switching between providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class ProviderType(str, Enum):
    """Supported calendar provider types."""
    APPLE = "apple"
    GOOGLE = "google"
    CALDAV = "caldav"
    LOCAL = "local"


@dataclass
class AdapterConfig:
    """Configuration for a calendar adapter.
    
    Each provider type has different required fields:
    - APPLE: No config needed (uses system Calendar.app)
    - GOOGLE: client_id, client_secret, refresh_token
    - CALDAV: url, username, password
    - LOCAL: No config needed (uses SQLite)
    """
    provider: ProviderType
    name: str  # Display name for this account
    enabled: bool = True
    
    # Provider-specific config
    config: Dict[str, Any] = field(default_factory=dict)
    
    # Sync settings
    sync_interval_minutes: int = 5
    last_sync: Optional[str] = None


@dataclass
class CalendarInfo:
    """Information about a calendar."""
    id: str
    name: str
    color: Optional[str] = None
    account: Optional[str] = None
    provider: ProviderType = ProviderType.LOCAL
    writable: bool = True
    primary: bool = False


@dataclass
class CalendarEvent:
    """Calendar event data."""
    id: str
    summary: str
    start: datetime
    end: datetime
    all_day: bool = False
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_id: Optional[str] = None
    calendar_name: Optional[str] = None
    provider: ProviderType = ProviderType.LOCAL
    
    # Recurrence
    recurrence_rule: Optional[str] = None
    recurring_event_id: Optional[str] = None
    
    # Organizer/Attendees
    organizer_email: Optional[str] = None
    organizer_name: Optional[str] = None
    attendees: List[Dict[str, Any]] = field(default_factory=list)
    
    # Status
    status: str = "confirmed"  # confirmed, tentative, cancelled
    busy: bool = True
    
    # Metadata
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    etag: Optional[str] = None  # For sync conflict detection


@dataclass
class EventCreate:
    """Data for creating a new event."""
    summary: str
    start: datetime
    end: datetime
    all_day: bool = False
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_id: Optional[str] = None
    recurrence_rule: Optional[str] = None
    attendees: List[str] = field(default_factory=list)


@dataclass
class EventUpdate:
    """Data for updating an event."""
    summary: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_id: Optional[str] = None  # For moving between calendars


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
        pass
    
    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for this provider."""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if this adapter is available and configured.
        
        Returns:
            True if the adapter can be used, False otherwise.
        """
        pass
    
    @abstractmethod
    def get_calendars(self) -> List[CalendarInfo]:
        """Get list of available calendars.
        
        Returns:
            List of CalendarInfo objects.
        """
        pass
    
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
        pass
    
    @abstractmethod
    def get_event(self, event_id: str, calendar_id: Optional[str] = None) -> Optional[CalendarEvent]:
        """Get a single event by ID.
        
        Args:
            event_id: Event identifier.
            calendar_id: Optional calendar ID for efficiency.
            
        Returns:
            CalendarEvent or None if not found.
        """
        pass
    
    @abstractmethod
    def create_event(self, event: EventCreate) -> Optional[CalendarEvent]:
        """Create a new event.
        
        Args:
            event: Event data to create.
            
        Returns:
            Created CalendarEvent or None on failure.
        """
        pass
    
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
        pass
    
    @abstractmethod
    def delete_event(self, event_id: str, calendar_id: Optional[str] = None) -> bool:
        """Delete an event.
        
        Args:
            event_id: Event to delete.
            calendar_id: Optional calendar ID.
            
        Returns:
            True if deleted successfully.
        """
        pass
    
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
        pass
    
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

