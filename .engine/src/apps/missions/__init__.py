"""Missions App - Scheduled and triggered autonomous Claude work.

This app provides:
- Database-backed mission storage (scheduled + triggered)
- Protected missions (Memory Consolidation) that can't be disabled
- Core default missions (Morning Brief, Dream Mode) that can be disabled
- Custom App missions (declared in manifest.yaml)
- User-created missions (via Dashboard or MCP)
- HTTP API at /api/missions/*
- MCP tool: mission(operation, ...)
- Service for cross-app access

Example MCP usage:
    mission("list")
    mission("get", slug="memory-consolidation")
    mission("run_now", slug="morning-prep")
    mission("disable", slug="dream-mode")  # Works
    mission("disable", slug="memory-consolidation")  # Fails (protected)
    mission("create", name="Weekly Review", schedule_type="cron", 
            schedule_cron="0 10 * * 0", prompt_file="...")

See Workspace/specs/missions.md for full specification.
"""

from __future__ import annotations

from pathlib import Path

from core import AppPlugin, AppManifest, Core
from .service import MissionsService
from . import api as api_module
from . import mcp as mcp_module


manifest = AppManifest(
    name="Missions",
    slug="missions",
    description="Scheduled and triggered autonomous work",
    icon="clock",
    mcp_name="life-missions",
)


class MissionsApp(AppPlugin):
    """Missions app plugin."""
    
    manifest = manifest
    
    def __init__(self):
        self.service: MissionsService = None
    
    def register(self, core: Core) -> None:
        """Register routes, tools, and services."""
        # Create service with database access
        self.service = MissionsService(core.db)
        
        # Inject service into API and MCP modules
        api_module.set_service(self.service)
        mcp_module.set_service(self.service)
        
        # Mount HTTP routes
        core.mount_api("/api/missions", api_module.router)
        
        # Register MCP tool
        core.register_tool(mcp_module.mission)
        
        # Register service for cross-app access
        core.register_service("missions", self.service)
    
    def install(self, core: Core) -> None:
        """Create database tables and seed core missions on first install."""
        schema_path = Path(__file__).parent / "schema.sql"
        core.run_schema(schema_path)
        
        # Seed core protected and default missions
        self.service.seed_core_missions()


# Export plugin instance for discovery
plugin = MissionsApp()

__all__ = ['plugin', 'MissionsApp', 'MissionsService', 'manifest']

