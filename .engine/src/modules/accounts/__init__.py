"""
Accounts module - Unified account management for Claude OS.

Provides:
- List and manage email, calendar, contacts, and messages accounts
- Account discovery from Apple apps
- Service access tier management (read / assist / autonomous)
"""

from .discovery import AccountDiscoveryService, DiscoveredAccount
from .access import AccessService, get_access_service, init_access_service

__all__ = [
    "AccountDiscoveryService",
    "DiscoveredAccount",
    "AccessService",
    "get_access_service",
    "init_access_service",
]
