"""Core module - The OS core for Claude OS.

This module provides:
- Core: The OS core that apps plug into
- AppPlugin: Base class for all apps
- AppManifest: App metadata

Apps (Core or Custom) use the Core to:
- Mount API routes: core.mount_api(prefix, router)
- Register MCP tools: core.register_tool(fn)
- Register services: core.register_service(name, svc)
- Access other services: core.get_service(name)
- Access database: core.db

See Workspace/specs/app-architecture.md for the full architecture.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import APIRouter, FastAPI
    from fastmcp import FastMCP


@dataclass
class AppManifest:
    """Everything the Core needs to know about an app."""
    name: str              # "Contacts"
    slug: str              # "contacts" (used for routes, folders)
    description: str       # "Manage your contacts"
    icon: str              # "users" (lucide icon name)
    version: str = "1.0.0"
    
    # Optional: MCP server name for grouped tools
    mcp_name: Optional[str] = None


class AppPlugin:
    """Base class for all apps (Core and Custom).
    
    Every app implements this interface:
    - manifest: AppManifest with app metadata
    - register(core): Called when app loads - register routes, tools, services
    - install(core): Called once on first install - create database tables
    - uninstall(core): Called on removal - cleanup
    
    Example minimal app:
        class TimerApp(AppPlugin):
            manifest = AppManifest(
                name="Timer",
                slug="timer",
                description="Simple timer tool",
                icon="clock",
            )
            
            def register(self, core: Core):
                core.register_tool(timer_fn)
    """
    
    manifest: AppManifest
    
    def register(self, core: "Core") -> None:
        """Called when app is loaded.
        
        Register routes, tools, services here.
        """
        raise NotImplementedError
    
    def install(self, core: "Core") -> None:
        """Called once when app is first installed.
        
        Create database tables here.
        """
        pass
    
    def uninstall(self, core: "Core") -> None:
        """Called when app is removed.
        
        Cleanup database tables here.
        """
        pass


class Core:
    """The OS core. Apps plug into this.
    
    Provides:
    - API mounting (FastAPI)
    - MCP tool registration
    - Service registry (cross-app communication)
    - Database access
    - Schema/migration execution
    
    Usage:
        core = Core()
        
        # Load apps
        for plugin in discover_apps():
            core.load_app(plugin)
        
        # Start server
        core.run()
    """
    
    def __init__(
        self,
        api: Optional["FastAPI"] = None,
        mcp: Optional["FastMCP"] = None,
        db_path: Optional[Path] = None,
    ):
        """Initialize the Core.
        
        Args:
            api: Optional FastAPI app (created if not provided)
            mcp: Optional FastMCP server (created if not provided)
            db_path: Optional database path (uses default if not provided)
        """
        from config import settings
        from services.storage import SystemStorage
        
        self._api = api
        self._mcp = mcp
        self._db_path = db_path or settings.db_path
        self._db: Optional[SystemStorage] = None
        
        self._services: Dict[str, Any] = {}
        self._apps: Dict[str, AppPlugin] = {}
        self._tools: List[Callable] = []
        self._installed_apps: set = set()
    
    @property
    def api(self) -> "FastAPI":
        """Get the FastAPI app (lazy initialization)."""
        if self._api is None:
            from fastapi import FastAPI
            self._api = FastAPI(
                title="Life Engine",
                description="Claude OS Backend",
                version="4.0.0",
            )
        return self._api
    
    @property
    def mcp(self) -> "FastMCP":
        """Get the FastMCP server (lazy initialization)."""
        if self._mcp is None:
            from fastmcp import FastMCP
            self._mcp = FastMCP("life")
        return self._mcp
    
    @property
    def db(self):
        """Get database connection (SystemStorage instance)."""
        if self._db is None:
            from services.storage import SystemStorage
            self._db = SystemStorage(self._db_path)
        return self._db
    
    # === App Registration ===
    
    def load_app(self, plugin: AppPlugin) -> None:
        """Load an app into the system.
        
        Calls plugin.register(core) and tracks the app.
        """
        slug = plugin.manifest.slug
        
        if slug in self._apps:
            raise ValueError(f"App '{slug}' already loaded")
        
        # Register the app
        plugin.register(self)
        self._apps[slug] = plugin
    
    def install_app(self, plugin: AppPlugin) -> None:
        """Install an app (run schema, mark as installed).
        
        Only runs once per app. Safe to call multiple times.
        """
        slug = plugin.manifest.slug
        
        # Check if already installed
        if self._is_installed(slug):
            return
        
        # Run install
        plugin.install(self)
        
        # Mark as installed
        self._mark_installed(slug)
    
    def _is_installed(self, slug: str) -> bool:
        """Check if an app is installed."""
        try:
            row = self.db.fetchone(
                "SELECT 1 FROM installed_apps WHERE slug = ?",
                (slug,)
            )
            return row is not None
        except Exception:
            # Table might not exist yet
            return False
    
    def _mark_installed(self, slug: str) -> None:
        """Mark an app as installed."""
        from datetime import datetime, timezone
        
        # Ensure table exists
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS installed_apps (
                slug TEXT PRIMARY KEY,
                installed_at TEXT NOT NULL
            )
        """)
        
        now = datetime.now(timezone.utc).isoformat()
        self.db.execute(
            "INSERT OR REPLACE INTO installed_apps (slug, installed_at) VALUES (?, ?)",
            (slug, now)
        )
    
    # === API Registration ===
    
    def mount_api(self, prefix: str, router: "APIRouter") -> None:
        """Apps mount their HTTP routes here.
        
        Args:
            prefix: URL prefix (e.g., "/api/contacts")
            router: FastAPI router with routes
        """
        self.api.include_router(router, prefix=prefix)
    
    # === MCP Registration ===
    
    def register_tool(self, tool_fn: Callable) -> None:
        """Apps register MCP tools here.
        
        The tool function should be decorated with @mcp.tool() or
        will be wrapped automatically.
        """
        self._tools.append(tool_fn)
        
        # If MCP is initialized, register immediately
        if self._mcp is not None:
            self._mcp.tool()(tool_fn)
    
    def get_tools(self) -> List[Callable]:
        """Get all registered tools."""
        return self._tools
    
    # === Service Registration ===
    
    def register_service(self, name: str, service: Any) -> None:
        """Apps register services for cross-app access.
        
        Args:
            name: Service name (e.g., "contacts", "priorities")
            service: Service instance
        """
        if name in self._services:
            raise ValueError(f"Service '{name}' already registered")
        self._services[name] = service
    
    def get_service(self, name: str) -> Any:
        """Get another app's service.
        
        Args:
            name: Service name
            
        Returns:
            Service instance or None if not found
        """
        return self._services.get(name)
    
    # === Database ===
    
    def run_schema(self, schema_path: Path) -> None:
        """Run a schema.sql file.
        
        Args:
            schema_path: Path to schema file
        """
        if not schema_path.exists():
            raise FileNotFoundError(f"Schema not found: {schema_path}")
        
        schema_sql = schema_path.read_text()
        self.db._conn.executescript(schema_sql)
    
    def run_migration(self, migration_path: Path) -> None:
        """Run a migration file.
        
        Args:
            migration_path: Path to migration file
        """
        if not migration_path.exists():
            raise FileNotFoundError(f"Migration not found: {migration_path}")
        
        migration_sql = migration_path.read_text()
        self.db._conn.executescript(migration_sql)
    
    # === Getters ===
    
    def get_app(self, slug: str) -> Optional[AppPlugin]:
        """Get an app by slug."""
        return self._apps.get(slug)
    
    def get_apps(self) -> Dict[str, AppPlugin]:
        """Get all loaded apps."""
        return self._apps.copy()


# Re-export the stable API from api.py for backwards compatibility
from .api import (
    get_db,
    REPO_ROOT,
    ENGINE_ROOT,
    PACIFIC,
)

__all__ = [
    # New architecture
    'Core',
    'AppPlugin',
    'AppManifest',
    # Backwards compatibility
    'get_db',
    'REPO_ROOT',
    'ENGINE_ROOT',
    'PACIFIC',
]
