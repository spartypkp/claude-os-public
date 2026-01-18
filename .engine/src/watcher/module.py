"""Module protocol for watcher features."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Protocol, Sequence

from .context import WatcherContext
from .events import WatchedEvent


class WatcherModule(Protocol):
    name: str
    patterns: Sequence[str]

    def initialize(self, ctx: WatcherContext) -> None:
        ...

    def initial_sync(self, ctx: WatcherContext) -> None:
        ...

    def handle(self, event: WatchedEvent, ctx: WatcherContext) -> None:
        ...

    def shutdown(self, ctx: WatcherContext) -> None:
        ...


@dataclass
class ModuleRegistration:
    module: WatcherModule
    patterns: Sequence[str] = field(default_factory=list)

    def matches(self, event: WatchedEvent) -> bool:
        return any(event.matches(pattern) for pattern in self.patterns)

