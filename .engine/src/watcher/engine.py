"""Watcher engine coordinating modules, services, and filesystem events."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .cache import WatcherCache
from .config import load_config
from .modules import FEATURE_REGISTRY
from .context import WatcherContext, WatcherPaths
from .events import EventType, WatchedEvent
from .module import WatcherModule
from .routing import ModuleRouter

# Import SSE bus for real-time UI notifications
try:
    from utils.sse_bus import sse_bus, FileChangeEvent
    SSE_AVAILABLE = True
except ImportError:
    SSE_AVAILABLE = False

from services import (
    TaskService,
    ContactsService,
    DomainsService,
    ExecutionLogService,
    PromptAssemblyService,
    ScheduledExecutorService,
    ScheduledWorkService,
    SystemStorage,
    WatcherHealthService,
    WriterService,
)


class WatcherEngine:
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.system_root = repo_root / ".engine"
        self.config_path = self.system_root / "config" / "config.yaml"
        self.cache_path = self.system_root / "data" / "watcher_cache.json"

        self.config = load_config(self.system_root / "config" / "config.yaml")
        self.cache = WatcherCache(self.cache_path)
        self.writer = WriterService()
        self.storage = SystemStorage(self.system_root / "data" / "db" / "system.db")
        self.domains = DomainsService(repo_root)
        self.contacts = ContactsService(repo_root, self.config)
        self.health = WatcherHealthService()
        self.scheduled_work = ScheduledWorkService(self.storage)
        self.attention = TaskService(self.storage)
        self.execution_log = ExecutionLogService(self.storage)
        self.prompts = PromptAssemblyService(repo_root)
        self.executor = ScheduledExecutorService(
            repo_root,
            storage=self.storage,
            prompts=self.prompts,
            config=self.config.get("scheduled_work"),
        )

        self.context = WatcherContext(
            config=self.config,
            cache=self.cache,
            writer=self.writer,
            domains=self.domains,
            contacts=self.contacts,
            health=self.health,
            scheduled_work=self.scheduled_work,
            attention=self.attention,
            execution_log=self.execution_log,
            prompts=self.prompts,
            executor=self.executor,
            storage=self.storage,
            paths=WatcherPaths(
                repo_root=repo_root,
                system_root=self.system_root,
                desktop=repo_root / "Desktop",  # User's visible workspace
                life_md=repo_root / "Desktop" / "SYSTEM-INDEX.md",
                future_md=repo_root / "Desktop" / "future.md",
                today_md=repo_root / "Desktop" / "TODAY.md",
                system_db=self.system_root / "data" / "db" / "system.db",
            ),
        )

        self.modules = self._build_modules()
        self.router = ModuleRouter(self.context, self.modules)
        self.observer = Observer()

    def _build_modules(self) -> List[WatcherModule]:
        requested: Sequence[str] = (
            (self.config.get("watcher") or {}).get("modules")
            or ["domains", "contacts", "today_context"]
        )
        modules: List[WatcherModule] = []
        for name in requested:
            factory = FEATURE_REGISTRY.get(name)
            if not factory:
                print(f"Unknown watcher module '{name}' - skipping")
                continue
            modules.append(factory())
        return modules

    def start(self) -> None:
        print("=" * 60)
        print("Life Engine Watcher")
        print("=" * 60)
        print(f"Repository: {self.repo_root}")
        print()

        self.router.initialize()

        handler = _WatchdogHandler(self)
        self.observer.schedule(handler, str(self.repo_root), recursive=True)
        self.observer.start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()

    def stop(self) -> None:
        print("\nStopping watcher...")
        self.observer.stop()
        self.observer.join()
        self.router.shutdown()
        self.cache.save()
        self.storage.close()
        print("Watcher stopped")

    def handle_raw_event(self, event) -> None:
        src_path = Path(event.src_path)
        if src_path == self.context.paths.life_md:
            return
        relative_path = src_path.relative_to(self.repo_root)
        event_type = EventType.MODIFIED
        if event.event_type == "created":
            event_type = EventType.CREATED
        elif event.event_type == "deleted":
            event_type = EventType.DELETED
        elif event.event_type == "moved":
            event_type = EventType.MOVED
        watched_event = WatchedEvent(
            src_path=src_path,
            relative_path=relative_path,
            event_type=event_type,
            is_directory=event.is_directory,
            dest_path=Path(event.dest_path) if getattr(event, "dest_path", None) else None,
        )
        self.router.dispatch(watched_event)

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

                dest_path_str = None
                if watched_event.dest_path:
                    dest_relative = watched_event.dest_path.relative_to(self.repo_root)
                    dest_path_str = str(dest_relative)

                sse_event = FileChangeEvent(
                    event_type=event_type,
                    path=str(relative_path),
                    mtime=mtime,
                    dest_path=dest_path_str,
                )

                # Publish async - use asyncio.create_task if in async context
                # or run_coroutine_threadsafe since watchdog runs in a thread
                try:
                    loop = asyncio.get_running_loop()
                    asyncio.create_task(sse_bus.publish(sse_event))
                except RuntimeError:
                    # No running loop, try to get or create one
                    try:
                        loop = asyncio.get_event_loop()
                        asyncio.run_coroutine_threadsafe(sse_bus.publish(sse_event), loop)
                    except Exception:
                        pass  # SSE is best-effort, don't block watcher
            except Exception:
                pass  # SSE is best-effort, don't block watcher on errors


class _WatchdogHandler(FileSystemEventHandler):
    def __init__(self, engine: WatcherEngine):
        super().__init__()
        self.engine = engine

    def on_any_event(self, event):
        if event.is_directory:
            return
        if any(part.startswith('.') for part in Path(event.src_path).parts if part != ".engine"):
            return
        temp_patterns = ('.tmp.', '.swp', '.swx', '~', '.bak', '.DS_Store')
        if any(pattern in event.src_path or event.src_path.endswith(pattern) for pattern in temp_patterns):
            return
        self.engine.handle_raw_event(event)
