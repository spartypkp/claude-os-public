"""Email repository - SQL operations for email domain.

Note: Most email data operations are handled directly by provider adapters
(AppleMailAdapter, GmailAdapter) which read from external data sources
(Mail.app SQLite, Gmail API). This repository handles internal tracking only.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class EmailRepository:
    """Repository for email-related database operations."""

    def __init__(self, storage):
        self._storage = storage

    # Note: Email service currently embeds SQL queries directly.
    # This repository exists for consistency with domain pattern.
    # Future refactoring can extract queries here if needed.
