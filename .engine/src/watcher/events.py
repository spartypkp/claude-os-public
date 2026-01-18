"""Normalized filesystem events for the runtime.watcher."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


class EventType:
    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"
    MOVED = "moved"


@dataclass(frozen=True)
class WatchedEvent:
    src_path: Path
    relative_path: Path
    event_type: str
    is_directory: bool
    dest_path: Optional[Path] = None

    def matches(self, pattern: str) -> bool:
        from fnmatch import fnmatch
        return fnmatch(str(self.relative_path), pattern)
