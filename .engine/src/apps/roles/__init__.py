"""Roles Management Core App"""

from core import AppPlugin, AppManifest, Core
from .api import router as api_router

manifest = AppManifest(
    name="Roles",
    slug="roles",
    description="Manage Claude roles and modes",
    icon="users",
)

class RolesApp(AppPlugin):
    manifest = manifest

    def register(self, core: Core):
        # Mount HTTP API
        core.mount_api("/api/roles", api_router)

plugin = RolesApp()
