"""UserPromptSubmit handler - Heartbeat only.

Handles:
- Session heartbeat (last_seen_at, current_state)
- Session status reminders

Context warnings are handled by ContextMonitor via TMUX injection.
"""

import sys
from datetime import datetime

from . import (
    get_db, get_session_id, now_iso,
    emit_session_state_event, PACIFIC_TZ
)


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def handle(input_data: dict):
    """Handle UserPromptSubmit - heartbeat + status reminders."""
    try:
        session_id = get_session_id(input_data)
        if not session_id:
            sys.exit(0)

        storage = get_db()
        now = now_iso()

        # Update heartbeat
        storage.execute("""
            UPDATE sessions
            SET last_seen_at = ?, current_state = 'active', updated_at = ?
            WHERE session_id = ?
        """, (now, now, session_id))

        # Emit SSE event for real-time UI updates
        emit_session_state_event(session_id, 'active')

        # Check for missing session_status
        status_reminder = check_session_status_reminder(storage, session_id)
        if status_reminder:
            print(status_reminder)

        storage.close()

    except Exception as e:
        print(f"UserPromptSubmit hook error: {e}", file=sys.stderr)

    sys.exit(0)


def check_session_status_reminder(storage, session_id: str) -> str | None:
    """Check if session is missing status_text and should be reminded."""
    try:
        result = storage.execute("""
            SELECT status_text, created_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,)).fetchone()

        if not result:
            return None

        status_text, created_at = result

        if status_text and status_text.strip():
            return None

        # Check if session has been active for at least 2 minutes
        if created_at:
            try:
                if isinstance(created_at, str):
                    created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    created_dt = created_at

                if created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=PACIFIC_TZ)

                now_pacific = datetime.now(PACIFIC_TZ)
                created_pacific = created_dt.astimezone(PACIFIC_TZ)

                age_seconds = (now_pacific - created_pacific).total_seconds()

                if age_seconds < 120:
                    return None
            except:
                pass

        return f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Consider setting a session status with `status(\"what you're working on\")` so the user can see at a glance"

    except Exception:
        return None
