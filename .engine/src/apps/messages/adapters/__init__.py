"""Messages adapters package."""

from .base import (
    MessagesAdapter,
    Message,
    Conversation,
    ProviderType,
)
from .apple import AppleMessagesAdapter

__all__ = [
    'MessagesAdapter',
    'Message',
    'Conversation',
    'ProviderType',
    'AppleMessagesAdapter',
]
