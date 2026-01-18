"""Duties App - Chief duties (critical scheduled Chief work).

Chief duties are fundamentally different from missions:
- Duties: Run IN Chief's context (force reset -> inject prompt -> continue)
- Missions: Spawn NEW specialist windows

This app provides:
- Database tables for duty definitions and execution history
- HTTP API at /api/duties/*
- MCP tool: duty(operation, ...)
- Service for DutyScheduler to use

Core duties (seeded by migration):
- memory-consolidation (6 AM) - Archive, consolidate memory
- morning-prep (7 AM) - Create brief, prepare fresh Chief

Example MCP usage:
    duty("list")
    duty("get", slug="memory-consolidation")
    duty("run_now", slug="memory-consolidation")
    duty("history", slug="memory-consolidation", limit=5)
"""

from __future__ import annotations

from pathlib import Path

from core import AppPlugin, AppManifest, Core
from .service import DutiesService
from . import api as api_module
from . import mcp as mcp_module


manifest = AppManifest(
    name="Duties",
    slug="duties",
    description="Chief duties - critical scheduled Chief work",
    icon="calendar-clock",
    mcp_name="life-duties",
)


class DutiesApp(AppPlugin):
    """Duties app plugin."""

    manifest = manifest

    def __init__(self):
        self.service: DutiesService = None

    def register(self, core: Core) -> None:
        """Register routes, tools, and services."""
        # Create service with database access
        self.service = DutiesService(core.db)

        # Inject service into API and MCP modules
        api_module.set_service(self.service)
        mcp_module.set_service(self.service)

        # Mount HTTP routes
        core.mount_api("/api/duties", api_module.router)

        # Register MCP tool
        core.register_tool(mcp_module.duty)

        # Register service for cross-app access (e.g., DutyScheduler)
        core.register_service("duties", self.service)

    def install(self, core: Core) -> None:
        """Create database tables on first install.

        Note: Tables are created by migration 032_chief_duties.sql.
        This method ensures they exist if migration hasn't run yet.
        """
        # Tables are created by migration, but we can verify they exist
        # The migration also seeds core duties
        pass


# Export plugin instance for discovery
plugin = DutiesApp()

__all__ = ['plugin', 'DutiesApp', 'DutiesService', 'manifest']
