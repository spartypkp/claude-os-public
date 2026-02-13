"""Messages service - Business logic for iMessage integration.

Direct-read pattern:
- Reads from Apple Messages SQLite database
- AppleScript for sending
- No message caching, no sync (reads fresh from Apple)
- Contact name lookup cache (loads all contacts once for fast resolution)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from .providers import AppleMessagesAdapter, Message, Conversation

logger = logging.getLogger(__name__)


class MessagesService:
    """Message service with direct Apple Messages access.

    Architecture:
    - Direct reads from Apple Messages SQLite
    - AppleScript for sending
    - No local cache (matches calendar/email pattern)
    - Resolves phone numbers to contact names via ContactsService
    - Builds phone → name lookup cache for fast resolution
    """

    def __init__(self, contacts_service=None):
        """Initialize messages service.

        Args:
            contacts_service: Optional ContactsService for name lookups
        """
        self._adapter = AppleMessagesAdapter()
        self._contacts_service = contacts_service
        self._phone_cache: Dict[str, str] = {}  # normalized_phone → name
        self._email_cache: Dict[str, str] = {}  # lowercase_email → name
        self._cache_built = False

    def is_available(self) -> bool:
        """Check if Messages is available."""
        return self._adapter.is_available()

    # === Conversation Operations ===

    def get_conversations(
        self,
        limit: int = 50,
        include_archived: bool = False,
    ) -> List[Dict[str, Any]]:
        """Get list of conversations."""
        conversations = self._adapter.get_conversations(
            limit=limit,
            include_archived=include_archived,
        )
        return [self._conversation_to_dict(c) for c in conversations]

    def get_conversation(self, chat_id: str) -> Optional[Dict[str, Any]]:
        """Get a single conversation by ID."""
        # Get conversations and find the one
        conversations = self._adapter.get_conversations(limit=100)
        for conv in conversations:
            if conv.id == chat_id:
                return self._conversation_to_dict(conv)
        return None

    # === Message Operations ===

    def get_messages(
        self,
        handle_id: Optional[str] = None,
        chat_id: Optional[str] = None,
        limit: int = 50,
        before: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Get messages for a conversation."""
        messages = self._adapter.get_messages(
            handle_id=handle_id,
            chat_id=chat_id,
            limit=limit,
            before=before,
        )
        return [self._message_to_dict(m) for m in messages]

    def get_unread(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get unread messages."""
        messages = self._adapter.get_unread_messages(limit=limit)
        return [self._message_to_dict(m) for m in messages]

    def search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search messages."""
        messages = self._adapter.search_messages(query=query, limit=limit)
        return [self._message_to_dict(m) for m in messages]

    # === Send Operations ===

    def send(self, recipient: str, text: str) -> Dict[str, Any]:
        """Send a message."""
        success = self._adapter.send_message(recipient, text)
        if success:
            logger.info(f"Sent message to {recipient}")
            return {
                "success": True,
                "recipient": recipient,
                "text": text,
            }
        else:
            return {
                "success": False,
                "error": "Failed to send message via AppleScript",
            }

    # === Status ===

    def test_connection(self) -> Dict[str, Any]:
        """Test connection to Messages."""
        success, message = self._adapter.test_connection()
        return {
            "success": success,
            "message": message,
            "provider": "apple",
        }

    # === Helpers ===

    def _normalize_phone(self, phone: str) -> Optional[str]:
        """Normalize phone number to E.164 format for lookup.

        Args:
            phone: Raw phone number

        Returns:
            Normalized phone in E.164 format (+1XXXXXXXXXX) or None
        """
        if not phone:
            return None

        # Remove all non-digit characters
        digits = re.sub(r'\D', '', phone)

        # Convert to E.164
        if len(digits) == 10:
            return f"+1{digits}"
        elif len(digits) == 11 and digits.startswith('1'):
            return f"+{digits}"
        elif len(digits) > 10:
            return f"+{digits}"

        return None

    def _build_contact_cache(self):
        """Build phone/email → name lookup cache from all contacts.

        Loads all contacts once and builds fast lookup dictionaries.
        Much faster than individual searches for each conversation.
        """
        if self._cache_built or not self._contacts_service:
            return

        try:
            logger.info("Building contact lookup cache...")
            contacts = self._contacts_service.list(limit=10000)

            for contact in contacts:
                # Add phone mappings
                if contact.phone:
                    # Store normalized phone
                    normalized = self._normalize_phone(contact.phone)
                    if normalized:
                        self._phone_cache[normalized] = contact.name
                    # Also store as-is for fallback
                    self._phone_cache[contact.phone] = contact.name

                # Add email mappings
                if contact.email:
                    self._email_cache[contact.email.lower()] = contact.name

            self._cache_built = True
            logger.info(f"Contact cache built: {len(self._phone_cache)} phones, {len(self._email_cache)} emails")

        except Exception as e:
            logger.error(f"Failed to build contact cache: {e}")

    def _resolve_display_name(self, display_name: str, participants: List[str]) -> str:
        """Resolve phone number/email to contact name if possible.

        Args:
            display_name: Raw display name (may be phone/email/chat ID)
            participants: List of participant handles

        Returns:
            Contact name if found, otherwise original display_name
        """
        if not self._contacts_service:
            return display_name

        # Build cache on first use
        if not self._cache_built:
            self._build_contact_cache()

        # If display_name looks like a phone number or email, try lookup
        if '+' in display_name or '@' in display_name or display_name.startswith('chat'):
            # Try first participant
            if participants:
                handle = participants[0]

                # Try phone lookup
                if '+' in handle or handle.replace('-', '').replace('(', '').replace(')', '').replace(' ', '').isdigit():
                    # Normalize and check cache
                    normalized = self._normalize_phone(handle)
                    if normalized and normalized in self._phone_cache:
                        return self._phone_cache[normalized]

                    # Try as-is
                    if handle in self._phone_cache:
                        return self._phone_cache[handle]

                # Try email lookup
                if '@' in handle:
                    email_lower = handle.lower()
                    if email_lower in self._email_cache:
                        return self._email_cache[email_lower]

        return display_name

    def _conversation_to_dict(self, conv: Conversation) -> Dict[str, Any]:
        """Convert Conversation to dict."""
        # Resolve display name to contact name if possible
        display_name = self._resolve_display_name(conv.display_name, conv.participants)

        return {
            "id": conv.id,
            "display_name": display_name,
            "participants": conv.participants,
            "service": conv.service,
            "last_message_date": conv.last_message_date.isoformat() if conv.last_message_date else None,
            "last_message_text": conv.last_message_text,
            "unread_count": conv.unread_count,
            "is_group": conv.is_group,
            "provider": conv.provider.value,
        }

    def _message_to_dict(self, msg: Message) -> Dict[str, Any]:
        """Convert Message to dict."""
        return {
            "id": msg.id,
            "text": msg.text,
            "date": msg.date.isoformat() if msg.date else None,
            "is_from_me": msg.is_from_me,
            "is_read": msg.is_read,
            "handle_id": msg.handle_id,
            "service": msg.service,
            "chat_id": msg.chat_id,
            "has_attachments": msg.has_attachments,
            "reply_to_guid": msg.reply_to_guid,
            "provider": msg.provider.value,
        }
