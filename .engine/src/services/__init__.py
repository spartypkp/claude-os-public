"""Business logic services."""

from __future__ import annotations

# Writer
from .writer import WriterService, SectionUpdate

# Storage
from .storage import SystemStorage

# Domain services
from .domains import DomainsService
from .contacts import ContactsService, Contact
from .life_md import LifeMdService

# Task/worker services
from .workers import TaskService
# from .workspaces import TaskWorkspaceService  # TODO: Create this file
from .scheduled_work import ScheduledWorkService
from .executor import ScheduledExecutorService
from .execution_log import ExecutionLogService

# Watcher support
from .health import WatcherHealthService
from .prompts import PromptAssemblyService, PromptAssemblyError

# Session management
from .sessions import SessionManager, Session, SpawnResult

# Transcript
from .transcript import TranscriptWatcher

# Aliases for cleaner imports
StorageService = SystemStorage
HealthService = WatcherHealthService
WorkersService = TaskService
# WorkspacesService = TaskWorkspaceService  # TODO: Create workspaces.py
ExecutorService = ScheduledExecutorService

__all__ = [
    "WriterService", "SectionUpdate",
    "SystemStorage", "StorageService",
    "DomainsService", "ContactsService", "Contact",
    "LifeMdService",
    "TaskService", "WorkersService",
    # "TaskWorkspaceService", "WorkspacesService",  # TODO
    "ScheduledWorkService",
    "ScheduledExecutorService", "ExecutorService",
    "ExecutionLogService",
    "WatcherHealthService", "HealthService",
    "PromptAssemblyService", "PromptAssemblyError",
    "SessionManager", "Session", "SpawnResult",
    "TranscriptWatcher",
]
