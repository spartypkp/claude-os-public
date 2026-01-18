"""Settings App - System settings for Claude OS.

This app provides:
- Appearance settings (theme, accent color)
- Keyboard shortcuts reference
- System information
- HTTP API at /api/settings/*

Settings uses local storage on the frontend for user preferences,
with backend API for system-level info.
"""

from __future__ import annotations

from core import AppPlugin, AppManifest, Core
from . import api as api_module


manifest = AppManifest(
    name="Settings",
    slug="settings",
    description="System settings and preferences",
    icon="settings",
)


class SettingsApp(AppPlugin):
    """Settings app plugin."""
    
    manifest = manifest
    
    def register(self, core: Core) -> None:
        """Register routes."""
        # Mount HTTP routes at /api/settings/*
        core.mount_api("/api/settings", api_module.router)
        
        # No service needed - settings are mostly client-side
    
    def install(self, core: Core) -> None:
        """No database tables needed."""
        pass


# Export plugin instance for discovery
plugin = SettingsApp()

__all__ = ['plugin', 'SettingsApp', 'manifest']

