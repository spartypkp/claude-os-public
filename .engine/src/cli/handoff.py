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
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))

from services import SystemStorage

DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"
LOG_FILE = REPO_ROOT / ".engine" / "state" / "handoff.log"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("handoff")


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
) -> tuple[bool, str]:
    """Spawn replacement session. Returns (success, session_id).

    Args:
        handoff_path: Path to handoff file (traditional handoffs)
        handoff_content: Inline content (for mission handoffs)
        Either handoff_path OR handoff_content should be provided, not both.
    """
    try:
        from services import SessionManager

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


def execute_handoff(handoff_id: str):
    """Execute a handoff."""
    logger.info(f"Starting handoff execution: {handoff_id}")
    now = datetime.now(timezone.utc).isoformat()

    try:
        # 1. Mark as executing
        update_handoff_status(handoff_id, "executing", executed_at=now)

        # 2. Load handoff record
        handoff = load_handoff(handoff_id)
        logger.info(f"Loaded handoff: role={handoff['role']}, mode={handoff['mode']}")

        # 3. Wait for Claude to finish current response
        # This delay is critical - gives Claude time to complete after calling MCP tool
        logger.info("Waiting 3 seconds for Claude to finish...")
        time.sleep(3)

        # 4. Mark old session as ended
        if handoff.get("session_id"):
            mark_session_ended(handoff["session_id"], "handoff")

        # 5. Kill the tmux pane
        if handoff.get("tmux_pane"):
            kill_tmux_pane(handoff["tmux_pane"])
            time.sleep(0.5)  # Brief pause after kill

        # 6. Determine window name for replacement
        # For chief, use stable "chief" name; for others, extract from pane or generate
        if handoff["role"] == "chief":
            window_name = "chief"
        else:
            # Try to preserve window name from pane ID (format: %N)
            # Or generate new one
            window_name = None  # Let spawner auto-generate

        # 7. Spawn replacement session (inherits conversation_id for continuity)
        success, new_session_id = spawn_replacement(
            role=handoff["role"],
            mode=handoff["mode"],
            window_name=window_name,
            handoff_path=handoff.get("handoff_path"),
            handoff_content=handoff.get("content"),           # Inline content (Path A)
            handoff_reason=handoff.get("reason"),
            conversation_id=handoff.get("conversation_id"),   # Inherit!
            parent_session_id=handoff.get("session_id"),      # Lineage
            mission_execution_id=handoff.get("mission_execution_id"),  # Mission link
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
