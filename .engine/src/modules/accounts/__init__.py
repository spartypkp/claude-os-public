"""
Accounts module - Unified account management for Claude OS.

Provides:
- List and manage email, calendar, contacts, and messages accounts
- Account discovery from Apple apps
- Capability management per account
"""

from .discovery import AccountDiscoveryService, DiscoveredAccount

__all__ = [
    "AccountDiscoveryService",
    "DiscoveredAccount",
]
