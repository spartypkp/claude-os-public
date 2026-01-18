"""Priorities App - Priority/task management for Claude OS.

This app provides:
- Database-backed priority storage
- HTTP API at /api/priorities/*
- MCP tool: priority(operation, ...)
- Service for cross-app access

Example MCP usage:
    priority("create", content="Finish work", level="critical")
    priority("complete", id="abc12345")
    priority("delete", id="abc12345")
"""

from __future__ import annotations

from pathlib import Path

from core import AppPlugin, AppManifest, Core
from .service import PrioritiesService
from . import api as api_module
from . import mcp as mcp_module


manifest = AppManifest(
    name="Priorities",
    slug="priorities",
    description="Priority and task management",
    icon="list-checks",
    mcp_name="life-priorities",
)


class PrioritiesApp(AppPlugin):
    """Priorities app plugin."""
    
    manifest = manifest
    
    def __init__(self):
        self.service: PrioritiesService = None
    
    def register(self, core: Core) -> None:
        """Register routes, tools, and services."""
        # Create service with database access
        self.service = PrioritiesService(core.db)
        
        # Inject service into API and MCP modules
        api_module.set_service(self.service)
        mcp_module.set_service(self.service)

        # Mount HTTP routes
        core.mount_api("/api/priorities", api_module.router)
        
        # Register MCP tool
        core.register_tool(mcp_module.priority)
        
        # Register service for cross-app access
        core.register_service("priorities", self.service)
    
    def install(self, core: Core) -> None:
        """Create database tables on first install."""
        schema_path = Path(__file__).parent / "schema.sql"
        core.run_schema(schema_path)


# Export plugin instance for discovery
plugin = PrioritiesApp()

__all__ = ['plugin', 'PrioritiesApp', 'PrioritiesService', 'manifest']

