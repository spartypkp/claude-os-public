"""Show MCP tool - Visual content rendering for Telegram and Dashboard."""
from __future__ import annotations

from typing import Any, Dict

from fastmcp import FastMCP

mcp = FastMCP("life-show")


@mcp.tool()
async def show(
    what: str,
    destination: str = "auto"
) -> Dict[str, Any]:
    """Render visual output for the given content type.

    Args:
        what: Content to show. Formats:
            - "calendar" — Today's calendar
            - "calendar:week" — This week's calendar
            - "contact:{name}" — Contact card
            - "priorities" — Today's priorities
            - "specialists" — Active specialists
            - "diagram:{name}" — Mermaid diagram
            - "file:{path}" — File preview
        destination: Where to render
            - "auto" — Detect from message source
            - "telegram" — Force Telegram (image)
            - "dashboard" — Force Dashboard (component)

    Returns:
        {"success": True, "rendered": "telegram|dashboard", "message": "..."}
    """
    from .service import show_content
    return await show_content(what, destination)
