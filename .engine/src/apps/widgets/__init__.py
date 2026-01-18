"""Widgets App - Widget gallery and configuration for Claude OS.

This app provides:
- Widget gallery showing all available widgets
- Enable/disable widgets for Desktop
- Widget configuration
- HTTP API at /api/widgets/*

Widget state is stored in localStorage on the frontend,
with backend providing widget metadata.
"""

from __future__ import annotations

from core import AppPlugin, AppManifest, Core
from . import api as api_module


manifest = AppManifest(
    name="Widgets",
    slug="widgets",
    description="Widget gallery and configuration",
    icon="layout-grid",
)


class WidgetsApp(AppPlugin):
    """Widgets app plugin."""
    
    manifest = manifest
    
    def register(self, core: Core) -> None:
        """Register routes."""
        # Mount HTTP routes at /api/widgets/*
        core.mount_api("/api/widgets", api_module.router)
    
    def install(self, core: Core) -> None:
        """No database tables needed."""
        pass


# Export plugin instance for discovery
plugin = WidgetsApp()

__all__ = ['plugin', 'WidgetsApp', 'manifest']

