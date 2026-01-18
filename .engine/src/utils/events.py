"""
Event Bus - System Timeline Events

Central event logging for system activity reconstruction.
Used by Chief for debriefs, Memory Claude for pattern detection.

Event Types:
- session: started, ended, handoff
- priority: created, completed, deleted
- calendar: created, modified, deleted
- worker: spawned, completed, acked, failed
- marker: manual markers from user or Claude

Usage:
    from utils.events import emit_event

    emit_event("session", "started", actor="abc123", data={"role": "focus", "status": "DS&A"})
"""

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo


# Database path
REPO_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"

# User is in San Francisco - all event timestamps in Pacific time
PACIFIC = ZoneInfo("America/Los_Angeles")


def emit_event(
    event_type: str,
    event_action: str,
    actor: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    db_path: Optional[Path] = None,
) -> str:
    """
    Emit an event to the event bus.

    Args:
        event_type: Type of event (session, priority, calendar, worker, marker)
        event_action: Action taken (started, ended, created, completed, etc.)
        actor: Who triggered the event (session_id, worker_id, 'will')
        data: Event-specific payload as a dict
        db_path: Optional custom database path (for testing)

    Returns:
        The event ID (8-char UUID prefix)

    Example:
        emit_event("session", "started", actor="abc123", data={"role": "focus"})
        emit_event("priority", "completed", actor="abc123", data={"id": "1bb149d6"})
    """
    event_id = str(uuid.uuid4())[:8]
    now_pacific = datetime.now(PACIFIC)
    timestamp = now_pacific.isoformat()
    date_pacific = now_pacific.strftime("%Y-%m-%d")
    data_json = json.dumps(data) if data else None

    db = db_path or DB_PATH
    conn = sqlite3.connect(str(db))

    try:
        conn.execute(
            """
            INSERT INTO events (id, timestamp, event_type, event_action, actor, data, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, timestamp, event_type, event_action, actor, data_json, date_pacific)
        )
        conn.commit()
    finally:
        conn.close()

    return event_id


def get_events(
    date: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
    db_path: Optional[Path] = None,
) -> list:
    """
    Query events from the event bus.

    Args:
        date: ISO date (YYYY-MM-DD), defaults to today
        event_type: Filter by event type (session, priority, etc.)
        limit: Maximum number of events to return
        db_path: Optional custom database path (for testing)

    Returns:
        List of event dicts with id, timestamp, event_type, event_action, actor, data
    """
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")

    db = db_path or DB_PATH
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row

    try:
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
    finally:
        conn.close()
