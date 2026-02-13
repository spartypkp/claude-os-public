#!/usr/bin/env python3
"""
Handoff Executor - Executes session handoffs externally from Claude.

Called by session_handoff() MCP tool. Runs detached from Claude's process
so it can kill the old session and spawn a new one.

Usage:
    handoff.py <handoff_id>

The handoff_id references a record in the handoffs table with all the
information needed to:
1. Kill the old session's tmux pane
2. Spawn a replacement session with same role/mode
3. Inject the handoff message
"""

import logging
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Setup paths
# __file__ = .engine/src/adapters/cli/handoff.py
# parents: [0]=cli, [1]=adapters, [2]=src, [3]=.engine, [4]=repo_root
REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))

from core.storage import SystemStorage
from modules.handoff import HandoffService
from modules.handoff.transcript_parser import parse_transcript
from modules.sessions.transcript import get_transcript_path_for_session

DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"
LOG_DIR = REPO_ROOT / ".engine" / "data" / "logs"

# Setup logging to file (so errors aren't lost when run detached)
LOG_DIR.mkdir(parents=True, exist_ok=True)
log_file = LOG_DIR / "handoff.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()  # Also to stderr when interactive
    ]
)
logger = logging.getLogger("handoff")

# Also configure the summarizer logger to use the same handlers
summarizer_logger = logging.getLogger("modules.handoff.summarizer")
summarizer_logger.setLevel(logging.INFO)


# =============================================================================
# SSE EVENT NOTIFICATION
# =============================================================================

