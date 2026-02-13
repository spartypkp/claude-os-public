"""Unit tests for SessionRepository activity queries."""

from pathlib import Path
import sqlite3

from modules.sessions.repository import SessionRepository


def test_get_sessions_for_activity_orders_active_first(test_db):
    repo = SessionRepository(Path(test_db))

    conn = sqlite3.connect(test_db)
    conn.execute("""
        INSERT INTO sessions (
            session_id, role, mode, status_text, started_at, last_seen_at, created_at, ended_at
        ) VALUES (
            'ended-1', 'builder', 'interactive', 'done',
            datetime('now', '-2 hours'), datetime('now', '-2 hours'), datetime('now', '-2 hours'),
            datetime('now', '-1 hours')
        )
    """)
    conn.execute("""
        INSERT INTO sessions (
            session_id, role, mode, status_text, started_at, last_seen_at, created_at, ended_at
        ) VALUES (
            'active-1', 'builder', 'interactive', 'working',
            datetime('now', '-1 hours'), datetime('now', '-10 minutes'), datetime('now', '-1 hours'),
            NULL
        )
    """)
    conn.commit()
    conn.close()

    sessions = repo.get_sessions_for_activity()
    assert sessions[0]["session_id"] == "active-1"
