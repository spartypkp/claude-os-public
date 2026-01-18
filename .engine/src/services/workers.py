"""Task lifecycle management service (attention state, acknowledgment, clarifications)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .storage import SystemStorage


class TaskService:
    """Manages task attention lifecycle (ack, snooze, clarification answers).

    This service handles the notification/attention aspect of tasks:
    - Marking tasks as needing attention (completed, failed, clarifications)
    - Acknowledging/snoozing tasks
    - Answering clarification questions
    - Querying tasks by attention state
    """

    def __init__(self, storage: SystemStorage):
        self.storage = storage

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def add_attention(
        self,
        task_id: str,
        *,
        kind: str,
        title: str,
        domain: Optional[str] = None,
        data: Dict[str, Any],
        severity: str = "normal",
        session_id: Optional[str] = None,
    ) -> None:
        """Mark task as needing attention by updating attention fields.

        Args:
            task_id: Task ID to update
            kind: Item kind (result, clarification, alert, followup)
            title: Display title
            domain: Optional domain (Career, Planning, Health, etc.)
            data: Additional flexible metadata (summary, highlights, question, etc.)
            severity: Severity level (urgent, high, normal, low)
            session_id: Optional session ID for clarification resume capability
        """
        self.storage.execute(
            """
            UPDATE workers
            SET attention_kind = ?,
                attention_title = ?,
                attention_domain = ?,
                attention_data_json = ?,
                attention_severity = ?,
                clarification_session_id = ?,
                notify_after = NULL,
                updated_at = ?
            WHERE id = ?
            """,
            (
                kind,
                title,
                domain,
                json.dumps(data, sort_keys=True),
                severity,
                session_id,
                self._now().isoformat(),
                task_id,
            ),
        )

    def list_pending(self, include_future: bool = False) -> List[Dict[str, Any]]:
        """Get tasks needing attention (unacked states)."""
        now = self._now().isoformat()
        condition = "" if include_future else "AND (notify_after IS NULL OR notify_after <= ?)"
        params = () if include_future else (now,)
        rows = self.storage.fetchall(
            f"""
            SELECT *
            FROM workers
            WHERE status IN ('complete', 'failed', 'clarification_answered', 'snoozed')
            {condition}
            ORDER BY notify_after IS NULL DESC, notify_after ASC, created_at ASC
            """,
            params,
        )
        return [self._row_to_dict(row) for row in rows]

    def list_recent_completed(self, *, limit: int = 5) -> List[Dict[str, Any]]:
        """Get recently completed/failed tasks."""
        rows = self.storage.fetchall(
            """
            SELECT *
            FROM workers
            WHERE status IN ('complete', 'failed', 'cancelled')
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [self._row_to_dict(row) for row in rows]

    def cancel(self, task_id: str) -> Dict[str, Any]:
        """Cancel a task.

        Returns:
            Dict with task_id
        """
        task = self.storage.fetchone(
            "SELECT status FROM workers WHERE id = ?",
            (task_id,)
        )

        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Transition to cancelled status
        self.storage.execute(
            """
            UPDATE workers
            SET status = 'cancelled', updated_at = ?
            WHERE id = ?
            """,
            (self._now().isoformat(), task_id),
        )

        return {"task_id": task_id}

    def snooze(self, task_id: str, *, notify_after: datetime) -> None:
        """Snooze a task's attention until notify_after time."""
        self.storage.execute(
            """
            UPDATE workers
            SET status = 'snoozed', notify_after = ?, updated_at = ?
            WHERE id = ?
            """,
            (notify_after.isoformat(), self._now().isoformat(), task_id),
        )

    def delete(self, task_id: str) -> None:
        """Cancel task (soft delete - preserves history)."""
        self.storage.execute(
            """
            UPDATE workers
            SET status = 'cancelled',
                last_error = 'Deleted by user',
                updated_at = ?
            WHERE id = ?
            """,
            (self._now().isoformat(), task_id)
        )

    def answer_clarification(self, task_id: str, answer: str) -> tuple[str, str]:
        """Answer a clarification and return (task_id, session_id) for resume.

        Args:
            task_id: The task ID
            answer: The answer text

        Returns:
            Tuple of (task_id, session_id) so caller can resume the task

        Raises:
            ValueError: If task not found or not awaiting clarification
        """
        # Get the task and verify it's awaiting clarification
        row = self.storage.fetchone(
            "SELECT status, clarification_session_id FROM workers WHERE id = ?",
            (task_id,)
        )
        if not row:
            raise ValueError(f"Task {task_id} not found")

        if row["status"] != "awaiting_clarification":
            raise ValueError(f"Task {task_id} is not awaiting clarification (status={row['status']})")

        # Store the answer and transition to clarification_answered
        self.storage.execute(
            """
            UPDATE workers
            SET status = 'clarification_answered',
                clarification_answer = ?,
                clarification_answered_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (answer, self._now().isoformat(), self._now().isoformat(), task_id)
        )

        # Return task_id and session_id for resume
        session_id = row["clarification_session_id"] or ""
        return task_id, session_id

    def list_answered_clarifications(self) -> List[Dict[str, Any]]:
        """Get all answered clarifications ready for resume.

        Returns clarifications that have been answered and are in clarification_answered state.
        These need to be processed by the executor to resume tasks.
        """
        rows = self.storage.fetchall(
            """
            SELECT *
            FROM workers
            WHERE status = 'clarification_answered'
            ORDER BY clarification_answered_at ASC
            """
        )
        return [self._row_to_dict(row) for row in rows]

    # Removed: get_unnotified_for_session() - use get_unnotified_for_conversation()
    # Removed: get_notified_but_unacked() - use get_notified_but_unacked_for_conversation()

    def get_running_tasks(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get tasks currently running.

        Returns tasks that:
        - Have status='running'
        - If session_id provided: spawned by this session OR orphaned (no spawning session)
        - Ordered by created_at (oldest first)

        Args:
            session_id: Optional session ID to filter by (only show tasks spawned by this session)

        Returns:
            List of task dicts with id, short_id, type, started_at (aliased from created_at), summary
        """
        if session_id:
            rows = self.storage.fetchall(
                """
                SELECT
                    t.id,
                    SUBSTR(t.id, 1, 8) as short_id,
                    t.task_type as type,
                    t.created_at as started_at,
                    t.params_json
                FROM workers t
                WHERE t.status = 'running'
                  AND (t.spawned_by_session = ? OR t.spawned_by_session IS NULL)
                ORDER BY t.created_at ASC
                """,
                (session_id,)
            )
        else:
            rows = self.storage.fetchall(
                """
                SELECT
                    t.id,
                    SUBSTR(t.id, 1, 8) as short_id,
                    t.task_type as type,
                    t.created_at as started_at,
                    t.params_json
                FROM workers t
                WHERE t.status = 'running'
                ORDER BY t.created_at ASC
                """
            )

        # Convert rows to dicts with summary extracted from params
        results = []
        for row in rows:
            task_dict = dict(row)

            # Extract summary from params_json
            if task_dict.get('params_json'):
                try:
                    params = json.loads(task_dict['params_json'])
                    task_dict['summary'] = params.get('description', 'Running task')
                except (json.JSONDecodeError, TypeError):
                    task_dict['summary'] = 'Running task'
            else:
                task_dict['summary'] = 'Running task'

            results.append(task_dict)

        return results

    def get_pending_tasks(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get tasks waiting to start.

        Returns tasks that:
        - Have status='pending'
        - If session_id provided: spawned by this session OR orphaned (no spawning session)
        - Not scheduled for future execution (execute_at is NULL or in past)
        - Ordered by created_at (oldest first)

        Args:
            session_id: Optional session ID to filter by (only show tasks spawned by this session)

        Returns:
            List of task dicts with id, short_id, type, created_at, summary, waiting_reason
        """
        now = self._now().isoformat()
        if session_id:
            rows = self.storage.fetchall(
                """
                SELECT
                    t.id,
                    SUBSTR(t.id, 1, 8) as short_id,
                    t.task_type as type,
                    t.created_at,
                    t.params_json,
                    t.depends_on_json,
                    t.execute_at
                FROM workers t
                WHERE t.status = 'pending'
                  AND (t.spawned_by_session = ? OR t.spawned_by_session IS NULL)
                  AND (t.execute_at IS NULL OR t.execute_at <= ?)
                ORDER BY t.created_at ASC
                """,
                (session_id, now)
            )
        else:
            rows = self.storage.fetchall(
                """
                SELECT
                    t.id,
                    SUBSTR(t.id, 1, 8) as short_id,
                    t.task_type as type,
                    t.created_at,
                    t.params_json,
                    t.depends_on_json,
                    t.execute_at
                FROM workers t
                WHERE t.status = 'pending'
                  AND (t.execute_at IS NULL OR t.execute_at <= ?)
                ORDER BY t.created_at ASC
                """,
                (now,)
            )

        # Convert rows to dicts with summary and waiting reason
        results = []
        for row in rows:
            task_dict = dict(row)
            # Extract summary from params_json
            if task_dict.get('params_json'):
                try:
                    params = json.loads(task_dict['params_json'])
                    task_dict['summary'] = params.get('description', 'Pending task')
                except (json.JSONDecodeError, TypeError):
                    task_dict['summary'] = 'Pending task'
            else:
                task_dict['summary'] = 'Pending task'

            # Determine waiting reason
            if task_dict.get('depends_on_json'):
                try:
                    depends_on = json.loads(task_dict['depends_on_json'])
                    if depends_on:
                        task_dict['waiting_reason'] = f"depends on {depends_on[0][:8]}"
                    else:
                        task_dict['waiting_reason'] = "waiting"
                except (json.JSONDecodeError, TypeError):
                    task_dict['waiting_reason'] = "waiting"
            elif task_dict.get('execute_at'):
                task_dict['waiting_reason'] = f"scheduled for {task_dict['execute_at']}"
            else:
                task_dict['waiting_reason'] = "waiting"

            results.append(task_dict)

        return results

    # Removed: mark_notified() - use mark_conversation_notified()

    def cleanup_old_notifications(self, days: int = 30) -> int:
        """Prune old conversation notifications to prevent unbounded table growth.

        Args:
            days: Keep notifications from last N days, delete older

        Returns:
            Number of rows deleted
        """
        from datetime import timedelta

        cutoff = self._now() - timedelta(days=days)
        cutoff = cutoff.replace(hour=0, minute=0, second=0, microsecond=0)

        cursor = self.storage.execute(
            "DELETE FROM conversation_notifications WHERE notified_at < ?",
            (cutoff.isoformat(),)
        )
        return cursor.rowcount

    # === Conversation-scoped notification methods (new) ===

    def get_unnotified_for_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get tasks completed since this conversation was last notified.

        Conversation-scoped version - workers survive session resets.

        Returns tasks that:
        - Are complete with attention_kind='result'
        - Have no dependent children (leaf tasks only)
        - Belong to this conversation
        - Haven't been notified to this conversation yet
        - Ordered oldest-first

        Args:
            conversation_id: Conversation ID to check notifications for

        Returns:
            List of task dicts with id, short_id, type, completed_at, attention_data_json
        """
        rows = self.storage.fetchall(
            """
            SELECT
                t.id,
                SUBSTR(t.id, 1, 8) as short_id,
                t.task_type as type,
                t.completed_at,
                t.attention_data_json,
                t.report_summary,
                t.report_md
            FROM workers t
            WHERE t.status = 'complete'
              AND t.attention_kind = 'result'
              AND t.has_dependent_children = 0
              AND t.conversation_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM conversation_notifications cn
                WHERE cn.conversation_id = ? AND cn.worker_id = t.id
              )
            ORDER BY t.completed_at ASC
            """,
            (conversation_id, conversation_id)
        )

        # Convert rows to dicts with parsed attention_data
        results = []
        for row in rows:
            task_dict = dict(row)
            # Get summary from attention_data_json or fallback to report_summary
            summary = None
            if task_dict.get('attention_data_json'):
                try:
                    attention_data = json.loads(task_dict['attention_data_json'])
                    summary = attention_data.get('summary')
                except (json.JSONDecodeError, TypeError):
                    pass
            if not summary:
                summary = task_dict.get('report_summary') or 'No summary available'
            task_dict['summary'] = summary

            results.append(task_dict)

        return results

    def get_notified_but_unacked_for_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get tasks that were notified to this conversation but still unacked.

        Conversation-scoped version - reminds across session resets.

        Returns tasks that:
        - Were already notified to this conversation
        - Are still complete and unacked
        - Belong to this conversation

        Args:
            conversation_id: Conversation ID to check

        Returns:
            List of task dicts with full info for reminder display
        """
        rows = self.storage.fetchall(
            """
            SELECT
                t.id,
                SUBSTR(t.id, 1, 8) as short_id,
                t.task_type as type,
                t.completed_at,
                t.attention_data_json,
                t.report_summary
            FROM workers t
            INNER JOIN conversation_notifications cn ON cn.worker_id = t.id
            WHERE cn.conversation_id = ?
              AND t.status IN ('complete', 'failed', 'snoozed')
              AND t.conversation_id = ?
            ORDER BY cn.notified_at ASC
            """,
            (conversation_id, conversation_id)
        )

        # Convert rows to dicts with parsed attention_data
        results = []
        for row in rows:
            task_dict = dict(row)
            # Get summary from attention_data_json or fallback to report_summary
            summary = None
            if task_dict.get('attention_data_json'):
                try:
                    attention_data = json.loads(task_dict['attention_data_json'])
                    summary = attention_data.get('summary')
                except (json.JSONDecodeError, TypeError):
                    pass
            if not summary:
                summary = task_dict.get('report_summary') or 'No summary available'
            task_dict['summary'] = summary

            results.append(task_dict)

        return results

    def mark_conversation_notified(self, conversation_id: str, worker_ids: List[str]) -> None:
        """Mark workers as notified for a specific conversation.

        Prevents duplicate notifications across session resets.
        Idempotent - safe to call multiple times with same data.

        Args:
            conversation_id: Conversation ID that was notified
            worker_ids: List of worker IDs to mark as notified
        """
        if not worker_ids:
            return

        # Batch insert with INSERT OR IGNORE for idempotency
        params = [(conversation_id, worker_id) for worker_id in worker_ids]
        self.storage.executemany(
            """
            INSERT OR IGNORE INTO conversation_notifications (conversation_id, worker_id)
            VALUES (?, ?)
            """,
            params
        )

    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert task row to attention-focused dict."""
        # Parse attention data if present
        attention_data = {}
        if row["attention_data_json"]:
            try:
                attention_data = json.loads(row["attention_data_json"])
            except (json.JSONDecodeError, TypeError):
                pass

        result = {
            "id": row["id"],
            "task_id": row["id"],  # For backwards compatibility
            "task_type": row["task_type"],
            "status": row["status"],
            # Attention fields
            "kind": row["attention_kind"],
            "title": row["attention_title"],
            "severity": row["attention_severity"] or "normal",
            "domain": row["attention_domain"],
            "data": attention_data,
            # Lifecycle
            "notify_after": row["notify_after"],
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],  # ADDED: Include completion timestamp
            # Clarification support
            "session_id": row["clarification_session_id"],
            "answer_text": row["clarification_answer"],
            "answered_at": row["clarification_answered_at"],
        }
        # Filter out None values for cleaner output
        return {k: v for k, v in result.items() if v is not None}


__all__ = ["TaskService"]
