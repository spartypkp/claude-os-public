"""Base adapter for messages providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List, Optional


class ProviderType(str, Enum):
    """Message provider types."""
    APPLE = "apple"
    LOCAL = "local"


@dataclass
class Message:
    """A single message."""
    id: str
    text: Optional[str]
    date: datetime
    is_from_me: bool
    is_read: bool
    handle_id: str  # Phone number or email
    service: str  # iMessage, SMS, RCS
    # Optional fields
    chat_id: Optional[str] = None
    has_attachments: bool = False
    reply_to_guid: Optional[str] = None
    provider: ProviderType = ProviderType.APPLE


@dataclass
class Conversation:
    """A conversation (chat) with one or more participants."""
    id: str
    display_name: Optional[str]
    participants: List[str]  # List of handle IDs (phone/email)
    service: str
    last_message_date: Optional[datetime] = None
    last_message_text: Optional[str] = None
    unread_count: int = 0
    is_group: bool = False
    provider: ProviderType = ProviderType.APPLE


class MessagesAdapter(ABC):
    """Abstract base class for message adapters."""

    @property
    @abstractmethod
    def provider_type(self) -> ProviderType:
        """Return the provider type."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Return human-readable name."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this adapter is available."""

    @abstractmethod
    def get_conversations(
        self,
        limit: int = 50,
        include_archived: bool = False,
    ) -> List[Conversation]:
        """Get list of conversations."""

    @abstractmethod
    def get_messages(
        self,
        handle_id: Optional[str] = None,
        chat_id: Optional[str] = None,
        limit: int = 50,
        before: Optional[datetime] = None,
    ) -> List[Message]:
        """Get messages for a conversation."""

    @abstractmethod
    def get_unread_messages(self, limit: int = 50) -> List[Message]:
        """Get unread messages across all conversations."""

    @abstractmethod
    def send_message(self, recipient: str, text: str) -> bool:
        """Send a message to a recipient."""

    @abstractmethod
    def mark_read(self, message_id: str) -> bool:
        """Mark a message as read."""

    @abstractmethod
    def test_connection(self) -> tuple[bool, str]:
        """Test connection to the message provider."""
