"""Contact activity logging.

Logs relationship intelligence events to the contact_activity table.
Used by MCP operations and signal processing to create a visible
activity feed in the Dashboard.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

logger = logging.getLogger(__name__)


def log_activity(
    storage,
    contact_id: str,
    event_type: str,
    description: str,
    source: Optional[str] = None,
) -> None:
    """Log a contact activity event.

    Args:
        storage: SystemStorage instance
        contact_id: Contact UUID
        event_type: One of signal_touch, created, updated, enriched, history_added
        description: Human-readable description of what happened
        source: Origin (email, calendar, imessage, chief, manual)
    """
    try:
        activity_id = str(uuid.uuid4())
        storage.execute(
            """INSERT INTO contact_activity (id, contact_id, event_type, description, source)
               VALUES (?, ?, ?, ?, ?)""",
            (activity_id, contact_id, event_type, description, source),
        )
    except Exception as e:
        # Activity logging is a side effect -- never block the primary operation
        logger.debug(f"Activity log failed for {contact_id}: {e}")
