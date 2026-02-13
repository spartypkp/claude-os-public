"""Base adapter interface for email providers.

All email providers implement this interface. The EmailService uses
adapters interchangeably, allowing seamless switching between providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any

from ..models import (
    ProviderType,
    AdapterConfig,
    Mailbox,
    EmailMessage,
    DraftMessage,
)


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

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for this provider."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this adapter is available and configured.

        Returns:
            True if the adapter can be used, False otherwise.
        """

    @abstractmethod
    def get_accounts(self) -> List[str]:
        """Get list of email accounts/addresses.

        Returns:
            List of account identifiers (usually email addresses).
        """

    @abstractmethod
    def get_mailboxes(self, account: Optional[str] = None) -> List[Mailbox]:
        """Get list of mailboxes.

        Args:
            account: Optional account filter.

        Returns:
            List of Mailbox objects.
        """

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

    @abstractmethod
    def create_draft(self, draft: DraftMessage, account: Optional[str] = None) -> bool:
        """Create an email draft.

        Args:
            draft: The draft message to create.
            account: Account to create draft in.

        Returns:
            True if draft was created successfully.
        """

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

    @abstractmethod
    def get_unread_count(self, mailbox: str = "INBOX", account: Optional[str] = None) -> int:
        """Get the unread message count.

        Args:
            mailbox: Mailbox to count.
            account: Optional account filter.

        Returns:
            Number of unread messages.
        """

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
