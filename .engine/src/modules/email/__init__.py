"""Email module - Multi-provider email with send safeguards."""

from .models import (
    AdapterConfig,
    DraftMessage,
    EmailMessage,
    Mailbox,
    ProviderType,
)
from .providers import AppleMailAdapter, EmailAdapter, GmailAdapter
from .repository import EmailRepository
from .send_service import EmailSendService
from .service import EmailService

__all__ = [
    # Models
    "AdapterConfig",
    "DraftMessage",
    "EmailMessage",
    "Mailbox",
    "ProviderType",
    # Providers
    "AppleMailAdapter",
    "EmailAdapter",
    "GmailAdapter",
    # Services
    "EmailRepository",
    "EmailSendService",
    "EmailService",
]
