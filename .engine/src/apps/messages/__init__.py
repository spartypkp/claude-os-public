"""Messages App - iMessage integration for Claude OS.

This app provides:
- Direct-read from macOS Messages database (chat.db)
- HTTP API at /api/messages/*
- MCP tool: messages(operation, ...)
- AppleScript for sending messages

Direct-read pattern (matching calendar/email):
- Data-plane reads from Apple Messages SQLite (read-only)
- AppleScript for write operations (send)
- Configuration loaded from .engine/config/core_apps/messages.yaml

Example MCP usage:
    messages("conversations")                    # List recent conversations
    messages("read", phone="+14155551234")       # Read messages with contact
    messages("unread")                           # Get unread messages
    messages("send", phone="+1...", text="Hi")   # Send message
"""

from __future__ import annotations

import os
import yaml
from pathlib import Path
from typing import Dict, List, Any, Optional

from core import AppPlugin, AppManifest, Core

# Config file location
CONFIG_PATH = Path(__file__).parents[3] / "config" / "core_apps" / "messages.yaml"

# Cached config
_config: Optional[Dict[str, Any]] = None


def _load_config() -> Dict[str, Any]:
    """Load messages configuration from YAML."""
    global _config
    if _config is not None:
        return _config

    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            _config = yaml.safe_load(f) or {}
    else:
        _config = {}

    return _config


def get_send_limits() -> Dict[str, int]:
    """Get send rate limits from config."""
    config = _load_config()
    return config.get("send_limits", {"max_per_hour": 50, "delay_seconds": 0})


def get_read_settings() -> Dict[str, Any]:
    """Get read settings from config."""
    config = _load_config()
    return config.get("read", {"default_limit": 50, "include_attachments": True})


manifest = AppManifest(
    name="Claude Messages",
    slug="messages",
    description="iMessage integration with Claude styling",
    icon="message-circle",
    mcp_name="life-messages",
)


class MessagesApp(AppPlugin):
    """Messages app plugin."""

    manifest = manifest

    def __init__(self):
        self.service = None

    def register(self, core: Core) -> None:
        """Register routes, tools, and services."""
        from .service import MessagesService
        from . import api as api_module
        from . import mcp as mcp_module

        # Get contacts service for name lookups (optional - may not be loaded yet)
        contacts_service = core.get_service("contacts")

        # Create service
        self.service = MessagesService(contacts_service=contacts_service)

        # Inject service into API and MCP modules
        api_module.set_service(self.service)
        mcp_module.set_service(self.service)

        # Mount HTTP routes
        core.mount_api("/api/messages", api_module.router)

        # Register MCP tool
        core.register_tool(mcp_module.messages)

        # Register service for cross-app access
        core.register_service("messages", self.service)

    def install(self, core: Core) -> None:
        """Create database tables on first install."""
        schema_path = Path(__file__).parent / "schema.sql"
        if schema_path.exists():
            core.run_schema(schema_path)


# Export plugin instance for discovery
plugin = MessagesApp()

__all__ = ['plugin', 'MessagesApp', 'manifest', 'get_send_limits', 'get_read_settings']
