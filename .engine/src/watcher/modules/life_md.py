"""SYSTEM-INDEX.md module - generates complete system directory from multiple sources."""

from __future__ import annotations

from pathlib import Path

from .. import constants
from ..context import WatcherContext
from ..events import WatchedEvent
from ..module import WatcherModule
from services import SectionUpdate


class LifeMdModule(WatcherModule):
    """Watch multiple file types and regenerate SYSTEM-INDEX.md sections."""

    name = "life_md"
    patterns = [
        "**/LIFE-SPEC.md",
        "**/APP-SPEC.md",
        "**/manifest.yaml",
        ".claude/guides/**/*.md",
        "**/SYSTEM-SPEC.md",
        # New patterns for tools, roles, missions
        ".engine/config/core.yaml",
        ".engine/config/core_apps/*.yaml",
        ".engine/config/custom_apps/*.yaml",
        ".claude/roles/**/*.md",
        ".claude/scheduled/*.md"
    ]

    def __init__(self):
        self.ctx: WatcherContext | None = None
        self.life_md_service = None

    def initialize(self, ctx: WatcherContext) -> None:
        self.ctx = ctx
        # Import and initialize service
        from services import LifeMdService
        self.life_md_service = LifeMdService(ctx.paths.repo_root)

    def initial_sync(self, ctx: WatcherContext) -> None:
        """Generate all sections on watcher startup."""
        self._refresh()

    def handle(self, event: WatchedEvent, ctx: WatcherContext) -> None:
        """Regenerate SYSTEM-INDEX.md on any watched file change."""
        self._refresh()

    def shutdown(self, ctx: WatcherContext) -> None:
        pass

    def _refresh(self) -> None:
        """Regenerate all SYSTEM-INDEX.md sections."""
        if not self.ctx or not self.life_md_service:
            return

        ctx = self.ctx

        # Generate complete content (all 4 sections)
        full_content = self.life_md_service.generate_life_md()

        # Extract and update each section individually
        # This allows other modules (contacts, watcher_health) to coexist

        # 1. Life Domains
        domains_section = self._extract_section(full_content, "Life Domains")
        if domains_section:
            ctx.writer.update_section(
                ctx.paths.life_md,
                SectionUpdate(
                    constants.DOMAINS_MARKER_START,
                    constants.DOMAINS_MARKER_END,
                    domains_section,
                ),
            )

        # 2. Custom Applications
        apps_section = self._extract_section(full_content, "Custom Applications")
        if apps_section:
            ctx.writer.update_section(
                ctx.paths.life_md,
                SectionUpdate(
                    constants.CUSTOM_APPS_MARKER_START,
                    constants.CUSTOM_APPS_MARKER_END,
                    apps_section,
                ),
            )

        # 3. Guides
        guides_section = self._extract_section(full_content, "Guides")
        if guides_section:
            ctx.writer.update_section(
                ctx.paths.life_md,
                SectionUpdate(
                    constants.GUIDES_MARKER_START,
                    constants.GUIDES_MARKER_END,
                    guides_section,
                ),
            )

        # 4. System Specs
        specs_section = self._extract_section(full_content, "System Specs")
        if specs_section:
            ctx.writer.update_section(
                ctx.paths.life_md,
                SectionUpdate(
                    constants.SYSTEM_SPECS_MARKER_START,
                    constants.SYSTEM_SPECS_MARKER_END,
                    specs_section,
                ),
            )

        # 5. Specialist Roles
        roles_section = self._extract_section(full_content, "Specialist Roles")
        if roles_section:
            ctx.writer.update_section(
                ctx.paths.life_md,
                SectionUpdate(
                    constants.ROLES_MARKER_START,
                    constants.ROLES_MARKER_END,
                    roles_section,
                ),
            )

        # 7. Missions
        missions_section = self._extract_section(full_content, "Missions")
        if missions_section:
            ctx.writer.update_section(
                ctx.paths.life_md,
                SectionUpdate(
                    constants.MISSIONS_MARKER_START,
                    constants.MISSIONS_MARKER_END,
                    missions_section,
                ),
            )

    def _extract_section(self, content: str, section_name: str) -> str:
        """Extract a specific section from generated content."""
        lines = content.split('\n')
        result_lines = []
        in_section = False

        for line in lines:
            # Check if we're starting the target section
            if line.strip() == f"## {section_name}":
                in_section = True
                result_lines.append(line)
                continue

            # If we're in the section
            if in_section:
                # Stop if we hit another ## header or ---
                if line.startswith("## ") or line.strip() == "---":
                    break
                result_lines.append(line)

        # Join and clean up trailing whitespace
        section_content = '\n'.join(result_lines).rstrip()

        # Return with the section marker comment included
        return f"{section_content}\n"
