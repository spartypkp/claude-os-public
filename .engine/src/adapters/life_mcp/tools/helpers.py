"""Shared helpers for MCP tools.

DEPRECATED: This file re-exports from core.mcp_helpers for backwards compatibility.
New code should import directly from core.mcp_helpers.

TODO: Update all imports and delete this file.
"""
from core.mcp_helpers import (
    # Constants
    PACIFIC,
    REPO_ROOT,
    SYSTEM_ROOT,
    DB_PATH,
    # Database
    get_db,
    # Services
    get_services,
    # Session helpers
    get_current_session_id,
    get_current_session_role,
    get_current_session_mode,
    get_current_conversation_id,
    get_conversation_id,
    derive_window_name,
    # Contact helpers
    normalize_phone,
    find_contact,
)

__all__ = [
    'PACIFIC',
    'REPO_ROOT',
    'SYSTEM_ROOT',
    'DB_PATH',
    'get_db',
    'get_services',
    'get_current_session_id',
    'get_current_session_role',
    'get_current_session_mode',
    'get_current_conversation_id',
    'get_conversation_id',
    'derive_window_name',
    'normalize_phone',
    'find_contact',
]
