"""Async filesystem watcher - simple file watching for SSE and index updates.

Replaces the over-engineered watcher/ module system with a clean async loop.
Responsibilities:
1. Watch Desktop/ for file changes
2. Send SSE events for Dashboard UI sync
3. Trigger SYSTEM-INDEX.md refresh when specs change
4. Handle reply.txt signals for Chief ↔ Specialist messaging
"""

import asyncio
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from watchfiles import awatch, Change

from core.config import settings
from core.perf import record_worker_latency
from core.tmux import inject_message_async

# Add engine src to sys.path for database imports
sys.path.insert(0, str(settings.engine_dir / "src"))

logger = logging.getLogger(__name__)

# Import event bus for real-time UI notifications
try:
    from core.events import emit_file_changed as _emit_file_changed
    SSE_AVAILABLE = True
except ImportError:
    SSE_AVAILABLE = False

# Patterns that trigger SYSTEM-INDEX.md refresh
SYSTEM_INDEX_PATTERNS = {
    "LIFE-SPEC.md",
    "APP-SPEC.md",
    "SYSTEM-SPEC.md",
    "manifest.yaml",
    "role.md",
}


class WatchFilter:
    """Filter out noise - temp files, caches, etc."""

    SKIP_DIRS = {
        "__pycache__", ".git", "node_modules", ".venv", "venv",
        ".cache", ".DS_Store", ".pytest_cache", ".next", ".turbo"
    }

    SKIP_EXTENSIONS = ('.tmp', '.swp', '.swx', '.bak', '.pyc', '.db-wal', '.db-shm')

    def __call__(self, change: Change, path: str) -> bool:
        """Return True if this change should be processed."""
        p = Path(path)

        # Skip temp files
        if p.name.startswith('.') or p.name.endswith(self.SKIP_EXTENSIONS):
            return False
        if '~' in p.name:
            return False
        # Skip Claude Code atomic write temp files (e.g., file.md.tmp.PID.TIMESTAMP)
        if '.tmp.' in p.name:
            return False

        # Skip noise directories
        for part in p.parts:
            if part in self.SKIP_DIRS:
                return False
            # Skip hidden dirs except .engine and .claude
            if part.startswith('.') and part not in ('.engine', '.claude'):
                return False

        return True


async def start_watcher(stop_event: asyncio.Event):
    """Main watcher loop - simple file watching."""
    logger.info("File watcher started")
    logger.info(f"Repo: {settings.repo_root}")

    base_paths = {
        "Desktop",
        ".claude",
        ".engine/data",
    }
    extra_paths = set(getattr(settings, "watch_dirs", []))
    extra_paths.add("Dashboard")

    watch_paths = []
    for rel_path in sorted(base_paths | extra_paths):
        path = settings.repo_root / rel_path
        if path.exists():
            watch_paths.append(str(path))

    logger.info(f"Watching: {watch_paths}")

    try:
        async for changes in awatch(
            *watch_paths,
            watch_filter=WatchFilter(),
            recursive=True,
            stop_event=stop_event,
            debounce=getattr(settings, 'watcher_debounce_ms', 500),
        ):
            start = time.perf_counter()
            errored = False
            try:
                for change_type, path_str in changes:
                    await _handle_change(change_type, path_str)
            except Exception:
                errored = True
                raise
            finally:
                elapsed_ms = (time.perf_counter() - start) * 1000
                record_worker_latency("watcher.batch", elapsed_ms, errored)

    except asyncio.CancelledError:
        logger.info("Watcher cancelled")
        raise

    logger.info("File watcher stopped")


async def _handle_change(change_type: Change, path_str: str):
    """Handle a single file change."""
    try:
        path = Path(path_str)

        # Skip directories
        if path.is_dir():
            return

        # Skip SYSTEM-INDEX.md itself to avoid loops
        if path.name == "SYSTEM-INDEX.md":
            return

        rel_path = path.relative_to(settings.repo_root)
        event_type = _convert_change(change_type)

        logger.debug(f"{event_type}: {rel_path}")
        if str(rel_path).startswith(".engine/data/db/"):
            logger.info(f"DB change detected: {event_type} {rel_path}")

        # Send SSE for Desktop/ changes (UI sync)
        if SSE_AVAILABLE and str(rel_path).startswith("Desktop/"):
            await _send_sse(path, rel_path, event_type)

        # Trigger SYSTEM-INDEX refresh if relevant file changed
        if path.name in SYSTEM_INDEX_PATTERNS:
            await _refresh_system_index()

        # Handle reply.txt signals for Chief ↔ Specialist messaging
        if path.name == "reply.txt" and "conversations/" in str(path):
            await _handle_reply_signal(path)

    except Exception as e:
        logger.error(f"Error handling {path_str}: {e}")


def _convert_change(change: Change) -> str:
    """Convert watchfiles Change to event type string."""
    if change == Change.added:
        return "created"
    elif change == Change.deleted:
        return "deleted"
    else:
        return "modified"


async def _send_sse(path: Path, rel_path: Path, event_type: str):
    """Send SSE event for Dashboard sync."""
    try:
        if path.exists():
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        else:
            mtime = datetime.now(timezone.utc).isoformat()

        await _emit_file_changed(event_type, str(rel_path), mtime=mtime)
    except Exception as e:
        logger.debug(f"SSE error: {e}")


