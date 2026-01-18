"""Session orphan cleanup background task.

Periodically checks for orphaned sessions (ended via Ctrl+C or crash)
and marks them as ended in the database.

Detection criteria:
- ended_at IS NULL (still "active")
- last_seen_at older than STALE_THRESHOLD_MINUTES
- tmux pane doesn't exist OR pane shows shell prompt (not Claude)
"""
from __future__ import annotations

import asyncio
import logging
import subprocess
from datetime import datetime, timezone, timedelta

from config import settings
from services import SystemStorage

logger = logging.getLogger("session_cleanup")

# Configuration
CHECK_INTERVAL_SECONDS = 120  # Check every 2 minutes
STALE_THRESHOLD_MINUTES = 5   # Session is stale if no heartbeat in 5 min


async def start_cleanup(stop_event: asyncio.Event):
    """Main cleanup loop."""
    logger.info("Session cleanup task started")
    logger.info(f"  Check interval: {CHECK_INTERVAL_SECONDS}s")
    logger.info(f"  Stale threshold: {STALE_THRESHOLD_MINUTES}min")

    while not stop_event.is_set():
        try:
            cleaned = await cleanup_orphaned_sessions()
            if cleaned > 0:
                logger.info(f"Cleaned up {cleaned} orphaned session(s)")
        except Exception as e:
            logger.error(f"Session cleanup error: {e}")

        # Wait for next check (or stop signal)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=CHECK_INTERVAL_SECONDS)
            break  # Stop event was set
        except asyncio.TimeoutError:
            continue  # Normal timeout, continue loop

    logger.info("Session cleanup task stopped")


async def cleanup_orphaned_sessions() -> int:
    """Find and mark orphaned sessions as ended.

    Returns count of sessions cleaned up.
    """
    storage = SystemStorage(settings.db_path)

    try:
        # Find potentially stale sessions
        threshold = datetime.now(timezone.utc) - timedelta(minutes=STALE_THRESHOLD_MINUTES)
        threshold_str = threshold.isoformat()

        cursor = storage.execute("""
            SELECT session_id, tmux_pane, role, last_seen_at
            FROM sessions
            WHERE ended_at IS NULL
              AND last_seen_at < ?
        """, (threshold_str,))

        stale_sessions = cursor.fetchall()

        if not stale_sessions:
            return 0

        cleaned = 0
        now = datetime.now(timezone.utc).isoformat()

        for row in stale_sessions:
            session_id, tmux_pane, role, last_seen = row

            # Check if tmux pane still exists and has Claude running
            if tmux_pane and is_claude_running_in_pane(tmux_pane):
                # Claude is still running - update heartbeat? No, let the hook do it.
                # This might be a session with a stuck hook. Leave it.
                continue

            # Pane doesn't exist or Claude isn't running - mark as ended
            storage.execute("""
                UPDATE sessions
                SET ended_at = ?,
                    end_reason = 'orphan_cleanup',
                    current_state = 'ended',
                    updated_at = ?
                WHERE session_id = ?
            """, (now, now, session_id))

            logger.info(f"Marked orphaned session as ended: {session_id[:8]} ({role})")
            cleaned += 1

        return cleaned

    finally:
        storage.close()


def is_claude_running_in_pane(tmux_pane: str) -> bool:
    """Check if Claude is running in a tmux pane.

    Returns True if:
    - Pane exists AND
    - Pane content doesn't show a shell prompt (Claude is running)

    Returns False if:
    - Pane doesn't exist OR
    - Pane shows shell prompt (Claude exited)
    """
    try:
        # Capture last few lines of pane
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", tmux_pane, "-p"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode != 0:
            # Pane doesn't exist
            return False

        # Check if output looks like a shell prompt (Claude exited)
        output = result.stdout.strip()
        if not output:
            return False

        last_line = output.split('\n')[-1].strip()

        # Common shell prompt patterns
        # NOTE: Do NOT include '> ' - that's Claude Code's input prompt!
        shell_patterns = [
            '% ',      # zsh
            '$ ',      # bash
            '# ',      # root
        ]

        # If last line ends with shell prompt, Claude has exited
        for pattern in shell_patterns:
            if last_line.endswith(pattern):
                return False

        # Check for explicit shell prompt format: user@host path % or $
        # Be careful not to match Claude's `>` prompt
        if '@' in last_line and ('%' in last_line or '$' in last_line):
            return False

        # Check for Claude Code's prompt to confirm it IS running
        # Claude Code shows "↵ send" on the input line when ready
        if '↵' in output:
            return True

        # Pane exists and doesn't show shell prompt - Claude probably running
        return True

    except subprocess.TimeoutExpired:
        # tmux command timed out - assume pane is gone
        return False
    except Exception as e:
        logger.warning(f"Error checking tmux pane {tmux_pane}: {e}")
        return False
