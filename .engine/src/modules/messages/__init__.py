"""Messages module - iMessage integration for Claude OS.

Provides:
- Direct-read from macOS Messages database (chat.db)
- HTTP API at /api/messages/*
- MCP tool: messages(operation, ...)
- AppleScript for sending messages

Usage:
    from modules.messages import MessagesService, get_messages_service

    service = get_messages_service()
    convos = service.get_conversations()
"""

from .service import MessagesService

# Singleton service
_service: MessagesService | None = None


def get_messages_service() -> MessagesService:
    """Get or create MessagesService singleton."""
    global _service
    if _service is None:
        # Try to get contacts service for name lookups (optional)
        contacts_service = None
        try:
            from modules.contacts import get_contacts_service
            contacts_service = get_contacts_service()
        except Exception:
            pass  # Contacts service may not be available
        _service = MessagesService(contacts_service=contacts_service)
    return _service


__all__ = ["MessagesService", "get_messages_service"]
