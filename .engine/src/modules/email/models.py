"""Email domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any


class ProviderType(str, Enum):
    """Supported email provider types."""
    GMAIL = "gmail"
    APPLE_MAIL = "apple_mail"


@dataclass
class AdapterConfig:
    """Configuration for an email adapter.

    Each provider type has different required fields:
    - GMAIL: client_id, client_secret, refresh_token
    - APPLE_MAIL: no config required (read-only local DB)
    """
    provider: ProviderType
    name: str  # Display name for this account
    email: Optional[str] = None  # Primary email address
    enabled: bool = True

    # Provider-specific config
    config: Dict[str, Any] = field(default_factory=dict)

    # Sync settings
    sync_interval_minutes: int = 5
    last_sync: Optional[str] = None


@dataclass(frozen=True)
class Mailbox:
    """Mailbox data."""
    id: str
    name: str
    account: str
    unread_count: int
    total_count: int = 0
    provider: ProviderType = ProviderType.APPLE_MAIL


@dataclass(frozen=True)
class EmailMessage:
    """Email message data."""
    id: str
    subject: str
    sender: str
    sender_name: Optional[str]
    recipients: List[str]
    cc: List[str]
    bcc: List[str]
    date_received: str
    date_sent: Optional[str]
    is_read: bool
    is_flagged: bool
    mailbox: str
    account: str
    provider: ProviderType
    content: Optional[str] = None
    html_content: Optional[str] = None
    snippet: Optional[str] = None  # Preview text
    thread_id: Optional[str] = None
    labels: List[str] = field(default_factory=list)
    attachments: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class DraftMessage:
    """Email draft for composing."""
    to: List[str]
    subject: str
    content: str
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    html_content: Optional[str] = None
    reply_to_id: Optional[str] = None
    attachments: Optional[List[str]] = None  # List of file paths
