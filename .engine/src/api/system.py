"""System management endpoints for operational visibility."""
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from db import get_db

router = APIRouter()


# Base paths
# system.py is at .engine/src/api/system.py → api → src → .engine → repo_root
REPO_ROOT = Path(settings.repo_root) if hasattr(settings, 'repo_root') else Path(__file__).resolve().parents[3]
CONFIG_PATH = REPO_ROOT / ".engine" / "config" / "config.yaml"
SCHEMA_PATH = REPO_ROOT / ".engine" / "config" / "schema.sql"
MIGRATIONS_PATH = REPO_ROOT / ".engine" / "config" / "migrations"
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"
TASKS_FOR_WILL_PATH = REPO_ROOT / "Desktop" / "tasks-for-will"


@router.get("/config")
async def system_config():
    """Current system configuration and schema."""
    result = {
        "watcher": {"modules": {}},
        "executor": {
            "poll_interval_sec": 60,
            "batch_size": 1,
            "check_interval_sec": 60,
        },
        "sms": {
            "enabled": False,
            "quiet_hours": None,
        },
        "schema": {
            "tables": [],
            "migrations": [],
        },
    }

    # Load config
    try:
        with open(CONFIG_PATH, 'r') as f:
            config = yaml.safe_load(f)

        # Watcher modules
        enabled_modules = config.get("watcher", {}).get("modules", [])
        all_modules = ["domains", "contacts", "today_context"]
        result["watcher"]["modules"] = {mod: mod in enabled_modules for mod in all_modules}

        # Executor settings
        executor_config = config.get("scheduled_work", {}).get("executor", {})
        result["executor"]["poll_interval_sec"] = executor_config.get("poll_interval_sec", 60)
        result["executor"]["batch_size"] = executor_config.get("batch_size", 1)
        result["executor"]["check_interval_sec"] = config.get("scheduled_work", {}).get("check_interval_sec", 60)

        # SMS settings
        sms_config = config.get("sms", {})
        result["sms"]["enabled"] = sms_config.get("enabled", False)
        quiet_hours = sms_config.get("notifications", {}).get("quiet_hours")
        if quiet_hours:
            result["sms"]["quiet_hours"] = {
                "start": quiet_hours.get("start", "22:00"),
                "end": quiet_hours.get("end", "08:00"),
            }
    except Exception:
        pass  # Use defaults

    # Parse schema
    if SCHEMA_PATH.exists():
        try:
            with open(SCHEMA_PATH, 'r') as f:
                schema_sql = f.read()

            # Extract CREATE TABLE statements
            table_pattern = r'CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*?)\);'
            for match in re.finditer(table_pattern, schema_sql, re.DOTALL | re.IGNORECASE):
                table_name = match.group(1)
                columns_str = match.group(2)

                columns = []
                for line in columns_str.split(','):
                    line = line.strip()
                    if not line or line.upper().startswith('FOREIGN') or line.upper().startswith('UNIQUE') or line.upper().startswith('CHECK'):
                        continue

                    parts = line.split()
                    if len(parts) >= 2:
                        col_name = parts[0]
                        col_type = parts[1]
                        is_pk = 'PRIMARY KEY' in line.upper()
                        columns.append({
                            "name": col_name,
                            "type": col_type,
                            "pk": is_pk,
                        })

                if columns:
                    result["schema"]["tables"].append({
                        "name": table_name,
                        "columns": columns,
                    })
        except Exception:
            pass

    # List migrations
    if MIGRATIONS_PATH.exists():
        for migration_file in sorted(MIGRATIONS_PATH.glob("*.sql")):
            result["schema"]["migrations"].append({
                "name": migration_file.name,
                "applied": True,  # Assume applied if file exists
            })

    return result


@router.get("/claude-state")
async def get_claude_state():
    """Get current Regular Claude session state for avatar visualization.

    Queries the sessions table directly (single source of truth).

    States:
    - active: Claude is processing a user message
    - idle: Claude is waiting for user input
    - null/missing: No active session
    """
    from datetime import timezone

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
                mission["prompt_path"] = mission.get("prompt_file")  # Legacy field name
                
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


