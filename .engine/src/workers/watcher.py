"""Async filesystem watcher - simple file watching for SSE and index updates.

Replaces the over-engineered watcher/ module system with a clean async loop.
Responsibilities:
1. Watch Desktop/ for file changes
2. Send SSE events for Dashboard UI sync
3. Trigger SYSTEM-INDEX.md refresh when specs change
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


__all__ = ["start_watcher"]
