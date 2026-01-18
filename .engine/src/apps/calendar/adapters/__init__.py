"""Calendar adapters - Provider implementations for calendar integration.

The adapter pattern allows Calendar to work with multiple providers:
- Apple Calendar (via direct SQLite + AppleScript) - macOS only
- Google Calendar (via API) - requires OAuth2
- CalDAV (generic protocol) - works with many providers
- Local (SQLite-backed) - always available, offline-first

Architecture:
    CalendarService
        ↓ uses
    CalendarAdapter (abstract)
        ↓ implementations
    AppleCalendarAdapter, GoogleCalendarAdapter, CalDAVAdapter, LocalCalendarAdapter

Local-first philosophy:
- Local adapter always works (no external deps)
- External adapters sync TO local storage
- UI reads from local, writes sync to provider

Provider Coverage:
    Apple Calendar  → macOS Calendar.app (iCloud, Exchange, Google via CalDAV)
    Google Calendar → Google accounts (OAuth2)
    CalDAV          → Generic CalDAV servers (Fastmail, ProtonMail, NextCloud, etc.)
    Local           → Offline storage / testing
"""

from .base import (
    CalendarAdapter,
    AdapterConfig,
    ProviderType,
    CalendarInfo,
    CalendarEvent,
    EventCreate,
    EventUpdate,
)
from .apple import AppleCalendarAdapter
from .google import GoogleCalendarAdapter
from .caldav import CalDAVAdapter
from .local import LocalCalendarAdapter

__all__ = [
    # Base classes
    'CalendarAdapter',
    'AdapterConfig',
    'ProviderType',
    'CalendarInfo',
    'CalendarEvent',
    'EventCreate',
    'EventUpdate',
    # Adapters
    'AppleCalendarAdapter',
    'GoogleCalendarAdapter',
    'CalDAVAdapter',
    'LocalCalendarAdapter',
]

