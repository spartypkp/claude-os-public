"""SessionEnd handler - Mark session as ended and clean up session folder."""

import shutil
import sys
from pathlib import Path
from datetime import datetime

from . import get_db, get_session_id, now_iso

# Debug log file
DEBUG_LOG = Path(__file__).parent.parent.parent.parent / ".engine/state/session-end-debug.log"
SESSIONS_DIR = Path(__file__).parent.parent.parent.parent / "Desktop" / "sessions"


def log_debug(msg: str):
    """Append debug message to log file."""
    try:
        with open(DEBUG_LOG, "a") as f:
            timestamp = datetime.now().isoformat()
            f.write(f"[{timestamp}] {msg}\n")
    except Exception:
        pass


def handle(input_data: dict):
    """Mark session as ended."""
    log_debug(f"SessionEnd hook fired! input_data keys: {list(input_data.keys())}")

    session_id = get_session_id(input_data)
    log_debug(f"session_id: {session_id}")

    reason = input_data.get("reason", "unknown")
    log_debug(f"reason: {reason}")

    # Skip marking for 'clear' (just context reset)
    if reason != "clear":
        mark_session_ended(session_id, reason)

    sys.exit(0)


def mark_session_ended(session_id: str, reason: str):
    """Mark session as ended in database and clean up session folder."""
    log_debug(f"mark_session_ended called: session_id={session_id}, reason={reason}")
    try:
        storage = get_db()
        now = now_iso()

        storage.execute("""
            UPDATE sessions
            SET ended_at = ?, end_reason = ?, current_state = 'ended'
            WHERE session_id = ?
        """, (now, reason, session_id))

        log_debug(f"Successfully marked session {session_id} as ended")

        # Clean up session folder if all workers are acked
        cleanup_session_folder(session_id, storage)

        storage.close()

    except Exception as e:
        log_debug(f"Failed to mark session ended: {e}")
        print(f"Warning: Failed to mark session ended: {e}", file=sys.stderr)


def cleanup_session_folder(session_id: str, storage):
    """Delete session folder if all workers have been acked.

    Session folders: Desktop/sessions/{session_id[:8]}/
    Only delete if:
    - Folder exists
    - All workers spawned by this session are acked (complete_acked, failed_acked, or cancelled)
    """
    short_id = session_id[:8] if len(session_id) > 8 else session_id
    session_folder = SESSIONS_DIR / short_id

    if not session_folder.exists():
        log_debug(f"No session folder to clean up for {short_id}")
        return

    # Check if any workers are still pending/unacked
    row = storage.fetchone("""
        SELECT COUNT(*) as unacked
        FROM workers
        WHERE spawned_by_session = ?
          AND status NOT IN ('complete_acked', 'failed_acked', 'cancelled')
    """, (session_id,))

    unacked_count = row["unacked"] if row else 0

    if unacked_count > 0:
        log_debug(f"Session {short_id} has {unacked_count} unacked workers, keeping folder")
        return

    # All workers acked (or no workers), safe to delete folder
    try:
        shutil.rmtree(session_folder)
        log_debug(f"Deleted session folder: {session_folder}")
    except Exception as e:
        log_debug(f"Failed to delete session folder {session_folder}: {e}")
