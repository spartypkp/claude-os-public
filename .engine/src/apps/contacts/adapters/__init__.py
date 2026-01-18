"""Contacts adapters - Provider implementations for contacts integration.

The adapter pattern allows Contacts to work with multiple providers:
- Apple Contacts (via direct SQLite read) - macOS only
- Google Contacts (via People API) - requires OAuth2
- CardDAV (generic protocol) - works with many providers
- Local (SQLite-backed) - always available, offline-first

Architecture:
    ContactsService
        ↓ uses
    ContactsAdapter (abstract)
        ↓ implementations
    AppleContactsAdapter, GoogleContactsAdapter, CardDAVAdapter, LocalContactsAdapter

Local-first philosophy:
- Local adapter always works (no external deps)
- External adapters sync TO local storage
- UI reads from local, writes sync to provider
"""

from .base import (
    ContactsAdapter,
    AdapterConfig,
    ProviderType,
    ContactInfo,
    ContactCreate,
    ContactUpdate,
    ContactGroup,
)
from .apple import AppleContactsAdapter
from .carddav import CardDAVAdapter
from .local import LocalContactsAdapter

__all__ = [
    # Base classes
    'ContactsAdapter',
    'AdapterConfig',
    'ProviderType',
    'ContactInfo',
    'ContactCreate',
    'ContactUpdate',
    'ContactGroup',
    # Adapters
    'AppleContactsAdapter',
    'CardDAVAdapter',
    'LocalContactsAdapter',
]