async def _refresh_system_index():
    """Trigger SYSTEM-INDEX.md refresh."""
    try:
        from workers.system_index import refresh_system_index
        await refresh_system_index()
    except Exception as e:
        logger.error(f"SYSTEM-INDEX refresh error: {e}")


async def _handle_reply_signal(path: Path):
    """Handle reply.txt change - auto-inject to subscribed Chief.

    Retries up to 3 times with 1s delay to handle race conditions where
    the subscription DB write hasn't completed when the file event fires.
    """
    try:
        # Extract conversation_id from path
        conversation_id = path.parent.name
        logger.info(f"Reply signal detected for conversation: {conversation_id}")

        # Query for specialist session + subscribed_by (with retry for race conditions)
        from core.database import get_db

        specialist_row = None
        chief_tmux_pane = None
        max_retries = 3

        for attempt in range(1, max_retries + 1):
            with get_db() as conn:
                cursor = conn.execute("""
                    SELECT session_id, role, subscribed_by
                    FROM sessions
                    WHERE conversation_id = ? AND ended_at IS NULL
                    LIMIT 1
                """, (conversation_id,))
                specialist_row = cursor.fetchone()

                if not specialist_row:
                    if attempt < max_retries:
                        logger.info(f"No active specialist for {conversation_id} (attempt {attempt}/{max_retries}), retrying...")
                        await asyncio.sleep(1)
                        continue
                    logger.warning(f"No active specialist found for {conversation_id} after {max_retries} attempts")
                    return

                subscribed_by = specialist_row["subscribed_by"]
                if not subscribed_by:
                    if attempt < max_retries:
                        logger.info(f"No Chief subscribed to {conversation_id} (attempt {attempt}/{max_retries}), retrying...")
                        await asyncio.sleep(1)
                        continue
                    logger.warning(f"No Chief subscribed to {conversation_id} after {max_retries} attempts")
                    return

                # Query Chief session to get tmux_pane
                cursor = conn.execute("""
                    SELECT tmux_pane
                    FROM sessions
                    WHERE session_id = ? AND ended_at IS NULL
                    LIMIT 1
                """, (subscribed_by,))
                chief_row = cursor.fetchone()

                if not chief_row or not chief_row["tmux_pane"]:
                    if attempt < max_retries:
                        logger.info(f"Chief tmux pane not ready (attempt {attempt}/{max_retries}), retrying...")
                        await asyncio.sleep(1)
                        continue
                    logger.warning(f"Chief session {subscribed_by[:8]} has no tmux pane after {max_retries} attempts")
                    return

                chief_tmux_pane = chief_row["tmux_pane"]
                break  # All lookups succeeded

        specialist_session_id = specialist_row["session_id"]
        specialist_role = specialist_row["role"] or "specialist"
        short_id = specialist_session_id[:8]
        subscribed_by = specialist_row["subscribed_by"]

        logger.info(f"Specialist {specialist_role} {short_id} subscribed by Chief {subscribed_by[:8]}")
        logger.info(f"Chief tmux pane found: {chief_tmux_pane}")

        # Find last injected position for this specialist
        with get_db() as conn:
            cursor = conn.execute("""
                SELECT MAX(message_position) as last_position
                FROM reply_injections
                WHERE specialist_session_id = ?
            """, (specialist_session_id,))
            last_position_row = cursor.fetchone()
            last_position = last_position_row["last_position"] if last_position_row["last_position"] is not None else 0

        logger.info(f"Last injected position: {last_position}")

        # Read all entries from reply.txt
        try:
            content = path.read_text()
            # Split by double newline, filter empty entries
            entries = [e.strip() for e in content.split("\n\n") if e.strip()]
            if not entries:
                logger.info(f"reply.txt is empty, nothing to inject")
                return

            logger.info(f"Found {len(entries)} total entries in reply.txt")
        except Exception as e:
            logger.error(f"Failed to read reply.txt: {e}")
            return

        # Process only new entries (position > last_position)
        new_entries = []
        for position in range(last_position + 1, len(entries) + 1):
            if position <= len(entries):
                entry_text = entries[position - 1]  # Convert to 0-indexed
                new_entries.append((position, entry_text))

        if not new_entries:
            logger.info(f"No new entries to inject (all {len(entries)} already processed)")
            return

        logger.info(f"Injecting {len(new_entries)} new entries")

        # Inject each new entry
        from datetime import datetime
        for position, entry_text in new_entries:
            # Format message: [SYSTEM:NOTIFY] Reply from {role} ({id}): {message}
            formatted_message = f"[SYSTEM:NOTIFY] Reply from {specialist_role} ({short_id}): {entry_text}"

            # Inject to Chief's pane
            success = await inject_message_async(chief_tmux_pane, formatted_message, submit=True)

            if success:
                # Record injection in database
                with get_db() as conn:
                    conn.execute("""
                        INSERT INTO reply_injections (specialist_session_id, chief_session_id, message_position, injected_at)
                        VALUES (?, ?, ?, ?)
                    """, (specialist_session_id, subscribed_by, position, datetime.now().isoformat()))
                    conn.commit()

                logger.info(f"Auto-injected reply #{position} to Chief from {specialist_role} {short_id}")
            else:
                logger.error(f"Failed to inject reply #{position} to Chief")
                # Don't record failed injections - will retry on next signal

    except Exception as e:
        logger.error(f"Error handling reply signal: {e}")


__all__ = ["start_watcher"]
