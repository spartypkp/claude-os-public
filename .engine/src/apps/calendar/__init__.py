"""Calendar App - Direct-read Apple Calendar integration for Claude OS.

This app provides calendar functionality using direct SQLite reads from
macOS Calendar.app database and AppleScript for mutations.

Direct-read pattern (matching email):
- Data-plane reads from Apple Calendar SQLite (read-only)
- System DB stores only config + preferences
- No cache tables, no sync state

Configuration loaded from .engine/config/core_apps/calendar.yaml
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from core import AppPlugin, AppManifest, Core
from .service import CalendarService
from . import api as api_module


logger = logging.getLogger(__name__)

manifest = AppManifest(
    name="Calendar",
    slug="calendar",
    description="Direct-read Apple Calendar integration",
    icon="calendar",
    mcp_name="life-calendar",
)

SCHEMA_PATH = Path(__file__).parent / "schema.sql"
CONFIG_PATH = Path(__file__).parents[3] / "config" / "core_apps" / "calendar.yaml"

# Module-level service reference (set by CalendarApp.register())
_service: Optional[CalendarService] = None


@lru_cache(maxsize=1)
def load_config() -> Dict[str, Any]:
    """Load calendar configuration from YAML file.

    Returns cached config dict with keys: aliases, preferred_calendars, defaults, permissions, read
    """
    if not CONFIG_PATH.exists():
        logger.warning(f"Calendar config not found at {CONFIG_PATH}, using defaults")
        return {
            "aliases": {},
            "preferred_calendars": [],
            "defaults": {"fallback": "Calendar"},
            "permissions": {"can_create": [], "can_delete": []},
            "read": {"include_all_day_events": True, "timezone": "America/Los_Angeles"},
        }

    try:
        with open(CONFIG_PATH) as f:
            config = yaml.safe_load(f)
            logger.info(f"Loaded calendar config from {CONFIG_PATH}")
            return config
    except Exception as e:
        logger.error(f"Failed to load calendar config: {e}")
        return {
            "aliases": {},
            "preferred_calendars": [],
            "defaults": {"fallback": "Calendar"},
            "permissions": {"can_create": [], "can_delete": []},
            "read": {"include_all_day_events": True, "timezone": "America/Los_Angeles"},
        }


def get_aliases() -> Dict[str, str]:
    """Get calendar name aliases (lowercase key -> actual calendar name).

    First tries to get from CalendarService (loaded from accounts table),
    falls back to YAML config if service not available.
    """
    if _service:
        return _service.get_aliases()
    # Fallback to YAML during initialization
    return load_config().get("aliases", {})


def get_preferred_calendars() -> List[str]:
    """Get list of preferred calendar names to show in UI.

    First tries to get from CalendarService (loaded from accounts table),
    falls back to YAML config if service not available.
    """
    if _service:
        return _service.get_preferred_calendars()
    # Fallback to YAML during initialization
    return load_config().get("preferred_calendars", [])


def get_default_calendar(event_type: Optional[str] = None) -> str:
    """Get default calendar name for an event type.

    Args:
        event_type: Optional type - 'meeting', 'personal', 'work', or None for fallback

    Returns:
        Calendar name to use

    First tries to get from CalendarService (loaded from accounts table),
    falls back to YAML config if service not available.
    """
    if _service:
        return _service.get_default_calendar(event_type)
    # Fallback to YAML during initialization
    defaults = load_config().get("defaults", {})
    if event_type and event_type in defaults:
        return defaults[event_type]
    return defaults.get("fallback", "Calendar")


def resolve_calendar_name(calendar_id: Optional[str]) -> str:
    """Resolve a calendar alias, name, or ID to the actual calendar name.

    Supports:
    - Aliases: "exchange" -> "Calendar", "gmail" -> "Personal"
    - Direct names: "Calendar", "Personal"
    - Falls back to default if None provided
    """
    if not calendar_id:
        return get_default_calendar()

    # Check aliases first (case-insensitive)
    aliases = get_aliases()
    alias_result = aliases.get(calendar_id.lower())
    if alias_result:
        return alias_result

    # Return as-is (could be actual calendar name or UUID)
    return calendar_id


class CalendarApp(AppPlugin):
    """Calendar app plugin."""

    manifest = manifest

    def __init__(self):
        self.service: CalendarService = None

    def register(self, core: Core) -> None:
        """Register routes and services."""
        global _service
        self.service = CalendarService(core.db)
        _service = self.service  # Set module-level reference for helper functions
        api_module.set_service(self.service)

        core.mount_api("/api/calendar", api_module.router)
        core.register_service("calendar", self.service)
    
    def install(self, core: Core) -> None:
        """Create database tables."""
        core.run_schema(SCHEMA_PATH)
    
    def uninstall(self, core: Core) -> None:
        """Cleanup (data preserved by default)."""
        pass


plugin = CalendarApp()

__all__ = [
    'plugin',
    'CalendarApp',
    'CalendarService',
    'manifest',
    'load_config',
    'get_aliases',
    'get_preferred_calendars',
    'get_default_calendar',
    'resolve_calendar_name',
]