def _parse_task_for_will_file(file_path: Path) -> Optional[dict]:
    """Parse a task-for-will markdown file and extract metadata.

    Expected format:
    ---
    type: biographer | spec-decision | clarification | preference | review
    status: pending | answered | processed
    created_at: ISO timestamp
    ---

    # Title

    Question or content...

    > user's response (if answered)
    """
    try:
        content = file_path.read_text()
    except Exception:
        return None

    result = {
        "filename": file_path.name,
        "title": file_path.stem,  # Default to filename without extension
        "type": "unknown",
        "status": "pending",
        "answered": False,
        "created_at": None,
        "file_path": str(file_path.relative_to(REPO_ROOT)),
    }

    # Parse frontmatter
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            frontmatter = parts[1].strip()
            body = parts[2].strip()

            # Parse YAML frontmatter fields
            for line in frontmatter.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    key = key.strip().lower().replace("-", "_")
                    value = value.strip()
                    if key == "type":
                        result["type"] = value
                    elif key == "status":
                        result["status"] = value
                    elif key == "created_at":
                        result["created_at"] = value

            # Extract title from first H1 in body
            for line in body.split("\n"):
                if line.startswith("# "):
                    result["title"] = line[2:].strip()
                    break
        else:
            body = content
    else:
        body = content

    # Check for user's response (lines starting with "> ")
    result["answered"] = any(
        line.strip().startswith("> ") and not line.strip().startswith("> -")
        for line in body.split("\n")
    )

    # Override status if we detect an answer
    if result["answered"] and result["status"] == "pending":
        result["status"] = "answered"

    # Get file creation time if not in frontmatter
    if not result["created_at"]:
        try:
            stat = file_path.stat()
            result["created_at"] = datetime.fromtimestamp(stat.st_ctime).isoformat()
        except Exception:
            pass

    return result


@router.get("/tasks-for-will")
async def get_tasks_for_will():
    """Get items in Workspace/tasks-for-will/ directory.

    Returns:
        List of task documents with their status and whether they've been answered.
        Answered items contain "> " responses from user.
    """
    result = {
        "items": [],
        "pending_count": 0,
        "answered_count": 0,
        "total": 0,
    }

    if not TASKS_FOR_WILL_PATH.exists():
        return result

    try:
        for item in sorted(TASKS_FOR_WILL_PATH.iterdir()):
            # Skip hidden files and non-markdown
            if item.name.startswith(".") or item.name.startswith("_"):
                continue
            if not item.suffix == ".md":
                continue

            parsed = _parse_task_for_will_file(item)
            if parsed:
                result["items"].append(parsed)
                result["total"] += 1
                if parsed["answered"]:
                    result["answered_count"] += 1
                else:
                    result["pending_count"] += 1

    except Exception as e:
        result["error"] = str(e)[:200]

    return result


def _parse_section(content: str, section_name: str) -> str:
    """Extract a section from markdown content by header name.

    Looks for ## Section Name or ### Section Name and extracts content until the next heading.
    """
    # Pattern: ## Section Name or ### Section Name (case insensitive)
    pattern = rf'^(#{{2,3}})\s+{re.escape(section_name)}\s*$'
    match = re.search(pattern, content, re.IGNORECASE | re.MULTILINE)
    if not match:
        return ""

    start_level = len(match.group(1))  # Number of # symbols
    start_pos = match.end()

    # Find the next heading of same or higher level
    next_heading_pattern = rf'^#{{{{1,{start_level}}}}}\s+'
    next_match = re.search(next_heading_pattern, content[start_pos:], re.MULTILINE)

    if next_match:
        section_content = content[start_pos:start_pos + next_match.start()]
    else:
        section_content = content[start_pos:]

    return section_content.strip()


@router.get("/memory")
async def get_memory():
    """Get memory data from 2-tier memory system.

    2-tier memory model:
    1. today.md (daily) - Memory, Friction, Open Loops sections
    2. memory.md (persistent) - Current State (weekly) + Stable Patterns (permanent)

    Returns:
        today: Memory, Friction, and Open Loops sections from Desktop/today.md
        weekly: Current State section from Desktop/memory.md
        longterm: Stable Patterns section from Desktop/memory.md
    """
    result = {
        "today": {
            "memory_section": "",
            "friction_section": "",
            "open_loops": "",
        },
        "weekly": {
            "content": "",
            "waiting_on": "",
            "current_state": "",
            "active_threads": "",
        },
        "longterm": {
            "content": "",
        },
    }

    # Parse TODAY.md (Tier 2: Daily)
    today_file = REPO_ROOT / "Desktop" / "TODAY.md"
    if today_file.exists():
        try:
            content = today_file.read_text(encoding="utf-8")

            # Extract sections
            result["today"]["memory_section"] = _parse_section(content, "Memory")
            result["today"]["friction_section"] = _parse_section(content, "Friction")
            result["today"]["open_loops"] = _parse_section(content, "Open Loops")
        except Exception:
            pass

    # Parse MEMORY.md (Tier 3: Weekly/Medium-term)
    weekly_file = REPO_ROOT / "Desktop" / "MEMORY.md"
    if weekly_file.exists():
        try:
            content = weekly_file.read_text(encoding="utf-8")
            result["weekly"]["content"] = content

            # Also extract specific sections for structured display
            result["weekly"]["waiting_on"] = _parse_section(content, "Waiting On")
            result["weekly"]["current_state"] = _parse_section(content, "Current State")
            result["weekly"]["active_threads"] = _parse_section(content, "Active Threads")
        except Exception:
            pass

    # Parse Stable Patterns from memory.md (was long-term-memory.md)
    # Now memory.md contains both Current State and Stable Patterns sections
    if weekly_file.exists():
        try:
            content = weekly_file.read_text(encoding="utf-8")
            result["longterm"]["content"] = _parse_section(content, "Stable Patterns")
        except Exception:
            pass

    return result


