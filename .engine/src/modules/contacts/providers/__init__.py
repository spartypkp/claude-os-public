"""Contact providers - Adapters for different contact sources."""

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
]
