"""SessionEnd handler - Mark session as ended and emit event."""

import sys

from . import get_db, get_session_id, now_iso, repo_root


def handle(input_data: dict):
    """Mark session as ended."""
    session_id = get_session_id(input_data)
    reason = input_data.get("reason", "unknown")

    # Skip marking for 'clear' (just context reset)
    if reason != "clear":
        mark_session_ended(session_id, reason)

    sys.exit(0)


def mark_session_ended(session_id: str, reason: str):
    """Mark session as ended in database and emit event."""
    try:
        storage = get_db()
        now = now_iso()

        # Get session info for the event
        row = storage.fetchone(
            "SELECT role, mode FROM sessions WHERE session_id = ?",
            (session_id,)
        )

        storage.execute("""
            UPDATE sessions
            SET ended_at = ?, end_reason = ?, current_state = 'ended'
            WHERE session_id = ?
        """, (now, reason, session_id))

        storage.close()

        # Emit session.ended event to events table
        try:
            from core.event_log import emit_event
            emit_event(
                "session",
                "ended",
                actor=session_id,
                data={
                    "role": row["role"] if row else "unknown",
                    "mode": row["mode"] if row else "unknown",
                    "reason": reason,
                },
            )
        except Exception as e:
            print(f"Warning: Failed to emit session.ended event: {e}", file=sys.stderr)

    except Exception as e:
        print(f"Warning: Failed to mark session ended: {e}", file=sys.stderr)
