"""Base adapter interface for email providers.

All email providers implement this interface. The EmailService uses
adapters interchangeably, allowing seamless switching between providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
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


class EmailAdapter(ABC):
    """Abstract base class for email provider adapters.
    
    Implement this interface to add support for a new email provider.
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
    def get_accounts(self) -> List[str]:
        """Get list of email accounts/addresses.
        
        Returns:
            List of account identifiers (usually email addresses).
        """
        pass
    
    @abstractmethod
    def get_mailboxes(self, account: Optional[str] = None) -> List[Mailbox]:
        """Get list of mailboxes.
        
        Args:
            account: Optional account filter.
            
        Returns:
            List of Mailbox objects.
        """
        pass
    
    @abstractmethod
    def get_messages(
        self,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> List[EmailMessage]:
        """Get messages from a mailbox.
        
        Args:
            mailbox: Mailbox name (e.g., "INBOX", "Sent").
            account: Optional account filter.
            limit: Maximum messages to return.
            offset: Pagination offset.
            unread_only: Only return unread messages.
            
        Returns:
            List of EmailMessage objects (without full content).
        """
        pass
    
    @abstractmethod
    def get_message(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> Optional[EmailMessage]:
        """Get a single message with full content.
        
        Args:
            message_id: Message identifier.
            mailbox: Mailbox containing the message.
            account: Optional account filter.
            
        Returns:
            EmailMessage with content, or None if not found.
        """
        pass
    
    @abstractmethod
    def search(
        self,
        query: str,
        mailbox: Optional[str] = None,
        account: Optional[str] = None,
        limit: int = 20,
    ) -> List[EmailMessage]:
        """Search for messages.
        
        Args:
            query: Search query string.
            mailbox: Optional mailbox to search in.
            account: Optional account filter.
            limit: Maximum results.
            
        Returns:
            List of matching EmailMessage objects.
        """
        pass
    
    @abstractmethod
    def create_draft(self, draft: DraftMessage, account: Optional[str] = None) -> bool:
        """Create an email draft.

        Args:
            draft: The draft message to create.
            account: Account to create draft in.

        Returns:
            True if draft was created successfully.
        """
        pass

    def send_message(
        self,
        account_id: str,
        to: List[str],
        subject: str,
        content: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Send an email message.

        This method is optional - not all providers support programmatic sending.
        Adapters that don't support sending should raise NotImplementedError.

        Args:
            account_id: Account ID to send from.
            to: Recipient email addresses.
            subject: Email subject.
            content: Email content (HTML or plain text).
            cc: CC recipients.
            bcc: BCC recipients.

        Returns:
            Dict with:
            - success: Whether send succeeded
            - message_id: Provider's message ID (if sent)
            - error: Error message (if failed)

        Raises:
            NotImplementedError: If this provider doesn't support sending.
        """
        raise NotImplementedError(f"{self.__class__.__name__} does not support sending")

    @abstractmethod
    def mark_read(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Mark a message as read.
        
        Args:
            message_id: Message identifier.
            mailbox: Mailbox containing the message.
            account: Optional account filter.
            
        Returns:
            True if successful.
        """
        pass
    
    @abstractmethod
    def mark_flagged(
        self,
        message_id: str,
        flagged: bool,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Set or clear the flagged status of a message.
        
        Args:
            message_id: Message identifier.
            flagged: True to flag, False to unflag.
            mailbox: Mailbox containing the message.
            account: Optional account filter.
            
        Returns:
            True if successful.
        """
        pass
    
    @abstractmethod
    def delete(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Move a message to trash.
        
        Args:
            message_id: Message identifier.
            mailbox: Mailbox containing the message.
            account: Optional account filter.
            
        Returns:
            True if successful.
        """
        pass
    
    @abstractmethod
    def get_unread_count(self, mailbox: str = "INBOX", account: Optional[str] = None) -> int:
        """Get the unread message count.
        
        Args:
            mailbox: Mailbox to count.
            account: Optional account filter.
            
        Returns:
            Number of unread messages.
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
