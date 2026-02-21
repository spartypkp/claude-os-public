"""Show MCP tool — Telegram-only visual content rendering."""
from __future__ import annotations

from typing import Any, Dict

from fastmcp import FastMCP

mcp = FastMCP("life-show")


@mcp.tool()
async def show(
    what: str,
    target: str = "auto",
) -> Dict[str, Any]:
    """Render visual output to Telegram.

    This is Telegram-only — does not render to Dashboard or terminal.
    Sends formatted content to the user's Telegram chat.

    Args:
        what: Content to show. Formats:
            - "calendar" — Today's calendar
            - "contact:{name}" — Contact card
            - "priorities" — Today's priorities
            - "file:{path}" — File preview
        target: Where to send:
            - "auto" — Owner DM (default)
            - "owner" — Owner DM
            - "group" — Group chat

    Returns:
        {"success": True, "rendered": "telegram", "target": "owner|group", "message": "..."}
    """
    from .service import show_content
    return await show_content(what, target)
