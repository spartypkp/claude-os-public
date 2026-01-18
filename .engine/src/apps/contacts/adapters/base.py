"""Base adapter interface for contacts providers.

All contacts providers implement this interface. The ContactsService uses
adapters interchangeably, allowing seamless switching between providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class ProviderType(str, Enum):
    """Supported contacts provider types."""
    APPLE = "apple"
    GOOGLE = "google"
    CARDDAV = "carddav"
    LOCAL = "local"


@dataclass
class AdapterConfig:
    """Configuration for a contacts adapter."""
    provider: ProviderType
    name: str
    enabled: bool = True
    config: Dict[str, Any] = field(default_factory=dict)
    last_sync: Optional[str] = None


@dataclass
class ContactInfo:
    """Contact information from any provider."""
    id: str
    name: str
    provider: ProviderType = ProviderType.LOCAL
    
    # Contact details
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nickname: Optional[str] = None
    
    # Communication
    phones: List[Dict[str, str]] = field(default_factory=list)  # [{"type": "mobile", "value": "+1234567890"}]
    emails: List[Dict[str, str]] = field(default_factory=list)  # [{"type": "work", "value": "..."}]
    
    # Organization
    company: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    
    # Addresses
    addresses: List[Dict[str, str]] = field(default_factory=list)
    
    # Social/URLs
    urls: List[Dict[str, str]] = field(default_factory=list)
    social_profiles: List[Dict[str, str]] = field(default_factory=list)
    
    # Notes and metadata
    notes: Optional[str] = None
    birthday: Optional[str] = None
    
    # Claude OS extensions
    relationship: Optional[str] = None  # friend, colleague, family, etc.
    context_notes: Optional[str] = None  # Claude's context about this person
    tags: List[str] = field(default_factory=list)
    pinned: bool = False
    
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Provider-specific
    external_id: Optional[str] = None
    etag: Optional[str] = None
    photo_url: Optional[str] = None
    
    @property
    def primary_phone(self) -> Optional[str]:
        """Get primary phone number."""
        if self.phones:
            return self.phones[0].get('value')
        return None
    
    @property
    def primary_email(self) -> Optional[str]:
        """Get primary email."""
        if self.emails:
            return self.emails[0].get('value')
        return None
    
    @property
    def display_name(self) -> str:
        """Get display name."""
        if self.name:
            return self.name
        if self.first_name or self.last_name:
            return f"{self.first_name or ''} {self.last_name or ''}".strip()
        if self.primary_email:
            return self.primary_email
        return "Unknown"


@dataclass
class ContactCreate:
    """Data for creating a new contact."""
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phones: List[Dict[str, str]] = field(default_factory=list)
    emails: List[Dict[str, str]] = field(default_factory=list)
    company: Optional[str] = None
    job_title: Optional[str] = None
    notes: Optional[str] = None
    relationship: Optional[str] = None
    context_notes: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    pinned: bool = False


@dataclass
class ContactUpdate:
    """Data for updating a contact."""
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phones: Optional[List[Dict[str, str]]] = None
    emails: Optional[List[Dict[str, str]]] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    notes: Optional[str] = None
    relationship: Optional[str] = None
    context_notes: Optional[str] = None
    tags: Optional[List[str]] = None
    pinned: Optional[bool] = None


@dataclass
class ContactGroup:
    """A group/label for contacts."""
    id: str
    name: str
    provider: ProviderType = ProviderType.LOCAL
    member_count: int = 0


class ContactsAdapter(ABC):
    """Abstract base class for contacts provider adapters."""
    
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
        """Check if this adapter is available and configured."""
        pass
    
    @abstractmethod
    def get_contacts(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ContactInfo]:
        """Get all contacts."""
        pass
    
    @abstractmethod
    def get_contact(self, contact_id: str) -> Optional[ContactInfo]:
        """Get a single contact by ID."""
        pass
    
    @abstractmethod
    def search_contacts(
        self,
        query: str,
        limit: int = 20,
    ) -> List[ContactInfo]:
        """Search contacts by name, phone, or email."""
        pass
    
    @abstractmethod
    def create_contact(self, contact: ContactCreate) -> Optional[ContactInfo]:
        """Create a new contact."""
        pass
    
    @abstractmethod
    def update_contact(
        self,
        contact_id: str,
        update: ContactUpdate,
    ) -> Optional[ContactInfo]:
        """Update an existing contact."""
        pass
    
    @abstractmethod
    def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact."""
        pass
    
    def get_groups(self) -> List[ContactGroup]:
        """Get contact groups/labels. Default: empty list."""
        return []
    
    def get_contacts_in_group(self, group_id: str, limit: int = 100) -> List[ContactInfo]:
        """Get contacts in a group. Default: empty list."""
        return []
    
    def sync(self) -> bool:
        """Sync with the remote provider. Default: do nothing."""
        return True
    
    def test_connection(self) -> tuple[bool, str]:
        """Test the connection to this provider."""
        if self.is_available():
            return True, "Connected"
        return False, "Not available"

