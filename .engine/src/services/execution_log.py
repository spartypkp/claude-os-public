"""Execution log service for scheduled work."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .storage import SystemStorage


class ExecutionLogService:
    """Persist execution metadata for async tasks."""

    def __init__(self, storage: SystemStorage):
        self.storage = storage

    def log(
        self,
        *,
        task_id: Optional[str],
        task_type: str,
        status: str,
        tokens_input: int = 0,
        tokens_output: int = 0,
        tokens_total: int = 0,
        cost_usd: float = 0.0,
        duration_ms: int = 0,
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.storage.execute(
            """
            INSERT INTO executions (
                task_id, task_type, status, tokens_input, tokens_output, tokens_total,
                cost_usd, duration_ms, result_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                task_type,
                status,
                tokens_input,
                tokens_output,
                tokens_total,
                cost_usd,
                duration_ms,
                json.dumps(result or {}, sort_keys=True),
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    def recent(self, limit: int = 20) -> List[Dict[str, Any]]:
        rows = self.storage.fetchall(
            """
            SELECT * FROM executions
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [self._row_to_dict(row) for row in rows]

    def _row_to_dict(self, row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "task_id": row["task_id"],
            "task_type": row["task_type"],
            "status": row["status"],
            "tokens_input": row["tokens_input"],
            "tokens_output": row["tokens_output"],
            "tokens_total": row["tokens_total"],
            "cost_usd": row["cost_usd"],
            "duration_ms": row["duration_ms"],
            "result": json.loads(row["result_json"] or "{}"),
            "created_at": row["created_at"],
        }


__all__ = ["ExecutionLogService"]
