"""SessionEnd handler - Mark session as ended."""

import sys

from . import get_db, get_session_id, now_iso


def handle(input_data: dict):
    """Mark session as ended."""
    session_id = get_session_id(input_data)
    reason = input_data.get("reason", "unknown")

    # Skip marking for 'clear' (just context reset)
    if reason != "clear":
        mark_session_ended(session_id, reason)

    sys.exit(0)


def mark_session_ended(session_id: str, reason: str):
    """Mark session as ended in database."""
    try:
        storage = get_db()
        now = now_iso()

        storage.execute("""
            UPDATE sessions
            SET ended_at = ?, end_reason = ?, current_state = 'ended'
            WHERE session_id = ?
        """, (now, reason, session_id))

        storage.close()

    except Exception as e:
        print(f"Warning: Failed to mark session ended: {e}", file=sys.stderr)
