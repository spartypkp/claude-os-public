"""Finder App - File browser for Claude OS.

This app provides:
- Browse Desktop/ filesystem
- Create, rename, move, delete files and folders
- File preview (markdown, code, text)
- Trash with restore capability
- HTTP API at /api/finder/*

Finder uses the existing files API but wraps it with
app-specific business logic for the Desktop metaphor.
"""

from __future__ import annotations

from pathlib import Path

from core import AppPlugin, AppManifest, Core
from . import api as api_module
from . import trash_api as trash_api_module
from .service import FinderService
from .trash import TrashService


manifest = AppManifest(
    name="Finder",
    slug="finder",
    description="Browse and manage Desktop files",
    icon="folder",
)


class FinderApp(AppPlugin):
    """Finder app plugin."""
    
    manifest = manifest
    
    def __init__(self):
        self.service: FinderService = None
        self.trash_service: TrashService = None
    
    def register(self, core: Core) -> None:
        """Register routes and services."""
        # Create services
        self.service = FinderService(core.db)
        self.trash_service = TrashService(core.db)
        
        # Inject services into API modules
        api_module.set_service(self.service)
        trash_api_module.set_service(self.trash_service)
        
        # Mount HTTP routes at /api/finder/*
        core.mount_api("/api/finder", api_module.router)
        core.mount_api("/api/finder", trash_api_module.router)
        
        # Register services for cross-app access
        core.register_service("finder", self.service)
        core.register_service("trash", self.trash_service)
    
    def install(self, core: Core) -> None:
        """No database tables needed - uses filesystem."""
        pass


# Export plugin instance for discovery
plugin = FinderApp()

__all__ = ['plugin', 'FinderApp', 'FinderService', 'TrashService', 'manifest']

