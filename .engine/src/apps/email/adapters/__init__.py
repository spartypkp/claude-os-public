"""Email adapters - Provider implementations for email integration.

The adapter pattern allows Email to work with multiple providers:
- Gmail (via Google API) - requires OAuth2 setup, send-only for Claude
- Apple Mail (via Mail.app) - zero-config on macOS, read-only local database

Architecture:
    EmailService
        ↓ routes by account
    EmailAdapter (abstract)
        ↓ implementations
    GmailAdapter, AppleMailAdapter

Routing:
    Each account in email_accounts specifies a provider.
    Operations route to the adapter for that account's provider.
    Credentials are stored per-account in the database.

Provider Coverage:
    Gmail       → Claude send-only account (OAuth2)
    Apple Mail  → All accounts in Mail.app (macOS only) - direct-read
"""

from .base import EmailAdapter, AdapterConfig, ProviderType, Mailbox, EmailMessage, DraftMessage
from .gmail import GmailAdapter
from .apple import AppleMailAdapter, discover_apple_mail_accounts

__all__ = [
    # Base classes
    'EmailAdapter',
    'AdapterConfig', 
    'ProviderType',
    'Mailbox',
    'EmailMessage',
    'DraftMessage',
    # Adapters
    'GmailAdapter',
    'AppleMailAdapter',
    # Discovery
    'discover_apple_mail_accounts',
]
