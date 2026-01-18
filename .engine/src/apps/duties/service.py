"""Duties service - business logic for Chief duty management.

Chief Duties are critical scheduled work that interrupts Chief's eternal conversation.
Unlike missions (which spawn specialists), duties run IN Chief's context.

Key difference from missions:
- NO next_run state - self-healing scheduling based on last_run
- Duties force Chief reset -> inject prompt -> continue after
- Core-only - no user-configurable duties
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from services.storage import SystemStorage

# User is in San Francisco - all duty times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")


@dataclass
class Duty:
    """Chief duty data object."""
    id: str
    slug: str
    name: str
    description: Optional[str]

    # Schedule
    schedule_time: str  # "06:00" (HH:MM, Pacific)

    # Prompt
    prompt_file: str  # '.claude/scheduled/memory-consolidation.md'

    # Execution config
    timeout_minutes: int

    # State
    enabled: bool
    last_run: Optional[str]
    last_status: Optional[str]

    # Metadata
    created_at: str
    updated_at: str


@dataclass
class DutyExecution:
    """Duty execution record."""
    id: str
    duty_id: str
    duty_slug: str
    started_at: str
    ended_at: Optional[str]
    status: str  # 'running', 'completed', 'failed', 'timeout'
    session_id: Optional[str]
    error_message: Optional[str]
    duration_seconds: Optional[int]


class DutiesService:
    """Service for Chief duty operations.

    Key design: NO next_run state. Scheduling is self-healing:

    def should_run_duty(duty, now_pacific):
        hour, minute = map(int, duty.schedule_time.split(':'))
        today_scheduled = now_pacific.replace(hour=hour, minute=minute)

        if now_pacific < today_scheduled:
            return False  # Not yet reached scheduled time

        if not duty.last_run:
            return True  # Never ran

        last_run = parse(duty.last_run).astimezone(PACIFIC)
        return last_run < today_scheduled  # Last run was before today's schedule

    This logic is robust - if last_run doesn't update, tomorrow still works.
    """

    def __init__(self, storage: SystemStorage):
        self.storage = storage

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _now_iso(self) -> str:
        return self._now().isoformat()

    def _row_to_duty(self, row) -> Duty:
        """Convert database row to Duty object."""
        return Duty(
            id=row["id"],
            slug=row["slug"],
            name=row["name"],
            description=row["description"],
            schedule_time=row["schedule_time"],
            prompt_file=row["prompt_file"],
            timeout_minutes=row["timeout_minutes"] or 45,
            enabled=bool(row["enabled"]),
            last_run=row["last_run"],
            last_status=row["last_status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _row_to_execution(self, row) -> DutyExecution:
        """Convert database row to DutyExecution object."""
        return DutyExecution(
            id=row["id"],
            duty_id=row["duty_id"],
            duty_slug=row["duty_slug"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            status=row["status"] or "running",
            session_id=row["session_id"],
            error_message=row["error_message"],
            duration_seconds=row["duration_seconds"],
        )

    # =========================================================================
    # DUTY READ OPERATIONS
    # =========================================================================

    def list_duties(self, enabled_only: bool = False) -> List[Duty]:
        """List all duties."""
        where = "WHERE enabled = 1" if enabled_only else ""

        rows = self.storage.fetchall(f"""
            SELECT * FROM chief_duties
            {where}
            ORDER BY schedule_time ASC
        """)

        return [self._row_to_duty(row) for row in rows]

    def get_duty(self, slug: str) -> Optional[Duty]:
        """Get a duty by slug."""
        row = self.storage.fetchone(
            "SELECT * FROM chief_duties WHERE slug = ?",
            (slug,)
        )
        return self._row_to_duty(row) if row else None

    def get_duty_by_id(self, duty_id: str) -> Optional[Duty]:
        """Get a duty by ID."""
        row = self.storage.fetchone(
            "SELECT * FROM chief_duties WHERE id = ?",
            (duty_id,)
        )
        return self._row_to_duty(row) if row else None

    # =========================================================================
    # SELF-HEALING SCHEDULING
    # =========================================================================

    def should_run_duty(self, duty: Duty, now: Optional[datetime] = None) -> bool:
        """Check if duty should run now using self-healing logic.

        No fragile next_run state! Just compare:
        - Is it past the scheduled time today?
        - Did we run after today's scheduled time?

        This is robust:
        - Never ran → runs immediately
        - Missed (system off) → runs on startup
        - Failed → runs again tomorrow (last_run updated)
        - last_run corrupt → runs (since < today's schedule)
        """
        if not duty.enabled:
            return False

        if now is None:
            now = datetime.now(PACIFIC)
        else:
            now = now.astimezone(PACIFIC)

        # Parse schedule time
        try:
            hour, minute = map(int, duty.schedule_time.split(':'))
        except (ValueError, AttributeError):
            hour, minute = 6, 0  # Default to 6 AM

        # Today's scheduled time in Pacific
        today_scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        # Not yet reached scheduled time today
        if now < today_scheduled:
            return False

        # Never ran → run now
        if not duty.last_run:
            return True

        # Parse last_run
        try:
            last_run_str = duty.last_run
            if last_run_str.endswith('Z'):
                last_run_str = last_run_str[:-1] + '+00:00'
            last_run = datetime.fromisoformat(last_run_str).astimezone(PACIFIC)
        except (ValueError, TypeError):
            return True  # Can't parse → assume needs to run

        # Last run was before today's scheduled time → run now
        return last_run < today_scheduled

    def get_due_duties(self, now: Optional[datetime] = None) -> List[Duty]:
        """Get all duties that should run now."""
        all_duties = self.list_duties(enabled_only=True)
        return [d for d in all_duties if self.should_run_duty(d, now)]

    # =========================================================================
    # DUTY STATE UPDATES
    # =========================================================================

    def update_last_run(self, duty_id: str, status: str) -> None:
        """Update last_run and last_status after execution."""
        now = self._now_iso()
        self.storage.execute("""
            UPDATE chief_duties
            SET last_run = ?, last_status = ?, updated_at = ?
            WHERE id = ?
        """, (now, status, now, duty_id))

    def enable_duty(self, slug: str) -> Optional[Duty]:
        """Enable a duty."""
        now = self._now_iso()
        self.storage.execute("""
            UPDATE chief_duties
            SET enabled = 1, updated_at = ?
            WHERE slug = ?
        """, (now, slug))
        return self.get_duty(slug)

    def disable_duty(self, slug: str) -> Optional[Duty]:
        """Disable a duty.

        Note: Core duties should NOT be disabled normally.
        This is here for emergency maintenance only.
        """
        now = self._now_iso()
        self.storage.execute("""
            UPDATE chief_duties
            SET enabled = 0, updated_at = ?
            WHERE slug = ?
        """, (now, slug))
        return self.get_duty(slug)

    # =========================================================================
    # EXECUTIONS
    # =========================================================================

    def create_execution(self, duty_id: str, duty_slug: str) -> str:
        """Create a new execution record."""
        execution_id = str(uuid.uuid4())
        now = self._now_iso()

        self.storage.execute("""
            INSERT INTO chief_duty_executions (
                id, duty_id, duty_slug, started_at, status
            ) VALUES (?, ?, ?, ?, 'running')
        """, (execution_id, duty_id, duty_slug, now))

        return execution_id

    def update_execution(
        self,
        execution_id: str,
        session_id: Optional[str] = None,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Update an execution record."""
        updates = []
        params = []

        if session_id is not None:
            updates.append("session_id = ?")
            params.append(session_id)

        if status is not None:
            updates.append("status = ?")
            params.append(status)

        if error_message is not None:
            updates.append("error_message = ?")
            params.append(error_message)

        if not updates:
            return

        params.append(execution_id)
        self.storage.execute(f"""
            UPDATE chief_duty_executions
            SET {', '.join(updates)}
            WHERE id = ?
        """, tuple(params))

    def complete_execution(
        self,
        execution_id: str,
        status: str = "completed",
        error_message: Optional[str] = None,
    ) -> None:
        """Mark an execution as complete."""
        now = self._now_iso()

        # Get started_at to compute duration
        row = self.storage.fetchone(
            "SELECT started_at FROM chief_duty_executions WHERE id = ?",
            (execution_id,)
        )

        duration_seconds = None
        if row and row["started_at"]:
            try:
                started = datetime.fromisoformat(row["started_at"].replace("Z", "+00:00"))
                duration_seconds = int((self._now() - started).total_seconds())
            except (ValueError, TypeError):
                pass

        self.storage.execute("""
            UPDATE chief_duty_executions
            SET ended_at = ?, status = ?, error_message = ?, duration_seconds = ?
            WHERE id = ?
        """, (now, status, error_message, duration_seconds, execution_id))

    def get_execution(self, execution_id: str) -> Optional[DutyExecution]:
        """Get a specific execution."""
        row = self.storage.fetchone(
            "SELECT * FROM chief_duty_executions WHERE id = ?",
            (execution_id,)
        )
        return self._row_to_execution(row) if row else None

    def list_executions(
        self,
        duty_slug: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> List[DutyExecution]:
        """List execution history."""
        clauses = []
        params = []

        if duty_slug:
            clauses.append("duty_slug = ?")
            params.append(duty_slug)

        if status:
            clauses.append("status = ?")
            params.append(status)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)

        rows = self.storage.fetchall(f"""
            SELECT * FROM chief_duty_executions
            {where}
            ORDER BY started_at DESC
            LIMIT ?
        """, tuple(params))

        return [self._row_to_execution(row) for row in rows]

    def get_running_executions(self) -> List[DutyExecution]:
        """Get currently running executions."""
        rows = self.storage.fetchall("""
            SELECT * FROM chief_duty_executions
            WHERE status = 'running'
            ORDER BY started_at ASC
        """)

        return [self._row_to_execution(row) for row in rows]


__all__ = ['DutiesService', 'Duty', 'DutyExecution']
