"""Contact providers - Adapters for different contact sources.

Providers handle access to external contact systems:
- Apple Contacts (macOS native)
- CardDAV servers
- Local storage
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
