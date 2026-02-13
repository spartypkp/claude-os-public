"""Timeline MCP tool - Session event logging."""
from __future__ import annotations

import os
from typing import Any, Dict

from fastmcp import FastMCP

from core.mcp_helpers import get_current_session_role
from core.timeline import log_session_event

mcp = FastMCP("life-timeline")


@mcp.tool()
def timeline(description: str) -> Dict[str, Any]:
    """Add entry to today's timeline.

    Timestamp and role/mode auto-detected. Just provide description.

    Args:
        description: What happened (1-2 sentences)

    Returns:
        Object with success status and entry logged

    Example:
        timeline("Morning check-in")
        timeline("Completed API refactor, 3 endpoints updated")
        timeline("Mock interview prep session")
    """
    role = get_current_session_role() or "chief"
    mode = os.environ.get("CLAUDE_SESSION_MODE", "interactive")

    return log_session_event(description, role, mode)
