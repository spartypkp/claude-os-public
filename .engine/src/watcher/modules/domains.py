"""Domain module rebuilds SYSTEM-INDEX.md domain hierarchy when SPECs change."""

from __future__ import annotations

from pathlib import Path

from .. import constants
from ..context import WatcherContext
from ..events import WatchedEvent
from ..module import WatcherModule
from services import SectionUpdate


class DomainsModule(WatcherModule):
    name = "domains"
    patterns = ["**/LIFE-SPEC.md"]

    def __init__(self):
        self.ctx: WatcherContext | None = None

    def initialize(self, ctx: WatcherContext) -> None:
        self.ctx = ctx

    def initial_sync(self, ctx: WatcherContext) -> None:
        self._refresh()

    def handle(self, event: WatchedEvent, ctx: WatcherContext) -> None:
        self._refresh()

    def shutdown(self, ctx: WatcherContext) -> None:
        pass

    def _refresh(self) -> None:
        if not self.ctx:
            return
        ctx = self.ctx
        spec_files = ctx.domains.find_spec_files()
        section = ctx.domains.build_domain_hierarchy(spec_files)
        ctx.writer.update_section(
            ctx.paths.life_md,
            SectionUpdate(
                constants.DOMAINS_MARKER_START,
                constants.DOMAINS_MARKER_END,
                section,
            ),
        )

