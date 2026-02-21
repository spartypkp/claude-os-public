"""Messages MCP tool - iMessage read/send via Apple Messages."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastmcp import FastMCP

from modules.accounts.access import get_access_service

mcp = FastMCP("life-messages")


@mcp.tool()
def messages(
    operation: str,
    recipient: Optional[str] = None,
    text: Optional[str] = None,
    chat_id: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """iMessage operations - read conversations, search, and send messages.

    IMPORTANT: Send operations are restricted by default via tool_tracking hook.
    Only enabled during explicitly authorized sessions (e.g., testing, specific
    user directives). Read operations are always available.

    Args:
        operation: Operation - 'conversations', 'read', 'unread', 'search', 'send', 'test'

        # Read operations
        recipient: Phone number or email to read messages from (for read)
        chat_id: Chat GUID to read messages from (alternative to recipient)
        query: Search query (required for search)
        limit: Max results (default 50)

        # Send operations
        recipient: Phone number or email to send to (required for send)
        text: Message text (required for send)

    Returns:
        Object with success status and operation-specific data

    Examples:
        # List recent conversations
        messages("conversations", limit=20)

        # Read messages from a contact
        messages("read", recipient="+14155551234", limit=30)
        messages("read", recipient="dan@example.com")

        # Get unread messages
        messages("unread")

        # Search messages
        messages("search", query="lunch tomorrow")

        # Send a message
        messages("send", recipient="danbotmorgan@gmail.com", text="Hello from Claude!")

        # Test connection
        messages("test")

    Privacy:
        - Reads directly from local macOS Messages database (no external servers)
        - Sends via AppleScript through Messages.app
        - Send operations are gated by role-based access controls in tool_tracking hook
    """
    try:
        from . import get_messages_service
        service = get_messages_service()

        if operation == "conversations":
            return _list_conversations(service, limit)
        elif operation == "read":
            return _read_messages(service, recipient, chat_id, limit)
        elif operation == "unread":
            return _get_unread(service, limit)
        elif operation == "search":
            return _search_messages(service, query, limit)
        elif operation == "send":
            return _send_message(service, recipient, text)
        elif operation == "test":
            return service.test_connection()
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use conversations, read, unread, search, send, or test"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


def _list_conversations(service, limit: int) -> Dict[str, Any]:
    """List recent conversations."""
    conversations = service.get_conversations(limit=limit)
    return {
        "success": True,
        "count": len(conversations),
        "conversations": conversations,
    }


def _read_messages(service, handle: Optional[str], chat_id: Optional[str], limit: int) -> Dict[str, Any]:
    """Read messages from a conversation."""
    if not handle and not chat_id:
        return {"success": False, "error": "recipient or chat_id required for read"}

    messages = service.get_messages(handle_id=handle, chat_id=chat_id, limit=limit)

    # Fire-and-forget contact signal
    try:
        from core.mcp_helpers import get_services
        from modules.contacts.signals import process_message_signals
        from modules.contacts.standalone import StandaloneContactsRepository
        repo = StandaloneContactsRepository(get_services().storage)
        process_message_signals(messages, repo)
    except Exception:
        pass  # Never block message operations

    return {
        "success": True,
        "count": len(messages),
        "messages": messages,
    }


def _get_unread(service, limit: int) -> Dict[str, Any]:
    """Get unread messages."""
    messages = service.get_unread(limit=limit)

    # Fire-and-forget contact signal
    try:
        from core.mcp_helpers import get_services
        from modules.contacts.signals import process_message_signals
        from modules.contacts.standalone import StandaloneContactsRepository
        repo = StandaloneContactsRepository(get_services().storage)
        process_message_signals(messages, repo)
    except Exception:
        pass  # Never block message operations

    return {
        "success": True,
        "count": len(messages),
        "messages": messages,
    }


def _search_messages(service, query: Optional[str], limit: int) -> Dict[str, Any]:
    """Search messages by text."""
    if not query:
        return {"success": False, "error": "query required for search operation"}

    messages = service.search(query=query, limit=limit)
    return {
        "success": True,
        "count": len(messages),
        "query": query,
        "messages": messages,
    }


def _send_message(service, recipient: Optional[str], text: Optional[str]) -> Dict[str, Any]:
    """Send a message."""
    # Access tier check — send requires assist or higher
    try:
        access = get_access_service()
        if not access.can_assist('messages'):
            return {
                "success": False,
                "error": "Messages access is set to 'Read' mode. Change to 'Assist' in Settings to enable sending."
            }
    except RuntimeError:
        pass  # AccessService not initialized

    if not recipient:
        return {"success": False, "error": "recipient required for send"}
    if not text:
        return {"success": False, "error": "text required for send"}

    result = service.send(recipient=recipient, text=text)

    if result.get("success"):
        from core.timeline import log_system_event
        log_system_event(f'iMessage sent to {recipient}')

    return result
