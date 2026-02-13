"""Email provider adapters."""

from .apple import AppleMailAdapter
from .base import EmailAdapter
from .gmail import GmailAdapter

__all__ = [
    "EmailAdapter",
    "AppleMailAdapter",
    "GmailAdapter",
]