def _notify_backend_event(event_type: str, session_id: str, data: dict = None):
    """Notify the backend to emit an SSE event.

    MCP tools can't directly emit events to the SSE stream because they run
    in a different process than the FastAPI backend. This function bridges
    that gap by making an HTTP request to the backend's notify-event endpoint.
    """
    import urllib.request
    import json as json_module

    try:
        url = "http://localhost:5001/api/sessions/notify-event"
        payload = json_module.dumps({
            "event_type": event_type,
            "session_id": session_id,
            "data": data or {}
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=5) as response:
            pass  # Fire and forget

    except Exception as e:
        logger.debug(f"Backend notification failed (non-critical): {e}")


def load_handoff(handoff_id: str) -> dict:
    """Load handoff record from database."""
    storage = SystemStorage(DB_PATH)
    row = storage.fetchone(
        "SELECT * FROM handoffs WHERE id = ?",
        (handoff_id,)
    )
    storage.close()

    if not row:
        raise ValueError(f"Handoff {handoff_id} not found")

    return dict(row)


def update_handoff_status(handoff_id: str, status: str, **extra):
    """Update handoff status in database."""
    storage = SystemStorage(DB_PATH)
    now = datetime.now(timezone.utc).isoformat()

    # Build SET clause dynamically
    set_parts = ["status = ?", "updated_at = ?"]
    params = [status, now]

    if "executed_at" in extra:
        set_parts.append("executed_at = ?")
        params.append(extra["executed_at"])
    if "completed_at" in extra:
        set_parts.append("completed_at = ?")
        params.append(extra["completed_at"])
    if "new_session_id" in extra:
        set_parts.append("new_session_id = ?")
        params.append(extra["new_session_id"])
    if "error" in extra:
        set_parts.append("error = ?")
        params.append(extra["error"])

    params.append(handoff_id)

    storage.execute(
        f"UPDATE handoffs SET {', '.join(set_parts)} WHERE id = ?",
        tuple(params)
    )
    storage.close()


def mark_session_ended(session_id: str, reason: str = "handoff"):
    """Mark session as ended in database."""
    storage = SystemStorage(DB_PATH)
    now = datetime.now(timezone.utc).isoformat()

    storage.execute("""
        UPDATE sessions
        SET ended_at = ?, end_reason = ?, current_state = 'ended', updated_at = ?
        WHERE session_id = ?
    """, (now, reason, now, session_id))
    storage.close()

    logger.info(f"Marked session {session_id} as ended (reason: {reason})")


def kill_tmux_pane(tmux_pane: str) -> bool:
    """Kill a tmux pane. Returns True if successful or pane didn't exist."""
    try:
        result = subprocess.run(
            ["tmux", "kill-pane", "-t", tmux_pane],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            logger.info(f"Killed tmux pane: {tmux_pane}")
            return True
        else:
            # Pane might already be gone
            logger.warning(f"Could not kill pane {tmux_pane}: {result.stderr.strip()}")
            return True  # Still continue with spawn
    except Exception as e:
        logger.error(f"Error killing pane: {e}")
        return False


def spawn_replacement(
    role: str,
    mode: str,
    window_name: str,
    handoff_path: str = None,
    handoff_content: str = None,
    handoff_reason: str = None,
    conversation_id: str = None,
    parent_session_id: str = None,
    mission_execution_id: str = None,
    spec_path: str = None,
) -> tuple[bool, str]:
    """Spawn replacement session. Returns (success, session_id).

    Args:
        handoff_path: Path to handoff file (traditional handoffs)
        handoff_content: Inline content (for mission handoffs)
        Either handoff_path OR handoff_content should be provided, not both.
    """
    try:
        from modules.sessions import SessionManager

        manager = SessionManager(repo_root=REPO_ROOT)
        result = manager.spawn(
            role=role,
            mode=mode,
            window_name=window_name,
            handoff_path=handoff_path,
            handoff_content=handoff_content,
            handoff_reason=handoff_reason,
            conversation_id=conversation_id,
            parent_session_id=parent_session_id,
            mission_execution_id=mission_execution_id,
            spec_path=spec_path,
        )

        if result.success:
            logger.info(f"Spawned replacement session: {result.session_id} in {result.window_name} (conversation: {conversation_id})")
            return True, result.session_id
        else:
            logger.error(f"Failed to spawn replacement: {result.error}")
            return False, None

    except Exception as e:
        logger.error(f"Error spawning replacement: {e}")
        return False, None


def get_transcript_text(session_id: str) -> str:
    """Get formatted transcript text for a session using the parser."""
    transcript_path = get_transcript_path_for_session(session_id, DB_PATH)
    if not transcript_path:
        logger.warning(f"No transcript found for session {session_id}")
        return ""

    return parse_transcript(transcript_path)


def get_operational_state() -> dict:
    """Query operational state from database."""
    storage = SystemStorage(DB_PATH)

    # Get active sessions
    active_sessions = storage.fetchall(
        """SELECT session_id, role, status_text
           FROM sessions
           WHERE ended_at IS NULL
           ORDER BY started_at DESC"""
    )

    # Get today's priorities
    priorities = storage.fetchall(
        """SELECT level, content, completed
           FROM priorities
           WHERE date = date('now')
           ORDER BY level"""
    )

    storage.close()

    return {
        "active_sessions": [dict(s) for s in active_sessions],
        "priorities": [dict(p) for p in priorities],
    }


def cleanup_summarizer_sessions(conversation_id: str = None, timeout_minutes: int = 5):
    """End zombie summarizer sessions.

    Two modes:
    - Targeted: End summarizer sessions for a specific conversation (call after each summarizer run)
    - Timeout-based: End ALL summarizer sessions older than timeout_minutes (safety net)

    Returns number of sessions cleaned up.
    """
    storage = SystemStorage(DB_PATH)
    now = datetime.now(timezone.utc).isoformat()
    cleaned = 0

    try:
        if conversation_id:
            # Targeted: end all open summarizer sessions for this conversation
            rows = storage.fetchall(
                "SELECT session_id FROM sessions WHERE mode = 'summarizer' AND ended_at IS NULL AND conversation_id = ?",
                (conversation_id,)
            )
            for row in rows:
                storage.execute(
                    "UPDATE sessions SET ended_at = ?, end_reason = 'summarizer_cleanup', current_state = 'ended', updated_at = ? WHERE session_id = ?",
                    (now, now, row["session_id"])
                )
                cleaned += 1
                logger.info(f"Cleaned up summarizer session {row['session_id']} for conversation {conversation_id}")

        # Always run timeout-based cleanup as safety net
        rows = storage.fetchall(
            "SELECT session_id, conversation_id FROM sessions WHERE mode = 'summarizer' AND ended_at IS NULL AND started_at < datetime('now', ? || ' minutes')",
            (f"-{timeout_minutes}",)
        )
        for row in rows:
            storage.execute(
                "UPDATE sessions SET ended_at = ?, end_reason = 'summarizer_timeout', current_state = 'ended', updated_at = ? WHERE session_id = ?",
                (now, now, row["session_id"])
            )
            cleaned += 1
            logger.info(f"Timed out summarizer session {row['session_id']} (conversation: {row['conversation_id']})")
    finally:
        storage.close()

    if cleaned:
        logger.info(f"Cleaned up {cleaned} zombie summarizer session(s)")
    return cleaned


def execute_handoff(handoff_id: str):
    """Execute a handoff.

    Order of operations:
    1. Wait for Claude to finish response
    2. Generate handoff (blocking - summarizer must complete)
    3. Mark session ended
    4. Kill tmux pane
    5. Spawn replacement with handoff
    """
    logger.info(f"Starting handoff execution: {handoff_id}")
    now = datetime.now(timezone.utc).isoformat()

    # Safety net: clean up any old zombie summarizer sessions
    cleanup_summarizer_sessions()

    try:
        # 1. Mark as executing
        update_handoff_status(handoff_id, "executing", executed_at=now)

        # 2. Load handoff record
        handoff = load_handoff(handoff_id)
        logger.info(f"Loaded handoff: role={handoff['role']}, mode={handoff['mode']}")

        # 3. Wait for Claude to finish current response
        logger.info("Waiting 3 seconds for Claude to finish...")
        time.sleep(3)

        # 4. Generate handoff FIRST (blocking - must complete before we kill pane)
        handoff_path = handoff.get("handoff_path")
        needs_generation = (not handoff_path or handoff_path == "auto") and not handoff.get("content")

        if needs_generation:
            logger.info(f"Generating handoff (blocking)...")

            _notify_backend_event("session.handoff_generating", handoff["session_id"], {
                "handoff_id": handoff_id,
                "role": handoff["role"],
            })

            try:
                # Get transcript
                transcript_text = get_transcript_text(handoff["session_id"])

                # Initialize handoff service
                handoff_service = HandoffService(REPO_ROOT)

                # Generate handoff based on role (this blocks until summarizer completes)
                if handoff["role"] == "chief":
                    handoff_path = handoff_service.create_chief_handoff(
                        transcript=transcript_text,
                        session_id=handoff["session_id"],
                    )
                else:
                    handoff_path = handoff_service.create_specialist_handoff(
                        transcript=transcript_text,
                        role=handoff["role"],
                        conversation_id=handoff.get("conversation_id", "unknown"),
                        mode=handoff.get("mode", "interactive"),
                        session_id=handoff["session_id"],
                        spec_path=handoff.get("spec_path"),
                    )

                handoff["handoff_path"] = str(handoff_path)
                logger.info(f"Generated handoff at: {handoff_path}")

                _notify_backend_event("session.handoff_complete", handoff["session_id"], {
                    "handoff_id": handoff_id,
                    "handoff_path": str(handoff_path),
                })

            except Exception as e:
                logger.error(f"Handoff generation failed: {e}", exc_info=True)
                handoff["handoff_path"] = None
                logger.info("Continuing without handoff - replacement will spawn with no context")
            finally:
                # Clean up the summarizer session that was created during generation
                conv_id = handoff.get("conversation_id")
                if conv_id:
                    cleanup_summarizer_sessions(conversation_id=conv_id)

        # Clear "auto" sentinel if still there
        if handoff.get("handoff_path") == "auto":
            handoff["handoff_path"] = None

        # 5. NOW mark session ended and kill pane (after handoff is ready)
        if handoff.get("session_id"):
            mark_session_ended(handoff["session_id"], "handoff")

        if handoff.get("tmux_pane"):
            kill_tmux_pane(handoff["tmux_pane"])
            time.sleep(0.5)

        # 6. Determine window name
        if handoff["role"] == "chief":
            window_name = "chief"
        else:
            window_name = None

        # 7. Spawn replacement session
        logger.info(f"Spawning replacement: role={handoff['role']}, mode={handoff['mode']}, "
                    f"handoff_path={handoff.get('handoff_path')!r}")
        success, new_session_id = spawn_replacement(
            role=handoff["role"],
            mode=handoff["mode"],
            window_name=window_name,
            handoff_path=handoff.get("handoff_path"),
            handoff_content=handoff.get("content"),
            handoff_reason=handoff.get("reason"),
            conversation_id=handoff.get("conversation_id"),
            parent_session_id=handoff.get("session_id"),
            mission_execution_id=handoff.get("mission_execution_id"),
            spec_path=handoff.get("spec_path"),
        )

        # 8. Update handoff status
        if success:
            update_handoff_status(
                handoff_id,
                "complete",
                completed_at=datetime.now(timezone.utc).isoformat(),
                new_session_id=new_session_id,
            )
            logger.info(f"Handoff complete: {handoff_id} -> {new_session_id}")

            _notify_backend_event("session.respawned", new_session_id, {
                "handoff_id": handoff_id,
                "role": handoff["role"],
                "mode": handoff["mode"],
                "parent_session_id": handoff.get("session_id"),
                "conversation_id": handoff.get("conversation_id"),
            })
        else:
            update_handoff_status(
                handoff_id,
                "failed",
                error="Failed to spawn replacement session",
            )
            logger.error(f"Handoff failed: {handoff_id}")

    except Exception as e:
        logger.error(f"Handoff execution error: {e}", exc_info=True)
        try:
            update_handoff_status(handoff_id, "failed", error=str(e))
        except:
            pass


def main():
    if len(sys.argv) < 2:
        print("Usage: handoff.py <handoff_id>", file=sys.stderr)
        return 1

    handoff_id = sys.argv[1]
    execute_handoff(handoff_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
