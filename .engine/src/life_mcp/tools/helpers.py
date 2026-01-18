"""Shared helpers for MCP tools.

These are used across multiple tool modules.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

# User is in San Francisco - all times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")

# Path setup - helpers.py is at .engine/src/life_mcp/tools/helpers.py → parents[4] = repo root
REPO_ROOT = Path(__file__).resolve().parents[4]
SYSTEM_ROOT = REPO_ROOT / ".engine"
DB_PATH = SYSTEM_ROOT / "data" / "db" / "system.db"

# Add src to path for imports
import sys
SRC_PATH = SYSTEM_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))

from db import get_db


# =============================================================================
# LAZY-LOADED SERVICES
# =============================================================================

_services = {}


def get_services():
    """Lazy-load backend services."""
    global _services
    if not _services:
        from services import (
            TaskService,
            ScheduledWorkService,
            SystemStorage,
            TaskWorkspaceService,
        )
        from watcher.config import load_config

        config = load_config(SYSTEM_ROOT / "config" / "config.yaml")
        storage = SystemStorage(DB_PATH)

        _services = {
            "config": config,
            "storage": storage,
            "tasks": TaskService(storage),
            "scheduled": ScheduledWorkService(storage),
            "workspaces": TaskWorkspaceService(storage, REPO_ROOT),
        }
    return _services


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
    Used for worker ownership - workers belong to conversations, not sessions.
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
# WORKER HELPERS
# =============================================================================

def resolve_short_id(short_id: str, storage) -> str:
    """Resolve short ID (first 8 chars) to full worker ID."""
    if len(short_id) >= 32:
        return short_id

    matches = storage.fetchall(
        "SELECT id FROM workers WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 10",
        (short_id,)
    )

    if len(matches) == 0:
        raise ValueError(f"No worker found matching '{short_id}'")
    elif len(matches) > 1:
        raise ValueError(f"Ambiguous ID '{short_id}' matches {len(matches)} workers")

    return matches[0]["id"]


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


# =============================================================================
# TABLE HELPERS
# =============================================================================

def ensure_timers_table():
    """Ensure timers table exists."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS timers (
                id TEXT PRIMARY KEY,
                label TEXT,
                minutes INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ends_at TEXT NOT NULL,
                session_id TEXT,
                notified INTEGER DEFAULT 0
            )
        """)
        conn.commit()


def ensure_reminders_table():
    """Ensure reminders table exists."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id TEXT PRIMARY KEY,
                message TEXT NOT NULL,
                remind_at TEXT NOT NULL,
                session_id TEXT,
                acknowledged_at TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()
