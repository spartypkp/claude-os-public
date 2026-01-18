"""Messages MCP tool - Claude interface for iMessage.

Provides the messages() MCP tool for Claude to interact with iMessage.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

# Service injection
_service = None


def set_service(service):
    """Set the messages service (called by app registration)."""
    global _service
    _service = service


def messages(
    operation: str,
    phone: Optional[str] = None,
    chat_id: Optional[str] = None,
    text: Optional[str] = None,
    limit: int = 50,
    query: Optional[str] = None,
    include_archived: bool = False,
) -> Dict[str, Any]:
    """
    Interact with iMessage - read conversations, messages, and send texts.

    Args:
        operation: Operation to perform:
            - 'conversations' - List recent conversations
            - 'read' - Read messages (requires phone or chat_id)
            - 'unread' - Get unread messages
            - 'search' - Search messages (requires query)
            - 'send' - Send a message (requires phone and text)
            - 'status' - Check connection status

        phone: Phone number or email (for read, send)
        chat_id: Conversation ID (for read)
        text: Message text (for send)
        limit: Max results (default 50)
        query: Search query (for search)
        include_archived: Include archived conversations (for conversations)

    Returns:
        Dict with success status and operation-specific data

    Examples:
        messages("conversations")                       # List recent chats
        messages("read", phone="+14155551234")          # Read messages with contact
        messages("read", chat_id="iMessage;...")        # Read by chat ID
        messages("unread")                              # Get unread messages
        messages("search", query="dinner")              # Search for "dinner"
        messages("send", phone="+14155551234", text="Hi!")  # Send message
        messages("status")                              # Check connection
    """
    if _service is None:
        return {"success": False, "error": "Messages service not initialized"}

    try:
        if operation == "conversations":
            conversations = _service.get_conversations(
                limit=limit,
                include_archived=include_archived,
            )
            return {
                "success": True,
                "conversations": conversations,
                "count": len(conversations),
            }

        elif operation == "read":
            if not phone and not chat_id:
                return {"success": False, "error": "phone or chat_id required for read"}

            messages_list = _service.get_messages(
                handle_id=phone,
                chat_id=chat_id,
                limit=limit,
            )
            return {
                "success": True,
                "messages": messages_list,
                "count": len(messages_list),
            }

        elif operation == "unread":
            messages_list = _service.get_unread(limit=limit)
            return {
                "success": True,
                "messages": messages_list,
                "count": len(messages_list),
            }

        elif operation == "search":
            if not query:
                return {"success": False, "error": "query required for search"}

            messages_list = _service.search(query=query, limit=limit)
            return {
                "success": True,
                "messages": messages_list,
                "count": len(messages_list),
                "query": query,
            }

        elif operation == "send":
            if not phone:
                return {"success": False, "error": "phone required for send"}
            if not text:
                return {"success": False, "error": "text required for send"}

            result = _service.send(recipient=phone, text=text)
            return result

        elif operation == "status":
            return _service.test_connection()

        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}",
                "valid_operations": [
                    "conversations",
                    "read",
                    "unread",
                    "search",
                    "send",
                    "status",
                ],
            }

    except Exception as e:
        return {"success": False, "error": str(e)}
