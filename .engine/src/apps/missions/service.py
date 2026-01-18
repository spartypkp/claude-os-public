"""Missions service - business logic for mission management."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from services.storage import SystemStorage

# User is in San Francisco - all mission times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")

# Days of week mapping
DAYS_MAP = {
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, 
    "fri": 4, "sat": 5, "sun": 6
}


@dataclass
class Mission:
    """Mission data object.

    Note (Jan 2026): After the Duties overhaul, missions only spawn specialists.
    Chief work is handled by the separate duties system.
    The 'protected' field has been removed - duties handle critical work.
    """
    id: str
    name: str
    slug: str
    description: Optional[str]
    source: str  # 'core_default', 'custom_app', 'user' (no more 'core_protected')
    app_slug: Optional[str]

    # Prompt
    prompt_type: str  # 'file', 'inline'
    prompt_file: Optional[str]
    prompt_inline: Optional[str]

    # Schedule
    schedule_type: Optional[str]  # 'cron', 'time', 'relative', None
    schedule_cron: Optional[str]
    schedule_time: Optional[str]  # "06:00" (HH:MM)
    schedule_days: Optional[List[str]]  # ["mon", "tue", ...]

    # Trigger
    trigger_type: Optional[str]  # 'file_change', 'calendar_event', 'app_hook', None
    trigger_config: Optional[Dict]

    # Execution
    timeout_minutes: int
    role: str  # Cannot be 'chief' - Chief work handled by duties
    mode: str

    # State (no 'protected' - duties handle critical work)
    enabled: bool
    next_run: Optional[str]
    last_run: Optional[str]
    last_status: Optional[str]

    # Metadata
    created_at: str
    updated_at: str
    
    @property
    def is_scheduled(self) -> bool:
        return self.schedule_type is not None
    
    @property
    def is_triggered(self) -> bool:
        return self.trigger_type is not None
    
    @property
    def is_recurring(self) -> bool:
        """True if mission repeats (has schedule or trigger)."""
        return self.is_scheduled or self.is_triggered


@dataclass
class MissionExecution:
    """Mission execution record."""
    id: str
    mission_id: str
    mission_slug: str
    started_at: str
    ended_at: Optional[str]
    status: str  # 'running', 'completed', 'failed', 'timeout', 'cancelled'
    session_id: Optional[str]
    transcript_path: Optional[str]
    output_summary: Optional[str]
    error_message: Optional[str]
    duration_seconds: Optional[int]


class MissionsService:
    """Service for mission CRUD and scheduling operations."""
    
    def __init__(self, storage: SystemStorage):
        self.storage = storage
    
    def _now(self) -> datetime:
        return datetime.now(timezone.utc)
    
    def _now_iso(self) -> str:
        return self._now().isoformat()
    
    def _row_to_mission(self, row) -> Mission:
        """Convert database row (sqlite3.Row) to Mission object."""
        # sqlite3.Row supports [] access but not .get(), so we use direct access
        schedule_days = None
        if row["schedule_days"]:
            try:
                schedule_days = json.loads(row["schedule_days"])
            except (json.JSONDecodeError, TypeError):
                schedule_days = None
        
        trigger_config = None
        if row["trigger_config_json"]:
            try:
                trigger_config = json.loads(row["trigger_config_json"])
            except (json.JSONDecodeError, TypeError):
                trigger_config = None
        
        return Mission(
            id=row["id"],
            name=row["name"],
            slug=row["slug"],
            description=row["description"],
            source=row["source"],
            app_slug=row["app_slug"],
            prompt_type=row["prompt_type"] or "file",
            prompt_file=row["prompt_file"],
            prompt_inline=row["prompt_inline"],
            schedule_type=row["schedule_type"],
            schedule_cron=row["schedule_cron"],
            schedule_time=row["schedule_time"],
            schedule_days=schedule_days,
            trigger_type=row["trigger_type"],
            trigger_config=trigger_config,
            timeout_minutes=row["timeout_minutes"] or 60,
            role=row["role"] or "builder",  # Default to builder, not chief
            mode=row["mode"] or "mission",
            enabled=bool(row["enabled"]),
            # Note: 'protected' field removed - duties handle critical work
            next_run=row["next_run"],
            last_run=row["last_run"],
            last_status=row["last_status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    
    def _row_to_execution(self, row) -> MissionExecution:
        """Convert database row (sqlite3.Row) to MissionExecution object."""
        return MissionExecution(
            id=row["id"],
            mission_id=row["mission_id"],
            mission_slug=row["mission_slug"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            status=row["status"] or "running",
            session_id=row["session_id"],
            transcript_path=row["transcript_path"],
            output_summary=row["output_summary"],
            error_message=row["error_message"],
            duration_seconds=row["duration_seconds"],
        )
    
    # =========================================================================
    # MISSION CRUD
    # =========================================================================
    
    def list_missions(
        self, 
        source: Optional[str] = None,
        enabled_only: bool = False,
        app_slug: Optional[str] = None,
    ) -> List[Mission]:
        """List all missions with optional filters."""
        clauses = []
        params = []
        
        if source:
            clauses.append("source = ?")
            params.append(source)
        
        if enabled_only:
            clauses.append("enabled = 1")
        
        if app_slug:
            clauses.append("app_slug = ?")
            params.append(app_slug)
        
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        
        rows = self.storage.fetchall(f"""
            SELECT * FROM missions
            {where}
            ORDER BY
                CASE source
                    WHEN 'core_default' THEN 1
                    WHEN 'custom_app' THEN 2
                    ELSE 3
                END,
                name ASC
        """, tuple(params))
        
        return [self._row_to_mission(row) for row in rows]
    
    def get_mission(self, slug: str) -> Optional[Mission]:
        """Get a mission by slug."""
        row = self.storage.fetchone(
            "SELECT * FROM missions WHERE slug = ?",
            (slug,)
        )
        return self._row_to_mission(row) if row else None
    
    def get_mission_by_id(self, mission_id: str) -> Optional[Mission]:
        """Get a mission by ID."""
        row = self.storage.fetchone(
            "SELECT * FROM missions WHERE id = ?",
            (mission_id,)
        )
        return self._row_to_mission(row) if row else None
    
    def create_mission(
        self,
        name: str,
        slug: str,
        source: str = "user",
        description: Optional[str] = None,
        app_slug: Optional[str] = None,
        prompt_type: str = "file",
        prompt_file: Optional[str] = None,
        prompt_inline: Optional[str] = None,
        schedule_type: Optional[str] = None,
        schedule_cron: Optional[str] = None,
        schedule_time: Optional[str] = None,
        schedule_days: Optional[List[str]] = None,
        trigger_type: Optional[str] = None,
        trigger_config: Optional[Dict] = None,
        timeout_minutes: int = 60,
        role: str = "builder",  # Cannot be "chief" - Chief work handled by duties
        mode: str = "mission",
        enabled: bool = True,
    ) -> Mission:
        """Create a new mission.

        Note: role cannot be 'chief' - Chief work is handled by the duties system.
        """
        mission_id = str(uuid.uuid4())
        now = self._now_iso()

        # Validate role - Chief work handled by duties
        if role == "chief":
            raise ValueError("Cannot create mission with role='chief'. Use duties for Chief work.")

        # Compute initial next_run for scheduled missions
        next_run = None
        if schedule_type and enabled:
            next_run = self._compute_next_run(
                schedule_type=schedule_type,
                schedule_cron=schedule_cron,
                schedule_time=schedule_time,
                schedule_days=schedule_days,
            )

        self.storage.execute("""
            INSERT INTO missions (
                id, name, slug, description, source, app_slug,
                prompt_type, prompt_file, prompt_inline,
                schedule_type, schedule_cron, schedule_time, schedule_days,
                trigger_type, trigger_config_json,
                timeout_minutes, role, mode,
                enabled, next_run,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mission_id, name, slug, description, source, app_slug,
            prompt_type, prompt_file, prompt_inline,
            schedule_type, schedule_cron, schedule_time,
            json.dumps(schedule_days) if schedule_days else None,
            trigger_type,
            json.dumps(trigger_config) if trigger_config else None,
            timeout_minutes, role, mode,
            1 if enabled else 0, next_run,
            now, now
        ))

        return self.get_mission(slug)
    
    def update_mission(
        self,
        slug: str,
        **updates
    ) -> Optional[Mission]:
        """Update a mission's configuration."""
        mission = self.get_mission(slug)
        if not mission:
            return None
        
        # Build SET clause dynamically
        set_parts = []
        params = []
        
        field_mapping = {
            "name": "name",
            "description": "description",
            "prompt_type": "prompt_type",
            "prompt_file": "prompt_file",
            "prompt_inline": "prompt_inline",
            "schedule_type": "schedule_type",
            "schedule_cron": "schedule_cron",
            "schedule_time": "schedule_time",
            "timeout_minutes": "timeout_minutes",
            "role": "role",
            "mode": "mode",
        }
        
        for key, db_field in field_mapping.items():
            if key in updates:
                set_parts.append(f"{db_field} = ?")
                params.append(updates[key])
        
        # Handle JSON fields
        if "schedule_days" in updates:
            set_parts.append("schedule_days = ?")
            params.append(json.dumps(updates["schedule_days"]) if updates["schedule_days"] else None)
        
        if "trigger_config" in updates:
            set_parts.append("trigger_config_json = ?")
            params.append(json.dumps(updates["trigger_config"]) if updates["trigger_config"] else None)
        
        # Always update updated_at
        set_parts.append("updated_at = ?")
        params.append(self._now_iso())
        
        params.append(slug)
        
        if set_parts:
            self.storage.execute(f"""
                UPDATE missions 
                SET {', '.join(set_parts)}
                WHERE slug = ?
            """, tuple(params))
        
        # Recompute next_run if schedule changed
        if any(k in updates for k in ["schedule_type", "schedule_cron", "schedule_time", "schedule_days"]):
            updated = self.get_mission(slug)
            if updated and updated.is_scheduled and updated.enabled:
                next_run = self._compute_next_run(
                    schedule_type=updated.schedule_type,
                    schedule_cron=updated.schedule_cron,
                    schedule_time=updated.schedule_time,
                    schedule_days=updated.schedule_days,
                )
                self.storage.execute(
                    "UPDATE missions SET next_run = ? WHERE slug = ?",
                    (next_run, slug)
                )
        
        return self.get_mission(slug)
    
    def delete_mission(self, slug: str) -> bool:
        """Delete a user-created mission."""
        mission = self.get_mission(slug)
        if not mission:
            return False
        
        # Can only delete user missions
        if mission.source != "user":
            raise ValueError(f"Cannot delete {mission.source} mission '{slug}'")
        
        self.storage.execute(
            "DELETE FROM missions WHERE slug = ?",
            (slug,)
        )
        return True
    
    def enable_mission(self, slug: str) -> Optional[Mission]:
        """Enable a mission."""
        mission = self.get_mission(slug)
        if not mission:
            return None
        
        now = self._now_iso()
        
        # Compute next_run for scheduled missions
        next_run = None
        if mission.is_scheduled:
            next_run = self._compute_next_run(
                schedule_type=mission.schedule_type,
                schedule_cron=mission.schedule_cron,
                schedule_time=mission.schedule_time,
                schedule_days=mission.schedule_days,
            )
        
        self.storage.execute("""
            UPDATE missions 
            SET enabled = 1, next_run = ?, updated_at = ?
            WHERE slug = ?
        """, (next_run, now, slug))
        
        return self.get_mission(slug)
    
    def disable_mission(self, slug: str) -> Optional[Mission]:
        """Disable a mission."""
        mission = self.get_mission(slug)
        if not mission:
            return None

        self.storage.execute("""
            UPDATE missions
            SET enabled = 0, next_run = NULL, updated_at = ?
            WHERE slug = ?
        """, (self._now_iso(), slug))

        return self.get_mission(slug)
    
    # =========================================================================
    # SCHEDULING
    # =========================================================================
    
    def get_due_missions(self, now: Optional[datetime] = None) -> List[Mission]:
        """Get missions that are due to run."""
        if now is None:
            now = self._now()
        
        now_iso = now.isoformat()
        
        rows = self.storage.fetchall("""
            SELECT * FROM missions
            WHERE enabled = 1
              AND next_run IS NOT NULL
              AND next_run <= ?
            ORDER BY next_run ASC
        """, (now_iso,))
        
        return [self._row_to_mission(row) for row in rows]
    
    def get_triggered_missions(self) -> List[Mission]:
        """Get missions that have triggers (for trigger engine to check)."""
        rows = self.storage.fetchall("""
            SELECT * FROM missions
            WHERE enabled = 1
              AND trigger_type IS NOT NULL
        """)
        
        return [self._row_to_mission(row) for row in rows]
    
    def clear_next_run(self, mission_id: str) -> None:
        """Clear next_run to prevent double execution."""
        self.storage.execute(
            "UPDATE missions SET next_run = NULL WHERE id = ?",
            (mission_id,)
        )
    
    def set_next_run(self, mission_id: str, next_run: str) -> None:
        """Set the next run time for a mission."""
        self.storage.execute(
            "UPDATE missions SET next_run = ? WHERE id = ?",
            (next_run, mission_id)
        )
    
    def update_last_run(self, mission_id: str, status: str) -> None:
        """Update last_run and last_status after execution."""
        now = self._now_iso()
        self.storage.execute("""
            UPDATE missions 
            SET last_run = ?, last_status = ?, updated_at = ?
            WHERE id = ?
        """, (now, status, now, mission_id))
    
    def _compute_next_run(
        self,
        schedule_type: str,
        schedule_cron: Optional[str] = None,
        schedule_time: Optional[str] = None,
        schedule_days: Optional[List[str]] = None,
        from_time: Optional[datetime] = None,
    ) -> Optional[str]:
        """Compute the next run time for a scheduled mission."""
        if from_time is None:
            from_time = datetime.now(PACIFIC)
        
        if schedule_type == "time" and schedule_time:
            return self._compute_next_time_run(
                schedule_time, schedule_days, from_time
            )
        elif schedule_type == "cron" and schedule_cron:
            return self._compute_next_cron_run(schedule_cron, from_time)
        
        return None
    
    def _compute_next_time_run(
        self,
        schedule_time: str,
        schedule_days: Optional[List[str]],
        from_time: datetime,
    ) -> str:
        """Compute next run for time-based schedule (e.g., "06:00" daily)."""
        try:
            hour, minute = map(int, schedule_time.split(":"))
        except (ValueError, AttributeError):
            hour, minute = 6, 0  # Default to 6 AM
        
        # Start from today in Pacific time
        today_pacific = from_time.astimezone(PACIFIC)
        candidate = today_pacific.replace(
            hour=hour, minute=minute, second=0, microsecond=0
        )
        
        # If we've already passed this time today, start from tomorrow
        if candidate <= today_pacific:
            candidate += timedelta(days=1)
        
        # If schedule_days specified, find next matching day
        if schedule_days:
            allowed_days = {DAYS_MAP.get(d.lower(), -1) for d in schedule_days}
            while candidate.weekday() not in allowed_days:
                candidate += timedelta(days=1)
        
        # Convert to UTC for storage
        return candidate.astimezone(timezone.utc).isoformat()
    
    def _compute_next_cron_run(
        self,
        schedule_cron: str,
        from_time: datetime,
    ) -> str:
        """Compute next run for cron-style schedule."""
        # Simple cron parser for common patterns
        # Format: "minute hour day month weekday"
        # Examples: "0 6 * * *" (6 AM daily), "0 10 * * 0" (10 AM Sundays)
        
        try:
            parts = schedule_cron.split()
            if len(parts) < 5:
                raise ValueError("Invalid cron format")
            
            minute = int(parts[0]) if parts[0] != "*" else 0
            hour = int(parts[1]) if parts[1] != "*" else 0
            weekday = int(parts[4]) if parts[4] != "*" else None
            
            # Start from today in Pacific time
            today_pacific = from_time.astimezone(PACIFIC)
            candidate = today_pacific.replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
            
            # If we've already passed this time today, start from tomorrow
            if candidate <= today_pacific:
                candidate += timedelta(days=1)
            
            # If weekday specified, find next matching day
            if weekday is not None:
                while candidate.weekday() != weekday:
                    candidate += timedelta(days=1)
            
            return candidate.astimezone(timezone.utc).isoformat()
            
        except Exception:
            # Fallback: 6 AM tomorrow
            tomorrow = from_time.astimezone(PACIFIC) + timedelta(days=1)
            tomorrow = tomorrow.replace(hour=6, minute=0, second=0, microsecond=0)
            return tomorrow.astimezone(timezone.utc).isoformat()
    
    # =========================================================================
    # EXECUTIONS
    # =========================================================================
    
    def create_execution(
        self,
        mission_id: str,
        mission_slug: str,
    ) -> str:
        """Create a new execution record."""
        execution_id = str(uuid.uuid4())
        now = self._now_iso()
        
        self.storage.execute("""
            INSERT INTO mission_executions (
                id, mission_id, mission_slug, started_at, status
            ) VALUES (?, ?, ?, ?, 'running')
        """, (execution_id, mission_id, mission_slug, now))
        
        return execution_id
    
    def update_execution(
        self,
        execution_id: str,
        session_id: Optional[str] = None,
        status: Optional[str] = None,
        transcript_path: Optional[str] = None,
        output_summary: Optional[str] = None,
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
        
        if transcript_path is not None:
            updates.append("transcript_path = ?")
            params.append(transcript_path)
        
        if output_summary is not None:
            updates.append("output_summary = ?")
            params.append(output_summary)
        
        if error_message is not None:
            updates.append("error_message = ?")
            params.append(error_message)
        
        if not updates:
            return
        
        params.append(execution_id)
        self.storage.execute(f"""
            UPDATE mission_executions
            SET {', '.join(updates)}
            WHERE id = ?
        """, tuple(params))
    
    def complete_execution(
        self,
        execution_id: str,
        status: str = "completed",
        output_summary: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Mark an execution as complete."""
        now = self._now_iso()
        
        # Get started_at to compute duration
        row = self.storage.fetchone(
            "SELECT started_at FROM mission_executions WHERE id = ?",
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
            UPDATE mission_executions
            SET ended_at = ?, status = ?, output_summary = ?, 
                error_message = ?, duration_seconds = ?
            WHERE id = ?
        """, (now, status, output_summary, error_message, duration_seconds, execution_id))
    
    def get_execution(self, execution_id: str) -> Optional[MissionExecution]:
        """Get a specific execution."""
        row = self.storage.fetchone(
            "SELECT * FROM mission_executions WHERE id = ?",
            (execution_id,)
        )
        return self._row_to_execution(row) if row else None
    
    def list_executions(
        self,
        mission_slug: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> List[MissionExecution]:
        """List execution history."""
        clauses = []
        params = []
        
        if mission_slug:
            clauses.append("mission_slug = ?")
            params.append(mission_slug)
        
        if status:
            clauses.append("status = ?")
            params.append(status)
        
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        
        rows = self.storage.fetchall(f"""
            SELECT * FROM mission_executions
            {where}
            ORDER BY started_at DESC
            LIMIT ?
        """, tuple(params))
        
        return [self._row_to_execution(row) for row in rows]
    
    def get_running_executions(self) -> List[MissionExecution]:
        """Get currently running executions."""
        rows = self.storage.fetchall("""
            SELECT * FROM mission_executions
            WHERE status = 'running'
            ORDER BY started_at ASC
        """)
        
        return [self._row_to_execution(row) for row in rows]
    
    # =========================================================================
    # SEEDING
    # =========================================================================

    def seed_core_missions(self) -> None:
        """Seed core missions.

        Jan 2026: After the Duties overhaul, Chief work is handled by duties.
        Missions only spawn specialists. Core missions are seeded by migration.

        This function is kept for backwards compatibility but does nothing.
        Migration 033_remove_protected_column.sql seeds the autonomous-dev-work mission.
        """
        pass  # Seeding handled by migration
    
    def upsert_app_mission(
        self,
        slug: str,
        app_slug: str,
        name: str,
        description: Optional[str] = None,
        prompt_file: Optional[str] = None,
        prompt_inline: Optional[str] = None,
        schedule_type: Optional[str] = None,
        schedule_cron: Optional[str] = None,
        schedule_time: Optional[str] = None,
        schedule_days: Optional[List[str]] = None,
        trigger_type: Optional[str] = None,
        trigger_config: Optional[Dict] = None,
        timeout_minutes: int = 60,
        role: str = "builder",  # Cannot be "chief" - Chief work handled by duties
        mode: str = "mission",
    ) -> Mission:
        """Upsert a mission from a Custom App's manifest.yaml.

        Note: role cannot be 'chief' - Chief work is handled by the duties system.
        """
        existing = self.get_mission(slug)
        
        if existing:
            # Update if app_slug matches (don't overwrite others' missions)
            if existing.app_slug != app_slug:
                raise ValueError(
                    f"Mission slug '{slug}' already used by app '{existing.app_slug}'"
                )
            
            return self.update_mission(
                slug,
                name=name,
                description=description,
                prompt_file=prompt_file,
                prompt_inline=prompt_inline,
                schedule_type=schedule_type,
                schedule_cron=schedule_cron,
                schedule_time=schedule_time,
                schedule_days=schedule_days,
                trigger_type=trigger_type,
                trigger_config=trigger_config,
                timeout_minutes=timeout_minutes,
                role=role,
                mode=mode,
            )
        else:
            return self.create_mission(
                name=name,
                slug=slug,
                source="custom_app",
                app_slug=app_slug,
                description=description,
                prompt_type="inline" if prompt_inline else "file",
                prompt_file=prompt_file,
                prompt_inline=prompt_inline,
                schedule_type=schedule_type,
                schedule_cron=schedule_cron,
                schedule_time=schedule_time,
                schedule_days=schedule_days,
                trigger_type=trigger_type,
                trigger_config=trigger_config,
                timeout_minutes=timeout_minutes,
                role=role,
                mode=mode,
            )


__all__ = ['MissionsService', 'Mission', 'MissionExecution']

