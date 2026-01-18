"""Email App - Email client for Claude OS.

This app provides:
- Direct-read Apple Mail access (read-only, macOS)
- Gmail send-only for Claude (safeguarded)
- HTTP API at /api/email/*
- Draft creation (Claude does NOT send emails directly)

Architecture:
    EmailService
        ↓ handles
    Apple Mail direct-read + Gmail send safeguards

Design principle: Claude can READ email and CREATE drafts, but never SEND.
User reviews and sends manually.

See applications.md for Core Application integration pattern.
"""

from __future__ import annotations

from pathlib import Path

from core import AppPlugin, AppManifest, Core
from .service import EmailService
from . import api as api_module


manifest = AppManifest(
    name="Email",
    slug="email",
    description="Email client with multi-provider support",
    icon="mail",
    mcp_name="life-email",
)


class EmailApp(AppPlugin):
    """Email app plugin.
    
    Follows Core Application pattern:
    - Has own integration settings (accessible in-app)
    - Read-only Apple Mail DB
    - Send safeguards for Claude account
    """
    
    manifest = manifest
    
    def __init__(self):
        self.service: EmailService = None
    
    def register(self, core: Core) -> None:
        """Register routes and services."""
        # Create service with database access
        self.service = EmailService(core.db)
        
        # Inject service into API module
        api_module.set_service(self.service)
        
        # Mount HTTP routes
        core.mount_api("/api/email", api_module.router)
        
        # Register service for cross-app access
        core.register_service("email", self.service)
    
    def install(self, core: Core) -> None:
        """Create database tables on first install."""
        schema_path = Path(__file__).parent / "schema.sql"
        if schema_path.exists():
            core.run_schema(schema_path)


# Export plugin instance for discovery
plugin = EmailApp()

__all__ = ['plugin', 'EmailApp', 'EmailService', 'manifest']
