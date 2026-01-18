"""Route filesystem events to watcher modules."""

from __future__ import annotations

from typing import Iterable, List

from .context import WatcherContext
from .events import WatchedEvent
from .module import ModuleRegistration, WatcherModule


class ModuleRouter:
    def __init__(self, ctx: WatcherContext, modules: Iterable[WatcherModule]):
        self.ctx = ctx
        self.registrations: List[ModuleRegistration] = [
            ModuleRegistration(module=m, patterns=getattr(m, "patterns", [])) for m in modules
        ]

    def initialize(self) -> None:
        for registration in self.registrations:
            registration.module.initialize(self.ctx)
            registration.module.initial_sync(self.ctx)

    def shutdown(self) -> None:
        for registration in self.registrations:
            registration.module.shutdown(self.ctx)

    def dispatch(self, event: WatchedEvent) -> None:
        for registration in self.registrations:
            if registration.matches(event):
                registration.module.handle(event, self.ctx)

