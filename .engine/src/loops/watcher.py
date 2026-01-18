"""Async filesystem watcher using watchfiles."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from watchfiles import awatch, Change

from config import settings

# Import SSE bus for real-time UI notifications
try:
    from utils.sse_bus import sse_bus, FileChangeEvent
    SSE_AVAILABLE = True
except ImportError:
    SSE_AVAILABLE = False

logger = logging.getLogger("watcher")


class LifeWatchFilter:
    """Filter for watchfiles matching current filtering logic."""

    SKIP_PATTERNS = {
        "__pycache__", ".git", "node_modules", ".venv", "venv",
        ".cache", ".DS_Store", ".pytest_cache", ".next"
    }

    TEMP_PATTERNS = ('.tmp.', '.swp', '.swx', '~', '.bak')

    def __call__(self, change: Change, path: str) -> bool:
        """Return True if this change should be processed."""
        path_obj = Path(path)

        name = path_obj.name
        if any(pattern in name or name.endswith(pattern) for pattern in self.TEMP_PATTERNS):
            return False

        for part in path_obj.parts:
            if part in self.SKIP_PATTERNS:
                return False
            if part.startswith('.') and part != '.engine':
                return False

        return True


async def start_watcher(stop_event: asyncio.Event):
    """Main watcher loop using watchfiles."""
    logger.info("=" * 60)
    logger.info("Life Engine Watcher - Async Mode")
    logger.info("=" * 60)
    logger.info(f"Repository: {settings.repo_root}")

    try:
        from watcher.engine import WatcherEngine
        from watcher.events import EventType, WatchedEvent

        engine = WatcherEngine(settings.repo_root)
        engine.router.initialize()

        logger.info(f"Modules: {[m.__class__.__name__ for m in engine.modules]}")

        watch_filter = LifeWatchFilter()

        def convert_change_type(change: Change) -> EventType:
            if change == Change.added:
                return EventType.CREATED
            elif change == Change.deleted:
                return EventType.DELETED
            else:
                return EventType.MODIFIED

        # Only watch directories that modules actually need
        # (not the entire repo - that picks up Dashboard/.next, etc.)
        watch_paths = [
            str(settings.repo_root / "Desktop"),            # LIFE-SPEC.md, APP-SPEC.md, contacts/
            str(settings.repo_root / ".claude" / "guides"), # Guide markdown files
            str(settings.repo_root / ".engine" / "data"),   # system.db changes
            str(settings.repo_root / ".engine" / "src"),    # SYSTEM-SPEC.md files
            str(settings.repo_root / ".engine" / "config"), # SYSTEM-SPEC.md in config/
        ]
        # Filter to only existing paths
        watch_paths = [p for p in watch_paths if Path(p).exists()]
        
        logger.info(f"Watching: {watch_paths}")

        try:
            async for changes in awatch(
                *watch_paths,
                watch_filter=watch_filter,
                recursive=True,
                stop_event=stop_event,
                debounce=settings.watcher_debounce_ms,
            ):
                for change_type, path_str in changes:
                    try:
                        src_path = Path(path_str)

                        if src_path == engine.context.paths.life_md:
                            continue

                        if src_path.is_dir():
                            continue

                        relative_path = src_path.relative_to(settings.repo_root)
                        event_type = convert_change_type(change_type)

                        watched_event = WatchedEvent(
                            src_path=src_path,
                            relative_path=relative_path,
                            event_type=event_type,
                            is_directory=False,
                            dest_path=None,
                        )

                        engine.router.dispatch(watched_event)

                        # Publish to SSE bus for UI sync (only Desktop/ files)
                        if SSE_AVAILABLE and str(relative_path).startswith("Desktop/"):
                            try:
                                # Get mtime for the event
                                if src_path.exists():
                                    mtime = datetime.fromtimestamp(
                                        src_path.stat().st_mtime, tz=timezone.utc
                                    ).isoformat()
                                else:
                                    mtime = datetime.now(timezone.utc).isoformat()

                                sse_event = FileChangeEvent(
                                    event_type=event_type,
                                    path=str(relative_path),
                                    mtime=mtime,
                                )
                                await sse_bus.publish(sse_event)
                                logger.debug(f"SSE: {event_type} {relative_path}")
                            except Exception as sse_err:
                                logger.debug(f"SSE publish error: {sse_err}")

                    except Exception as e:
                        logger.error(f"Error processing event {path_str}: {e}")
                        continue

        except asyncio.CancelledError:
            logger.info("Watcher cancelled")
            raise

        finally:
            logger.info("Stopping watcher...")
            engine.router.shutdown()
            engine.cache.save()
            engine.storage.close()
            logger.info("Watcher stopped")

    except ImportError as e:
        logger.error(f"Failed to import watcher modules: {e}")
        logger.info("Watcher running in stub mode")

        try:
            await stop_event.wait()
        except asyncio.CancelledError:
            pass

    except Exception as e:
        logger.error(f"Watcher error: {e}", exc_info=True)
        raise
