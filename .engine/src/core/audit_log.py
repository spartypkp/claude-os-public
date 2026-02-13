"""
Core Audit Log - Persistent event storage for system reconstruction.

Different from core/events.py (real-time, ephemeral pub/sub).
This is persistent database storage for historical analysis.

Used by Chief for debriefs, Memory Claude for pattern detection.

Usage:
    from core.audit_log import log_event, get_events

    log_event("session", "started", actor="abc123", data={"role": "chief"})
    events = get_events(date="2026-01-18", event_type="session")
"""

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, List

from .config import settings
from .database import get_db


def log_event(
    event_type: str,
    event_action: str,
    actor: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Log an event to the audit log.

    Args:
        event_type: Type of event (session, priority, calendar, worker, marker)
        event_action: Action taken (started, ended, created, completed, etc.)
        actor: Who triggered the event (session_id, worker_id, 'will')
        data: Event-specific payload

    Returns:
        The event ID (8-char UUID prefix)
    """
    event_id = str(uuid.uuid4())[:8]
    now = datetime.now(settings.timezone)
    timestamp = now.isoformat()
    date_str = now.strftime("%Y-%m-%d")
    data_json = json.dumps(data) if data else None

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO events (id, timestamp, event_type, event_action, actor, data, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, timestamp, event_type, event_action, actor, data_json, date_str)
        )
        conn.commit()

    return event_id


def get_events(
    date: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Query events from the audit log.

    Args:
        date: ISO date (YYYY-MM-DD), defaults to today
        event_type: Filter by event type
        limit: Maximum number of events

    Returns:
        List of event dicts
    """
    if date is None:
        date = datetime.now(settings.timezone).strftime("%Y-%m-%d")

    with get_db() as conn:
        if event_type:
            cursor = conn.execute(
                """
                SELECT id, timestamp, event_type, event_action, actor, data
                FROM events
                WHERE date = ? AND event_type = ?
                ORDER BY timestamp ASC
                LIMIT ?
                """,
                (date, event_type, limit)
            )
        else:
            cursor = conn.execute(
                """
                SELECT id, timestamp, event_type, event_action, actor, data
                FROM events
                WHERE date = ?
                ORDER BY timestamp ASC
                LIMIT ?
                """,
                (date, limit)
            )

        events = []
        for row in cursor.fetchall():
            event = {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "event_type": row["event_type"],
                "event_action": row["event_action"],
                "actor": row["actor"],
            }
            if row["data"]:
                try:
                    event["data"] = json.loads(row["data"])
                except json.JSONDecodeError:
                    event["data"] = row["data"]
            events.append(event)

        return events


# === Backwards Compatibility ===
# Alias for migration period
emit_event = log_event
