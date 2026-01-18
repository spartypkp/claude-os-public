"""Scheduled work service built atop SystemStorage."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .storage import SystemStorage


class ScheduledWorkService:
    """CRUD helpers for scheduled tasks."""

    def __init__(self, storage: SystemStorage):
        self.storage = storage

    # ------------------------------------------------------------------ helpers
    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _task_from_row(self, row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "task_type": row["task_type"],
            "params": json.loads(row["params_json"] or "{}"),
            "execute_at": row["execute_at"],
            "status": row["status"],
            "priority": row["priority"],
            "retry_count": row["retry_count"],
            "retry_at": row["retry_at"],
            "dedupe_hash": row["dedupe_hash"],
            "last_error": row["last_error"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "spawned_by_session": row["spawned_by_session"],
        }

    # ---------------------------------------------------------------- scheduling
    def schedule_task(
        self,
        *,
        task_type: str,
        params: Dict[str, Any] | None = None,
        execute_at: Optional[datetime] = None,
        priority: int = 0,
        dedupe_hash: Optional[str] = None,
        spawned_by_session: Optional[str] = None,
        conversation_id: Optional[str] = None,  # Jan 2026: primary ownership
    ) -> str:
        task_id = str(uuid.uuid4())
        now = self._now().isoformat()
        execute_at_str = execute_at.isoformat() if execute_at else None
        params_json = json.dumps(params or {}, sort_keys=True)
        if dedupe_hash:
            existing = self.storage.fetchone(
                """
                SELECT id
                FROM workers
                WHERE dedupe_hash = ?
                  AND status = 'pending'
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (dedupe_hash,),
            )
            if existing:
                self.storage.execute(
                    """
                    UPDATE workers
                    SET execute_at = ?, updated_at = ?, params_json = ?, priority = ?
                    WHERE id = ?
                    """,
                    (execute_at_str, now, params_json, priority, existing["id"]),
                )
                return existing["id"]
            # Release dedupe hash on completed/failed tasks so new rows can be inserted
            self.storage.execute(
                """
                UPDATE workers
                SET dedupe_hash = NULL
                WHERE dedupe_hash = ?
                  AND status != 'pending'
                """,
                (dedupe_hash,),
            )
        self.storage.execute(
            """
            INSERT INTO workers (
                id, task_type, params_json, execute_at, status, priority,
                retry_count, retry_at, dedupe_hash, last_error, created_at, updated_at,
                spawned_by_session, conversation_id
            ) VALUES (?, ?, ?, ?, 'pending', ?, 0, NULL, ?, NULL, ?, ?, ?, ?)
            """,
            (
                task_id,
                task_type,
                params_json,
                execute_at_str,
                priority,
                dedupe_hash,
                now,
                now,
                spawned_by_session,
                conversation_id,
            ),
        )

        return task_id

    def list_tasks(self, status: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        clauses = []
        params: List[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        limit_clause = "LIMIT ?" if limit else ""
        if limit:
            params.append(limit)
        rows = self.storage.fetchall(
            f"""
            SELECT *
            FROM workers
            {where}
            ORDER BY priority DESC, execute_at ASC
            {limit_clause}
            """,
            tuple(params),
        )
        return [self._task_from_row(row) for row in rows]

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        row = self.storage.fetchone("SELECT * FROM workers WHERE id = ?", (task_id,))
        return self._task_from_row(row) if row else None

    def cancel_task(self, task_id: str) -> None:
        """Cancel a task by marking it as cancelled."""
        # Use cancelled status to preserve debugging info
        # and properly handle running tasks
        now = self._now().isoformat()
        self.storage.execute(
            """
            UPDATE workers
            SET status = 'cancelled', last_error = 'Task cancelled by user', updated_at = ?
            WHERE id = ?
            """,
            (now, task_id),
        )

    def mark_running(self, task_id: str) -> None:
        self._update_status(task_id, "running")

    def mark_complete(self, task_id: str) -> None:
        self._update_status(task_id, "complete")

    def mark_failed(self, task_id: str, *, error: str, retry_at: Optional[datetime] = None) -> None:
        retry_at_str = retry_at.isoformat() if retry_at else None
        now = self._now().isoformat()
        self.storage.execute(
            """
            UPDATE workers
            SET status = ?, retry_count = retry_count + 1, retry_at = ?, last_error = ?, updated_at = ?
            WHERE id = ?
            """,
            ("failed" if retry_at is None else "pending", retry_at_str, error[:512], now, task_id),
        )

    def reset_task(self, task_id: str) -> None:
        self.storage.execute(
            """
            UPDATE workers
            SET status = 'pending', retry_at = NULL, last_error = NULL, updated_at = ?
            WHERE id = ?
            """,
            (self._now().isoformat(), task_id),
        )

    def fetch_runnable_tasks(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Fetch tasks ready to run (time reached)."""
        now = self._now().isoformat()

        rows = self.storage.fetchall(
            """
            SELECT *
            FROM workers
            WHERE status = 'pending'
              AND (execute_at IS NULL OR execute_at <= ?)
              AND (retry_at IS NULL OR retry_at <= ?)
            ORDER BY priority DESC, execute_at ASC
            LIMIT ?
            """,
            (now, now, limit),
        )
        return [self._task_from_row(row) for row in rows]

    def _update_status(self, task_id: str, status: str) -> None:
        self.storage.execute(
            """
            UPDATE workers
            SET status = ?, updated_at = ?, last_error = NULL, retry_at = NULL
            WHERE id = ?
            """,
            (status, self._now().isoformat(), task_id),
        )


__all__ = ["ScheduledWorkService"]
