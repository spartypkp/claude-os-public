"""Calendar domain models.

Data structures for calendar events, calendars, and mutations.
"""

from __future__ import annotations

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
