"""Integration tests for sessions activity endpoint."""


def test_sessions_activity_includes_recent(client, test_db):
    import sqlite3

    conn = sqlite3.connect(test_db)
    conn.execute("""
        INSERT INTO sessions (
            session_id, role, mode, status_text, started_at, last_seen_at, created_at
        )
        VALUES (
            'test-session-activity', 'builder', 'interactive', 'testing',
            datetime('now'), datetime('now'), datetime('now')
        )
    """)
    conn.commit()
    conn.close()

    response = client.get("/api/sessions/activity")
    assert response.status_code == 200
    payload = response.json()
    sessions = payload.get("sessions", [])
    assert any(s["session_id"] == "test-session-activity" for s in sessions)
