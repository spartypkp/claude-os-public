"""Passive contact signal processing.

Fire-and-forget side effects that update last_contact_date when
contacts are encountered through email, messages, or calendar operations.
Never blocks the primary MCP operation.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, List

from .standalone import StandaloneContactsRepository

logger = logging.getLogger(__name__)


def touch_contact_date(identifier: str, repo: StandaloneContactsRepository) -> None:
    """Update last_contact_date for a contact found by email or phone.

    Idempotent: skips if already set to today.
    Silent on failure — this is a side effect, not a primary operation.
    """
    today = date.today().isoformat()

    # Try email lookup first (case-insensitive)
    row = repo.storage.fetchone(
        "SELECT id, last_contact_date FROM contacts WHERE LOWER(email) = LOWER(?)",
        (identifier,)
    )

    # Try phone lookup if email didn't match
    if not row:
        from .models import normalize_phone
        normalized = normalize_phone(identifier)
        if normalized:
            row = repo.storage.fetchone(
                "SELECT id, last_contact_date FROM contacts WHERE phone = ?",
                (normalized,)
            )

    if not row:
        return

    # Idempotent: skip if already today
    if row["last_contact_date"] == today:
        return

    repo.storage.execute(
        "UPDATE contacts SET last_contact_date = ?, updated_at = datetime('now') WHERE id = ?",
        (today, row["id"])
    )
    logger.debug(f"Touched last_contact_date for {identifier}")


def process_email_signals(messages_data: List[Dict[str, Any]], repo: StandaloneContactsRepository) -> None:
    """Extract sender emails from email message dicts and touch contacts."""
    seen = set()
    for msg in messages_data:
        sender = msg.get("from")
        if not sender or sender in seen:
            continue
        seen.add(sender)

        # Extract email from "Name <email>" format
        email = _extract_email(sender)
        if email:
            touch_contact_date(email, repo)


def process_message_signals(messages_data: List[Dict[str, Any]], repo: StandaloneContactsRepository) -> None:
    """Extract handle_ids from inbound messages and touch contacts."""
    seen = set()
    for msg in messages_data:
        # Only process inbound messages
        if msg.get("is_from_me"):
            continue
        handle = msg.get("handle_id")
        if not handle or handle in seen:
            continue
        seen.add(handle)
        touch_contact_date(handle, repo)


def process_calendar_signals(event_data: Dict[str, Any], repo: StandaloneContactsRepository) -> None:
    """Extract attendee emails from a calendar event and touch contacts."""
    attendees = event_data.get("attendees")
    if not attendees or not isinstance(attendees, list):
        return

    for attendee in attendees:
        email = None
        if isinstance(attendee, dict):
            email = attendee.get("email")
        elif isinstance(attendee, str):
            email = attendee
        if email:
            touch_contact_date(email, repo)


def _extract_email(sender: str) -> str | None:
    """Extract email address from a sender string like 'Name <email@example.com>' or plain email."""
    if not sender:
        return None
    # Already a plain email
    if "@" in sender and "<" not in sender:
        return sender.strip()
    # "Name <email>" format
    if "<" in sender and ">" in sender:
        start = sender.index("<") + 1
        end = sender.index(">")
        return sender[start:end].strip()
    return None
