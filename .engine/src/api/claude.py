"""Claude session state and mission management endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter

from db import get_db

router = APIRouter()


@router.get("/state")
async def get_claude_state():
    """Get current Regular Claude session state for avatar visualization.

    Queries the sessions table directly (single source of truth).

    States:
    - active: Claude is processing a user message
    - idle: Claude is waiting for user input
    - null/missing: No active session
    """
    try:
        with get_db() as conn:
            # Get most recently active session that hasn't ended
            cursor = conn.execute("""
                SELECT session_id, current_state, last_seen_at
                FROM sessions
                WHERE ended_at IS NULL
                ORDER BY last_seen_at DESC
                LIMIT 1
            """)
            row = cursor.fetchone()

        if not row:
            return {
                "state": None,
                "session_id": None,
                "since": None,
                "connected": False,
            }

        # Check if state is stale (no update in 60 seconds = likely crashed)
        last_seen = row["last_seen_at"]
        is_stale = False

        if last_seen:
            try:
                last_seen_dt = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                now = datetime.now(timezone.utc)
                age_seconds = (now - last_seen_dt).total_seconds()
                is_stale = age_seconds > 60
            except Exception:
                pass

        return {
            "state": row["current_state"],
            "session_id": row["session_id"],
            "since": row["last_seen_at"],
            "connected": True,
            "stale": is_stale,
        }

    except Exception as e:
        return {
            "state": None,
            "session_id": None,
            "since": None,
            "connected": False,
            "error": str(e)[:100],
        }


@router.get("/missions")
async def get_missions():
    """Get missions with their status and execution history.

    Uses the unified missions system (missions + mission_executions tables).
    
    Returns:
        List of mission definitions with schedule, status, last run info.
        Plus currently running and recent history from mission_executions.
    """
    result = {
        "scheduled": [],
        "running": [],
        "history": [],
    }

    try:
        with get_db() as conn:
            # Get all mission definitions from unified missions table
            cursor = conn.execute("""
                SELECT
                    id,
                    name,
                    slug,
                    description,
                    source,
                    prompt_file,
                    schedule_type,
                    schedule_time,
                    schedule_cron,
                    next_run,
                    last_run,
                    last_status,
                    enabled,
                    protected,
                    created_at,
                    updated_at
                FROM missions
                ORDER BY enabled DESC, 
                    CASE source 
                        WHEN 'core_protected' THEN 1 
                        WHEN 'core_default' THEN 2 
                        WHEN 'custom_app' THEN 3 
                        ELSE 4 
                    END,
                    next_run ASC
            """)

            for row in cursor.fetchall():
                mission = dict(row)
                # Format scheduled_time for display (legacy compat)
                if mission.get("schedule_time"):
                    mission["scheduled_time"] = mission["schedule_time"]
                elif mission.get("schedule_cron"):
                    mission["scheduled_time"] = f"cron: {mission['schedule_cron']}"
                else:
                    mission["scheduled_time"] = "triggered"
                
                # Add recurring flag for legacy compat
                mission["recurring"] = mission.get("schedule_type") is not None
                mission["prompt_path"] = mission.get("prompt_file")
                
                result["scheduled"].append(mission)

            # Get currently running mission executions
            cursor = conn.execute("""
                SELECT
                    e.id,
                    e.mission_slug as mission_type,
                    m.prompt_file,
                    e.started_at,
                    e.status
                FROM mission_executions e
                LEFT JOIN missions m ON e.mission_id = m.id
                WHERE e.status = 'running'
                ORDER BY e.started_at DESC
            """)

            for row in cursor.fetchall():
                result["running"].append(dict(row))

            # Get recent mission executions (last 10)
            cursor = conn.execute("""
                SELECT
                    e.id,
                    e.mission_slug as mission_type,
                    m.prompt_file,
                    e.started_at,
                    e.ended_at,
                    e.status,
                    e.transcript_path,
                    e.duration_seconds
                FROM mission_executions e
                LEFT JOIN missions m ON e.mission_id = m.id
                WHERE e.status IN ('completed', 'failed', 'timeout', 'cancelled')
                ORDER BY e.ended_at DESC
                LIMIT 10
            """)

            for row in cursor.fetchall():
                execution = dict(row)
                # Calculate duration_minutes for legacy compat
                if execution.get("duration_seconds"):
                    execution["duration_minutes"] = round(execution["duration_seconds"] / 60, 1)
                elif execution.get("started_at") and execution.get("ended_at"):
                    try:
                        start = datetime.fromisoformat(execution["started_at"].replace("Z", "+00:00"))
                        end = datetime.fromisoformat(execution["ended_at"].replace("Z", "+00:00"))
                        duration_minutes = (end - start).total_seconds() / 60
                        execution["duration_minutes"] = round(duration_minutes, 1)
                    except (ValueError, TypeError):
                        execution["duration_minutes"] = None
                result["history"].append(execution)

    except Exception as e:
        result["error"] = str(e)[:200]

    return result
