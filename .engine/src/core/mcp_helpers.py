"""Shared helpers for MCP tools.

These utilities are used across multiple MCP tool modules.
Moved from adapters/life_mcp/tools/helpers.py to core/ so domains can import cleanly.

Key exports:
- PACIFIC: User's timezone (America/Los_Angeles)
- REPO_ROOT, SYSTEM_ROOT, DB_PATH: Path constants
- get_db: Database context manager
- get_services: Get storage and common services
- get_current_session_id/role/mode: Session context helpers
- normalize_phone, find_contact: Contact utilities
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

from .config import settings
from .database import get_db
from .storage import SystemStorage

# Re-export commonly used constants
PACIFIC = settings.timezone
REPO_ROOT = settings.repo_root
SYSTEM_ROOT = settings.engine_dir
DB_PATH = settings.db_path


# =============================================================================
# SERVICE HELPERS
# =============================================================================

class _Services:
    """Simple container for common services."""
    def __init__(self):
        self._storage = None

    @property
    def storage(self) -> SystemStorage:
        if self._storage is None:
            self._storage = SystemStorage(DB_PATH)
        return self._storage


_services_instance: _Services | None = None


def get_services() -> _Services:
    """Get common services container.

    Returns an object with a .storage attribute for database access.
    Used by MCP tools to get storage instance.
    """
    global _services_instance
    if _services_instance is None:
        _services_instance = _Services()
    return _services_instance


# =============================================================================
# SESSION HELPERS
# =============================================================================

def get_current_session_id() -> Optional[str]:
    """Get current session_id.

    Priority:
    1. CLAUDE_SESSION_ID env var (if explicitly set)
    2. Look up by TMUX_PANE (reliable - each Claude runs in its own pane)

    Session is created by session_register.py hook on SessionStart.
    No guessing based on 'most recent' - that picks wrong session.
    """
    # Explicit session ID (rarely used)
    explicit_id = os.environ.get('CLAUDE_SESSION_ID')
    if explicit_id:
        return explicit_id

    # Look up by tmux pane (primary method - hook stores tmux_pane)
    tmux_pane = os.environ.get('TMUX_PANE')
    if tmux_pane:
        try:
            with get_db() as conn:
                cursor = conn.execute("""
                    SELECT session_id FROM sessions
                    WHERE tmux_pane = ? AND ended_at IS NULL
                    ORDER BY last_seen_at DESC
                    LIMIT 1
                """, (tmux_pane,))
                row = cursor.fetchone()
                return row["session_id"] if row else None
        except Exception:
            return None

    return None


def get_current_session_role() -> Optional[str]:
    """Get current session's role (chief, system, focus, project, idea).

    Returns None if session not found.
    """
    session_id = get_current_session_id()
    if not session_id:
        return None

    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT role FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            return row["role"] if row else None
    except Exception:
        return None


def get_current_session_mode() -> Optional[str]:
    """Get current session's mode (interactive, background, mission).

    Returns None if session not found. Defaults to 'interactive' for safety.
    """
    session_id = get_current_session_id()
    if not session_id:
        return None

    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT mode FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            return row["mode"] if row else "interactive"
    except Exception:
        return "interactive"


def get_current_conversation_id() -> Optional[str]:
    """Get current session's conversation_id (Jan 2026).

    Conversation IDs persist across session resets within the same logical conversation.
    """
    session_id = get_current_session_id()
    if not session_id:
        return None

    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT conversation_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            return row["conversation_id"] if row else None
    except Exception:
        return None


def get_conversation_id(session_id: str) -> Optional[str]:
    """Get conversation_id for a given session_id (Jan 2026)."""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT conversation_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            return row["conversation_id"] if row else None
    except Exception:
        return None


def derive_window_name(role: str, session_id: str) -> str:
    """Derive tmux window name from role and session_id.

    Convention: chief uses 'chief', others use '{role}-{session_id[:8]}'
    """
    if role == "chief":
        return "chief"
    return f"{role}-{session_id[:8]}"


# =============================================================================
# CONTACT HELPERS
# =============================================================================

def normalize_phone(phone: str) -> str:
    """Convert any phone format to E.164 format (+1XXXXXXXXXX)."""
    digits = re.sub(r'\D', '', phone)
    if not digits.startswith('1') and len(digits) == 10:
        digits = '1' + digits
    return '+' + digits if digits else phone


def find_contact(storage, identifier: str) -> Optional[Dict[str, Any]]:
    """Find contact by name, phone, or short ID."""
    # Try phone first (most precise)
    if re.match(r'^[\+\d\(\)\s-]+$', identifier):
        phone = normalize_phone(identifier)
        row = storage.fetchone("SELECT * FROM contacts WHERE phone = ?", (phone,))
        if row:
            return dict(row)

    # Try short ID (8 chars)
    if len(identifier) == 8:
        row = storage.fetchone(
            "SELECT * FROM contacts WHERE id LIKE ? || '%'",
            (identifier,)
        )
        if row:
            return dict(row)

    # Try name (case-insensitive)
    row = storage.fetchone(
        "SELECT * FROM contacts WHERE name LIKE ?",
        (f"%{identifier}%",)
    )
    if row:
        return dict(row)

    return None
