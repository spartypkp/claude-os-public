"""Contact domain models."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class Contact:
    """Contact data for rendering.

    Combines Apple Contacts data with Claude-specific extensions.
    """
    id: str  # Apple ZUNIQUEID (e.g., "UUID:ABPerson")
    name: str
    phone: Optional[str]
    email: Optional[str]
    company: Optional[str]
    role: Optional[str]  # job_title from Apple
    location: Optional[str]
    # Claude-specific extensions (from local DB)
    description: Optional[str]
    relationship: Optional[str]
    context_notes: Optional[str]
    value_exchange: Optional[str]
    notes: Optional[str]
    pinned: bool
    tags: Tuple[str, ...]
    last_contact_date: Optional[str]
    created_at: str
    updated_at: str
    # Provider metadata
    provider: str = "apple"


def normalize_phone(phone: str) -> Optional[str]:
    """Normalize phone number to E.164 format."""
    if not phone:
        return None

    digits = re.sub(r'\D', '', phone)

    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    elif len(digits) > 10:
        return f"+{digits}"

    return phone  # Return as-is if can't normalize
