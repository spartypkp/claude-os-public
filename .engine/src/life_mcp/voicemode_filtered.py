#!/usr/bin/env python3
"""
Filtered VoiceMode MCP Server

Role-based access control for VoiceMode tools. Only exposes:
- converse (voice conversation tool)

Access restricted to:
- Chief (daily partner role)
- Interviewer (live dialogue role)

Other roles (System, Focus, Project, Idea) do NOT see voice tools.
This prevents accidental voice mode usage during technical work.

Service management tools (whisper, kokoro, etc.) are NOT exposed.
Those should be managed via CLI or dashboard, not by Claude.
"""

import logging
import os
import sqlite3
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Path setup - voicemode_filtered.py is at .engine/src/mcp/
REPO_ROOT = Path(__file__).resolve().parents[3]

# Load environment variables from root .env
load_dotenv(REPO_ROOT / ".env")
SYSTEM_ROOT = REPO_ROOT / ".engine"
DB_PATH = SYSTEM_ROOT / "data" / "db" / "system.db"

# Allowed roles for voice access
ALLOWED_ROLES = {"chief", "interviewer"}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)

logger = logging.getLogger(__name__)


def get_db():
    """Get database connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _get_current_session_id() -> Optional[str]:
    """Get current session ID from tmux pane.

    Looks up the session ID from the sessions table using the current tmux pane.
    Returns None if not in tmux or session not found.
    """
    # Get tmux pane from environment
    tmux_pane = os.environ.get("TMUX_PANE")
    if not tmux_pane:
        return None

    try:
        conn = get_db()
        cursor = conn.execute("""
            SELECT session_id FROM sessions
            WHERE tmux_pane = ? AND ended_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
        """, (tmux_pane,))
        row = cursor.fetchone()
        conn.close()
        return row["session_id"] if row else None
    except Exception:
        return None


def _get_current_session_role() -> Optional[str]:
    """Get current session's role (chief, system, focus, project, idea, interviewer).

    Returns None if session not found.
    """
    session_id = _get_current_session_id()
    if not session_id:
        return None

    try:
        conn = get_db()
        cursor = conn.execute(
            "SELECT role FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        row = cursor.fetchone()
        conn.close()
        return row["role"] if row else None
    except Exception:
        return None


def _check_voice_access() -> tuple[bool, Optional[str]]:
    """Check if current session has voice access.

    Returns:
        Tuple of (has_access, error_message)
        - (True, None) if access granted
        - (False, error_message) if access denied
    """
    role = _get_current_session_role()

    if role is None:
        return False, "Cannot determine session role. Voice access denied."

    if role.lower() not in ALLOWED_ROLES:
        return False, f"Voice access is restricted to Chief and Interviewer roles. Your role: {role}"

    return True, None


# Create the FastMCP server
app = FastMCP(
    "VoiceMode (Filtered)",
    dependencies=["voice-mode>=7.0.0"],
)


@app.tool()
async def converse(
    message: str,
    wait_for_response: bool = True,
    listen_duration_max: float = 120.0,
    listen_duration_min: float = 2.0,
    speed: float = 1.0,
) -> str:
    """Have a voice conversation - speak a message and optionally listen for response.

    ROLE RESTRICTION: Only available to Chief and Interviewer roles.

    Args:
        message: The message to speak
        wait_for_response: Listen for response after speaking (default: true)
        listen_duration_max: Max listen time in seconds (default: 120)
        listen_duration_min: Silence timeout - seconds of silence before stopping listen.
            Adjust based on conversation style:
            - 2-3 seconds: quick back-and-forth conversation (default)
            - 8-10 seconds: mock interviews (pauses for thinking through answers)
            - 15-20 seconds: brain dumps, dictation (longer pauses expected)
        speed: Speech rate 0.25-4.0 (default: 1.0, use 1.5 for faster)

    Voice is always Onyx. Microphone access required when wait_for_response=true.
    """
    # Check role-based access
    has_access, error = _check_voice_access()
    if not has_access:
        return f"❌ Access Denied: {error}"

    # Import VoiceMode's converse tool and get underlying function
    try:
        from voice_mode.tools.converse import converse as vm_converse_tool
        # FunctionTool wrapper - get the actual async function via .fn
        vm_converse = vm_converse_tool.fn
    except ImportError as e:
        return f"❌ VoiceMode not installed: {e}\nInstall with: uv tool install voice-mode"

    # Forward to VoiceMode
    try:
        result = await vm_converse(
            message=message,
            wait_for_response=wait_for_response,
            listen_duration_max=listen_duration_max,
            listen_duration_min=listen_duration_min,
            transport="auto",
            room_name="",
            timeout=60.0,
            voice="onyx",
            speed=speed,
            metrics_level="minimal",
        )
        return result
    except Exception as e:
        logger.error(f"VoiceMode error: {e}")
        return f"❌ VoiceMode error: {str(e)}"


def main() -> None:
    """Main entry point for the server."""
    logger.info("Starting VoiceMode (Filtered) MCP Server...")
    logger.info(f"Allowed roles: {', '.join(ALLOWED_ROLES)}")
    logger.info("Tools exposed: converse")
    logger.info("Tools blocked: service (all service management)")

    try:
        app.run()
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
