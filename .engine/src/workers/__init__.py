"""Background workers - autonomous processes that run continuously."""

from .context_monitor import get_monitor, ContextMonitor
from .watcher import start_watcher
from .today_sync import start_today_sync
from .system_index import start_system_index_sync

__all__ = [
    "get_monitor",
    "ContextMonitor",
    "start_watcher",
    "start_today_sync",
    "start_system_index_sync",
]
