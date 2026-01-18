"""Shared watcher context and paths."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

from .cache import WatcherCache
from services import (
    ContactsService,
    DomainsService,
    ExecutionLogService,
    PromptAssemblyService,
    ScheduledExecutorService,
    ScheduledWorkService,
    SystemStorage,
    WatcherHealthService,
    WriterService,
    TaskService,
)


@dataclass(frozen=True)
class WatcherPaths:
    repo_root: Path
    system_root: Path
    desktop: Path
    life_md: Path
    future_md: Path
    today_md: Path
    system_db: Path


@dataclass
class WatcherContext:
    config: Dict[str, Any]
    cache: WatcherCache
    writer: WriterService
    domains: DomainsService
    contacts: ContactsService
    health: WatcherHealthService
    scheduled_work: ScheduledWorkService
    attention: TaskService
    execution_log: ExecutionLogService
    prompts: PromptAssemblyService
    executor: ScheduledExecutorService
    storage: SystemStorage
    paths: WatcherPaths

    @property
    def repo_root(self) -> Path:
        return self.paths.repo_root
