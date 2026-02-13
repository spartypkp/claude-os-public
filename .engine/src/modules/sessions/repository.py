"""
Session repository - all database operations.
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Import directly to avoid circular import (services/__init__.py imports us)
from core.storage import SystemStorage
from .models import Session


class SessionRepository:
    """Database operations for sessions."""

    def __init__(self, db_path: Path):
        self.db_path = db_path

    def _get_db(self) -> SystemStorage:
        """Get a database connection."""
        return SystemStorage(self.db_path)

    def _now(self) -> str:
        """Get current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    # =========================================================================
    # QUERIES
    # =========================================================================

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT * FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            if row:
                return Session.from_row(row)
            return None
        finally:
            db.close()

    def get_active_sessions(self) -> list[Session]:
        """Get all sessions where ended_at IS NULL."""
        db = self._get_db()
        try:
            rows = db.fetchall(
                "SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC"
            )
            return [Session.from_row(row) for row in rows]
        finally:
            db.close()

    def find_session_by_pane(self, tmux_pane: str) -> Optional[Session]:
        """Find active session in a tmux pane."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT * FROM sessions WHERE tmux_pane = ? AND ended_at IS NULL",
                (tmux_pane,)
            )
            if row:
                return Session.from_row(row)
            return None
        finally:
            db.close()

    def get_conversation_id(self, session_id: str) -> Optional[str]:
        """Get conversation_id for a session."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT conversation_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            return row["conversation_id"] if row else None
        finally:
            db.close()

    def get_session_row(self, session_id: str) -> Optional[dict]:
        """Get session as raw dict (for API responses that need specific fields)."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT * FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            return dict(row) if row else None
        finally:
            db.close()

    # =========================================================================
    # ACTIVITY VIEW QUERIES
    # =========================================================================

    def get_sessions_for_activity(self) -> list[dict]:
        """Get sessions for activity view (active + started today)."""
        db = self._get_db()
        try:
            rows = db.fetchall("""
                SELECT session_id, started_at, last_seen_at, ended_at, current_state, cwd, tmux_pane,
                       role, mode, session_type, session_subtype, description, mission_execution_id,
                       status_text, conversation_id, parent_session_id
                FROM sessions
                WHERE (
                    ended_at IS NULL
                    OR
                    (ended_at IS NOT NULL AND date(started_at) = date('now', 'localtime'))
                )
                ORDER BY COALESCE(ended_at, '9999-12-31') DESC, started_at DESC
            """)
            return [dict(row) for row in rows]
        finally:
            db.close()

    # =========================================================================
    # CONVERSATION QUERIES
    # =========================================================================

    def count_conversation_sessions(self, conversation_id: str) -> int:
        """Count total sessions in a conversation."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT COUNT(*) as total FROM sessions WHERE conversation_id = ?",
                (conversation_id,)
            )
            return row["total"] if row else 0
        finally:
            db.close()

    def get_session_started_at(self, session_id: str) -> Optional[str]:
        """Get started_at timestamp for a session (for pagination)."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT started_at FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            return row["started_at"] if row else None
        finally:
            db.close()

    def get_conversation_sessions(
        self,
        conversation_id: str,
        *,
        before_started_at: Optional[str] = None,
        limit: Optional[int] = None,
        hours: Optional[int] = None,
    ) -> list[dict]:
        """Get sessions in a conversation with optional filters.

        Args:
            conversation_id: The conversation to query
            before_started_at: Only get sessions started before this timestamp
            limit: Maximum number of sessions to return
            hours: Only get sessions from the last N hours
        """
        db = self._get_db()
        try:
            if before_started_at and limit:
                rows = db.fetchall("""
                    SELECT session_id, role, mode, started_at, ended_at, end_reason, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    AND started_at < ?
                    ORDER BY started_at DESC
                    LIMIT ?
                """, (conversation_id, before_started_at, limit))
            elif limit:
                rows = db.fetchall("""
                    SELECT session_id, role, mode, started_at, ended_at, end_reason, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    ORDER BY started_at DESC
                    LIMIT ?
                """, (conversation_id, limit))
            elif hours:
                rows = db.fetchall("""
                    SELECT session_id, role, mode, started_at, ended_at, end_reason, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    AND started_at > datetime('now', ? || ' hours')
                    ORDER BY started_at DESC
                """, (conversation_id, f"-{hours}"))
            else:
                rows = db.fetchall("""
                    SELECT session_id, role, mode, started_at, ended_at, end_reason, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    ORDER BY started_at DESC
                """, (conversation_id,))
            return [dict(row) for row in rows]
        finally:
            db.close()

    def get_active_sessions_for_conversation(self, conversation_id: str) -> list[dict]:
        """Get ALL active sessions for a conversation (for cleanup/close).

        Returns all sessions where ended_at IS NULL, ordered by started_at DESC.
        """
        db = self._get_db()
        try:
            rows = db.fetchall("""
                SELECT session_id, role, conversation_id, tmux_pane, mode, status_text
                FROM sessions
                WHERE conversation_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
            """, (conversation_id,))
            return [dict(row) for row in rows]
        finally:
            db.close()

    def get_active_session_for_conversation(self, conversation_id: str) -> Optional[dict]:
        """Get the currently active session for a conversation.

        Returns the most recent session where ended_at IS NULL.
        If no active session, returns None.
        """
        db = self._get_db()
        try:
            row = db.fetchone("""
                SELECT session_id, role, mode, started_at, ended_at, transcript_path,
                       tmux_pane, status_text, current_state, claude_session_id
                FROM sessions
                WHERE conversation_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            """, (conversation_id,))
            return dict(row) if row else None
        finally:
            db.close()

    def get_conversation_info(self, conversation_id: str) -> Optional[dict]:
        """Get conversation metadata (first session, latest session, session count)."""
        db = self._get_db()
        try:
            # Get session count and date range
            row = db.fetchone("""
                SELECT
                    COUNT(*) as session_count,
                    MIN(started_at) as first_started_at,
                    MAX(started_at) as last_started_at,
                    (SELECT role FROM sessions WHERE conversation_id = ? ORDER BY started_at DESC LIMIT 1) as role,
                    (SELECT mode FROM sessions WHERE conversation_id = ? ORDER BY started_at DESC LIMIT 1) as mode
                FROM sessions
                WHERE conversation_id = ?
            """, (conversation_id, conversation_id, conversation_id))

            if not row or row["session_count"] == 0:
                return None

            return {
                "conversation_id": conversation_id,
                "session_count": row["session_count"],
                "first_started_at": row["first_started_at"],
                "last_started_at": row["last_started_at"],
                "role": row["role"],
                "mode": row["mode"],
            }
        finally:
            db.close()

    # =========================================================================
    # STATE UPDATES
    # =========================================================================

    def heartbeat(self, session_id: str) -> bool:
        """Update last_seen_at timestamp."""
        db = self._get_db()
        try:
            now = self._now()
            db.execute(
                "UPDATE sessions SET last_seen_at = ?, updated_at = ? WHERE session_id = ?",
                (now, now, session_id)
            )
            return True
        except Exception:
            return False
        finally:
            db.close()

    def set_status(self, session_id: str, status_text: str) -> bool:
        """Set session status_text."""
        db = self._get_db()
        try:
            db.execute(
                "UPDATE sessions SET status_text = ?, updated_at = ? WHERE session_id = ?",
                (status_text, self._now(), session_id)
            )
            return True
        except Exception:
            return False
        finally:
            db.close()

    # NOTE: set_state() removed - dead code. current_state only set to "ended" via mark_ended().

    def mark_ended(self, session_id: str, reason: str) -> bool:
        """Mark a session as ended."""
        db = self._get_db()
        try:
            now = self._now()
            db.execute("""
                UPDATE sessions
                SET ended_at = ?, end_reason = ?, current_state = 'ended', updated_at = ?
                WHERE session_id = ?
            """, (now, reason, now, session_id))
            return True
        except Exception:
            return False
        finally:
            db.close()

    def mark_all_chief_ended(self, reason: str) -> bool:
        """Mark all active chief sessions as ended."""
        db = self._get_db()
        try:
            db.execute("""
                UPDATE sessions
                SET ended_at = ?, end_reason = ?, current_state = 'ended'
                WHERE role = 'chief' AND ended_at IS NULL
            """, (self._now(), reason))
            return True
        except Exception:
            return False
        finally:
            db.close()

    # =========================================================================
    # HANDOFFS
    # =========================================================================

    def create_handoff(
        self,
        session_id: str,
        role: str,
        mode: str,
        tmux_pane: Optional[str],
        handoff_path: str,
        reason: str,
    ) -> str:
        """Create a handoff record. Returns handoff_id."""
        handoff_id = str(uuid.uuid4())
        now = self._now()
        db = self._get_db()
        try:
            db.execute("""
                INSERT INTO handoffs
                (id, session_id, role, mode, tmux_pane, handoff_path, reason,
                 status, requested_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'executing', ?, ?, ?)
            """, (
                handoff_id, session_id, role, mode,
                tmux_pane, handoff_path, reason, now, now, now
            ))
            return handoff_id
        finally:
            db.close()

    def complete_handoff(self, handoff_id: str, new_session_id: str) -> bool:
        """Mark a handoff as complete."""
        db = self._get_db()
        try:
            now = self._now()
            db.execute("""
                UPDATE handoffs
                SET status = 'complete', completed_at = ?, new_session_id = ?, updated_at = ?
                WHERE id = ?
            """, (now, new_session_id, now, handoff_id))
            return True
        finally:
            db.close()

    def fail_handoff(self, handoff_id: str, error: str) -> bool:
        """Mark a handoff as failed."""
        db = self._get_db()
        try:
            db.execute("""
                UPDATE handoffs
                SET status = 'failed', error = ?, updated_at = ?
                WHERE id = ?
            """, (error, self._now(), handoff_id))
            return True
        finally:
            db.close()

    # =========================================================================
    # CLEANUP
    # =========================================================================

    def get_potentially_orphaned_sessions(self) -> list[dict]:
        """Get sessions that might be orphaned (for cleanup check)."""
        db = self._get_db()
        try:
            rows = db.fetchall("""
                SELECT session_id, tmux_pane, last_seen_at
                FROM sessions
                WHERE ended_at IS NULL
            """)
            return [dict(row) for row in rows]
        finally:
            db.close()

    # =========================================================================
    # TEAM RESOLUTION
    # =========================================================================

    def resolve_id(self, id: str) -> Optional[dict]:
        """Resolve a team ID to the active session.

        Accepts either:
        - conversation_id (long, dash-separated, contains role name) → active session in that conversation
        - session_id prefix (8-char hex) → direct lookup

        Returns dict with session_id, role, conversation_id, tmux_pane, mode, status_text, spec_path
        or None if not found.
        """
        db = self._get_db()
        try:
            # Try conversation_id first (longer format with dashes and role name)
            row = db.fetchone("""
                SELECT session_id, role, conversation_id, tmux_pane, mode, status_text, spec_path
                FROM sessions
                WHERE conversation_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC LIMIT 1
            """, (id,))

            if row:
                return dict(row)

            # Fall back to session_id prefix match
            row = db.fetchone("""
                SELECT session_id, role, conversation_id, tmux_pane, mode, status_text, spec_path
                FROM sessions
                WHERE session_id LIKE ? AND ended_at IS NULL
            """, (f"{id}%",))

            return dict(row) if row else None
        finally:
            db.close()

    def list_active_conversations(self) -> list[dict]:
        """List active sessions grouped by conversation_id.

        Returns conversation-level view with: conversation_id, role,
        active_session_id, mode, status_text, sessions_count, started_at, spec_path.
        """
        db = self._get_db()
        try:
            # Get all active sessions
            rows = db.fetchall("""
                SELECT s.session_id, s.role, s.conversation_id, s.mode,
                       s.status_text, s.started_at, s.spec_path,
                       (SELECT COUNT(*) FROM sessions s2
                        WHERE s2.conversation_id = s.conversation_id) as sessions_count
                FROM sessions s
                WHERE s.ended_at IS NULL
                ORDER BY s.started_at DESC
            """)

            # Group by conversation_id, keeping only the most recent session per conversation
            seen = set()
            conversations = []
            for row in rows:
                conv_id = row["conversation_id"] or row["session_id"]
                if conv_id in seen:
                    continue
                seen.add(conv_id)
                conversations.append({
                    "conversation_id": conv_id,
                    "role": row["role"] or "unknown",
                    "active_session_id": row["session_id"],
                    "mode": row["mode"],
                    "status_text": row["status_text"],
                    "sessions_count": row["sessions_count"],
                    "started_at": row["started_at"],
                    "spec_path": row["spec_path"],
                })
            return conversations
        finally:
            db.close()

    # =========================================================================
    # CHIEF STATUS
    # =========================================================================

    def get_activity_summary(self, since_minutes: int = 15) -> list[dict]:
        """Get activity log entries for the last N minutes."""
        db = self._get_db()
        try:
            rows = db.fetchall("""
                SELECT frontmost_app, idle_seconds
                FROM activity_log
                WHERE timestamp > datetime('now', ? || ' minutes')
                ORDER BY timestamp ASC
            """, (f"-{since_minutes}",))
            return [dict(row) for row in rows]
        finally:
            db.close()

    # =========================================================================
    # SETTINGS
    # =========================================================================

    def get_model_for_role(self, role: str, defaults: dict[str, str]) -> Optional[str]:
        """Get the configured model for a role from settings."""
        # Normalize role for lookup
        lookup_role = role if role in defaults else "worker"
        key = f"model_{lookup_role}"

        db = self._get_db()
        try:
            row = db.fetchone("SELECT value FROM settings WHERE key = ?", (key,))
            if row:
                return row["value"]
            return defaults.get(lookup_role)
        except Exception:
            return defaults.get(lookup_role)
        finally:
            db.close()
