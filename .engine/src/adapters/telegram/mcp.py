"""Telegram MCP tools - explicit message sending and chat history.

Auto-forwarding of Chief's transcript always goes to the owner's DM.
This tool is for when Claude wants to explicitly send a message somewhere
else (like a group chat), or read recent chat history for context recovery.

Multi-group support: TELEGRAM_GROUP_CHAT_IDS env var holds comma-separated
group IDs. Use group_id param to target a specific group, or omit to use
the first configured group.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_db

logger = logging.getLogger(__name__)


def _get_group_chat_ids() -> List[int]:
    """Parse TELEGRAM_GROUP_CHAT_IDS env var into list of ints."""
    raw = os.getenv("TELEGRAM_GROUP_CHAT_IDS", "")
    if not raw:
        return []
    return [int(gid.strip()) for gid in raw.split(",") if gid.strip()]

mcp = FastMCP("life-telegram")

# Lazy-init singleton (MCP runs in separate process from FastAPI)
_telegram_service = None
_telegram_service_initialized = False


async def _get_telegram_service():
    """Get or create a send-only Telegram bot instance."""
    global _telegram_service, _telegram_service_initialized

    if _telegram_service_initialized:
        return _telegram_service

    _telegram_service_initialized = True

    try:
        from adapters.telegram.service import TelegramService
        service = TelegramService()

        if service.bot_token and service.authorized_user_id:
            await service.init_bot_only()
            _telegram_service = service
            logger.info("Telegram bot client initialized for MCP tools (send-only)")
        else:
            logger.warning("Telegram credentials not available - telegram tool disabled")
            _telegram_service = None
    except Exception as e:
        logger.error(f"Failed to initialize Telegram bot client for MCP: {e}")
        _telegram_service = None

    return _telegram_service


@mcp.tool()
async def telegram(
    operation: str,
    text: Optional[str] = None,
    target: Optional[str] = None,
    group_id: Optional[str] = None,
    limit: int = 30,
    what: Optional[str] = None,
) -> Dict[str, Any]:
    """Send messages to Telegram or read recent chat history.

    Auto-forwarding handles Chief's transcript -> owner DM automatically.
    Use 'send' when you need to send to a group chat explicitly.
    Use 'read' to recover context from recent Telegram conversations.

    Multiple groups are supported. Use group_id to target a specific group,
    or omit to use the default (first configured) group.

    Args:
        operation: Operation - 'send', 'read', 'info', 'show'
        text: Message text to send (required for send). Supports markdown.
        target: For send: 'group' or 'owner' (default).
                For read: 'group', 'owner', or 'all' (default).
                For show: 'auto' (default), 'owner', or 'group'.
        group_id: Specific group chat ID to target (optional). If omitted
                  with target='group', uses the first configured group.
                  Use telegram("info") to see all configured groups.
        limit: Max messages to return for read (default 30)
        what: Content to show (required for show). Formats:
            - "calendar" -- Today's calendar
            - "contact:{name}" -- Contact card
            - "priorities" -- Today's priorities
            - "file:{path}" -- File preview

    Returns:
        Object with success status

    Examples:
        telegram("send", text="Hello!", target="group")  # default group
        telegram("send", text="Hello!", target="group", group_id="-1001234567890")  # specific group
        telegram("read", target="group", limit=20)  # all groups
        telegram("read", target="group", group_id="-1001234567890")  # specific group
        telegram("read")  # all recent messages
        telegram("info")  # show config and all groups
    """
    try:
        if operation == "info":
            return await _handle_info()

        elif operation == "send":
            return await _handle_send(text, target, group_id)

        elif operation == "read":
            return _handle_read(target or "all", limit, group_id)

        elif operation == "show":
            return await _handle_show(what, target or "auto")

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use 'send', 'read', 'info', or 'show'."}

    except Exception as e:
        return {"success": False, "error": str(e)}


async def _handle_info() -> Dict[str, Any]:
    """Show Telegram configuration and routing info."""
    group_ids = _get_group_chat_ids()
    owner_id = os.getenv("TELEGRAM_USER_ID")
    authorized = os.getenv("TELEGRAM_AUTHORIZED_USERS", "")

    groups = []
    for gid in group_ids:
        group_entry: Dict[str, Any] = {"chat_id": gid}
        try:
            name = await _get_group_name(gid)
            if name:
                group_entry["name"] = name
        except Exception:
            pass
        groups.append(group_entry)

    info = {
        "success": True,
        "owner_chat_id": owner_id,
        "groups_configured": len(group_ids),
        "groups": groups,
        "default_group": group_ids[0] if group_ids else None,
        "authorized_user_ids": [uid.strip() for uid in authorized.split(",") if uid.strip()] if authorized else [],
        "routing": {
            "auto_forward": "Chief transcript always goes to owner DM",
            "explicit_send": "Use telegram('send', target='group') for group messages. Add group_id to target a specific group.",
            "inbound": "Messages tagged [Telegram @username] for DM, [Telegram @username (GroupName)] for group"
        }
    }

    return info


async def _handle_send(text: Optional[str], target: Optional[str], group_id: Optional[str] = None) -> Dict[str, Any]:
    """Send a message to a specific Telegram chat."""
    if not text:
        return {"success": False, "error": "text is required for send"}

    target_name = target or "owner"

    if target_name == "group":
        if group_id:
            chat_id = int(group_id)
        else:
            group_ids = _get_group_chat_ids()
            if not group_ids:
                return {"success": False, "error": "No groups configured in TELEGRAM_GROUP_CHAT_IDS"}
            chat_id = group_ids[0]
    elif target_name == "owner":
        chat_id_str = os.getenv("TELEGRAM_USER_ID")
        if not chat_id_str:
            return {"success": False, "error": "TELEGRAM_USER_ID not configured"}
        chat_id = int(chat_id_str)
    else:
        return {"success": False, "error": f"Unknown target '{target_name}'. Use 'group' or 'owner'."}

    result = await _send(chat_id, text)

    if result["success"]:
        return {"success": True, "target": target_name, "chat_id": chat_id}
    else:
        return {"success": False, "error": result.get("error", "Unknown send failure")}


def _handle_read(target: str, limit: int, group_id: Optional[str] = None) -> Dict[str, Any]:
    """Read recent Telegram messages from the local log."""
    with get_db() as db:
        # Build query based on target
        if target == "group":
            if group_id:
                # Specific group
                rows = db.execute(
                    """SELECT username, message_text, direction, chat_title, created_at
                       FROM telegram_messages
                       WHERE chat_id = ?
                       ORDER BY created_at DESC
                       LIMIT ?""",
                    (int(group_id), limit),
                ).fetchall()
            else:
                # All groups
                group_ids = _get_group_chat_ids()
                if not group_ids:
                    return {"success": False, "error": "No groups configured in TELEGRAM_GROUP_CHAT_IDS"}
                placeholders = ",".join("?" for _ in group_ids)
                rows = db.execute(
                    f"""SELECT username, message_text, direction, chat_title, created_at
                       FROM telegram_messages
                       WHERE chat_id IN ({placeholders})
                       ORDER BY created_at DESC
                       LIMIT ?""",
                    (*group_ids, limit),
                ).fetchall()
        elif target == "owner":
            owner_id_str = os.getenv("TELEGRAM_USER_ID")
            if not owner_id_str:
                return {"success": False, "error": "TELEGRAM_USER_ID not configured"}
            rows = db.execute(
                """SELECT username, message_text, direction, chat_title, created_at
                   FROM telegram_messages
                   WHERE chat_id = ?
                   ORDER BY created_at DESC
                   LIMIT ?""",
                (int(owner_id_str), limit),
            ).fetchall()
        elif target == "all":
            rows = db.execute(
                """SELECT username, message_text, direction, chat_title, created_at
                   FROM telegram_messages
                   ORDER BY created_at DESC
                   LIMIT ?""",
                (limit,),
            ).fetchall()
        else:
            return {"success": False, "error": f"Unknown target '{target}'. Use 'group', 'owner', or 'all'."}

    # Format messages (reverse to chronological order)
    messages: List[Dict[str, str]] = []
    for row in reversed(rows):
        msg = {
            "time": row["created_at"],
            "from": row["username"] if row["direction"] == "inbound" else "claude",
            "text": row["message_text"],
            "direction": row["direction"],
        }
        if row["chat_title"]:
            msg["chat"] = row["chat_title"]
        messages.append(msg)

    return {
        "success": True,
        "target": target,
        "count": len(messages),
        "messages": messages,
    }


async def _send(chat_id: int, text: str) -> Dict[str, Any]:
    """Send message via Telegram bot. Returns dict with success and error details."""
    service = await _get_telegram_service()
    if not service:
        return {"success": False, "error": "Telegram service not initialized (missing bot token or user ID)"}
    try:
        result = await service.send_to_chat(chat_id, text)
        if result:
            return {"success": True}
        else:
            return {"success": False, "error": "send_to_chat returned False (bot application not initialized?)"}
    except Exception as e:
        return {"success": False, "error": f"send_to_chat exception: {type(e).__name__}: {e}"}


async def _handle_show(what: Optional[str], target: str) -> Dict[str, Any]:
    """Render visual content and send to Telegram. Delegates to show service."""
    if not what:
        return {"success": False, "error": "what is required for show (e.g., 'calendar', 'contact:Alex', 'priorities', 'file:/path')"}

    try:
        from modules.show.service import show_content
        return await show_content(what, target)
    except ImportError:
        return {"success": False, "error": "Show module not available"}
    except Exception as e:
        return {"success": False, "error": f"Show failed: {e}"}


async def _get_group_name(group_chat_id: int) -> Optional[str]:
    """Get group chat name by ID."""
    service = await _get_telegram_service()
    if not service or not service.application:
        return None

    try:
        chat = await service.application.bot.get_chat(group_chat_id)
        return chat.title
    except Exception:
        return None
