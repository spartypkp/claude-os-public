"""Contacts App - Contact management for Claude OS.

This app provides:
- Database-backed contact storage
- HTTP API at /api/contacts/*
- MCP tool: contact(operation, ...)
- Service for cross-app access

Example MCP usage:
    contact("search", query="Alex")
    contact("create", name="Alex", company="Anthropic")
    contact("update", identifier="Alex", notes="Met at conf")
    contact("list", pinned=True)
"""

from __future__ import annotations

from pathlib import Path

from core import AppPlugin, AppManifest, Core
from .service import ContactsService
from . import api as api_module
from . import mcp as mcp_module


manifest = AppManifest(
    name="Contacts",
    slug="contacts",
    description="Contact management",
    icon="users",
    mcp_name="life-contacts",
)


class ContactsApp(AppPlugin):
    """Contacts app plugin."""
    
    manifest = manifest
    
    def __init__(self):
        self.service: ContactsService = None
    
    def register(self, core: Core) -> None:
        """Register routes, tools, and services."""
        # Create service with database access
        self.service = ContactsService(core.db)
        
        # Inject service into API and MCP modules
        api_module.set_service(self.service)
        mcp_module.set_service(self.service)
        
        # Mount HTTP routes
        core.mount_api("/api/contacts", api_module.router)
        
        # Register MCP tool
        core.register_tool(mcp_module.contact)
        
        # Register service for cross-app access
        core.register_service("contacts", self.service)
    
    def install(self, core: Core) -> None:
        """Create database tables on first install."""
        schema_path = Path(__file__).parent / "schema.sql"
        core.run_schema(schema_path)


# Export plugin instance for discovery
plugin = ContactsApp()

__all__ = ['plugin', 'ContactsApp', 'ContactsService', 'manifest']

