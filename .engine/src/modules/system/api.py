"""
System API - Health, configuration, events, and system management.
"""
import asyncio
import json
import platform
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from core.config import settings
from core.database import get_db
from core.events import event_bus
from core.perf import get_perf_snapshot, get_worker_snapshot

router = APIRouter(tags=["system"])

# Base paths
REPO_ROOT = Path(settings.repo_root)
CONFIG_PATH = REPO_ROOT / ".engine" / "config" / "config.yaml"
SCHEMA_PATH = REPO_ROOT / ".engine" / "config" / "schema.sql"
MIGRATIONS_PATH = REPO_ROOT / ".engine" / "config" / "migrations"
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"


# =============================================================================
# Helpers
# =============================================================================

async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB or filesystem operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# =============================================================================
# SSE EVENTS
# =============================================================================

@router.get("/events")
async def stream_events():
    """
    Unified SSE stream for all Dashboard real-time updates.

    Events:
        - session.started: {"session_id", "role", "conversation_id"}
        - session.ended: {"session_id"}
        - session.state: {"session_id", "state"}
        - worker.created: {"worker_id", "type", "session_id"}
        - worker.completed: {"worker_id", "status"}
        - worker.acked: {"worker_id"}
        - priority.created: {"priority_id", "content", "level"}
        - priority.updated: {"priority_id"}
        - priority.completed: {"priority_id"}
        - priority.deleted: {"priority_id"}
        - file.modified: {"path", "mtime"}
        - file.created: {"path", "mtime"}
        - file.deleted: {"path"}
        - file.moved: {"path", "dest_path"}

    Ping every 15s keeps connection alive.
    """

    async def event_generator():
        queue = event_bus.subscribe()

        try:
            # Send connection established event
            yield {
                "event": "connected",
                "data": json.dumps({
                    "type": "connected",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "subscriber_count": event_bus.subscriber_count,
                }),
            }

            while True:
                try:
                    # Wait for event with timeout (allows graceful cleanup)
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)

                    yield {
                        "event": event.event_type,
                        "data": event.to_json(),
                    }

                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield {
                        "event": "ping",
                        "data": json.dumps({
                            "type": "ping",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }),
                    }

        except asyncio.CancelledError:
            pass
        except GeneratorExit:
            pass
        finally:
            event_bus.unsubscribe(queue)

    return EventSourceResponse(event_generator(), ping=15)


@router.get("/events/health")
async def events_health():
    """Health check for event bus."""
    return {
        "status": "ok",
        "subscriber_count": event_bus.subscriber_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# =============================================================================
# HEALTH
# =============================================================================

def _get_file_size_str(path: Path) -> str:
    """Get human-readable file size."""
    if not path.exists():
        return "N/A"
    size = path.stat().st_size
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    else:
        return f"{size / (1024 * 1024):.1f} MB"


def _count_file_lines(path: Path) -> int | None:
    """Count lines in a file."""
    if not path.exists():
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return sum(1 for _ in f)
    except Exception:
        return None


@router.get("/health")
async def system_health():
    """Comprehensive system health check."""
    # Import app dynamically to avoid circular imports
    import sys
    src_path = Path(__file__).resolve().parents[2]
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))
    from app import app

    result = {
        "backend": {
            "api": "ok",
            "watcher": "offline",
            "watcher_detail": None,
            "triggers": "offline",
            "triggers_detail": None,
            "context_monitor": "offline",
            "context_monitor_detail": None,
        },
        "database": {
            "status": "offline",
            "size": None,
            "wal_status": "offline",
            "wal_size": None,
        },
        "integrations": {
            "apple_calendar": {"status": "ok", "detail": "Native macOS integration"},
            "life_mcp": {"status": "ok", "detail": "Configured"},
            "apple_mcp": {"status": "ok", "detail": "Configured"},
            "mail_access": {"status": "warning", "detail": "Requires Full Disk Access"},
        },
        "watcher_modules": [],
        "warnings": [],
    }

    # Check watcher task
    watcher_task = getattr(app.state, "watcher_task", None)
    if watcher_task:
        if watcher_task.done():
            result["backend"]["watcher"] = "error"
            if watcher_task.exception():
                result["backend"]["watcher_detail"] = str(watcher_task.exception())[:100]
        else:
            result["backend"]["watcher"] = "ok"
            result["backend"]["watcher_detail"] = "Running"

    # Check triggers task
    trigger_task = getattr(app.state, "trigger_task", None)
    if trigger_task:
        if trigger_task.done():
            result["backend"]["triggers"] = "error"
            if trigger_task.exception():
                result["backend"]["triggers_detail"] = str(trigger_task.exception())[:100]
        else:
            result["backend"]["triggers"] = "ok"
            result["backend"]["triggers_detail"] = "Running"

    # Check context monitor task
    monitor_task = getattr(app.state, "monitor_task", None)
    if monitor_task:
        if monitor_task.done():
            result["backend"]["context_monitor"] = "error"
            if monitor_task.exception():
                result["backend"]["context_monitor_detail"] = str(monitor_task.exception())[:100]
        else:
            result["backend"]["context_monitor"] = "ok"
            result["backend"]["context_monitor_detail"] = "Running"

    # Check database
    if DB_PATH.exists():
        result["database"]["status"] = "ok"
        result["database"]["size"] = _get_file_size_str(DB_PATH)

        # Check WAL file
        wal_path = DB_PATH.with_suffix(".db-wal")
        if wal_path.exists():
            result["database"]["wal_status"] = "ok"
            result["database"]["wal_size"] = _get_file_size_str(wal_path)
        else:
            result["database"]["wal_status"] = "ok"
            result["database"]["wal_size"] = "0 B"

    # Check Mail.app access
    mail_db_path = Path.home() / "Library" / "Mail" / "V10" / "MailData" / "Envelope Index"
    if mail_db_path.exists():
        try:
            with open(mail_db_path, 'rb') as f:
                f.read(1)
            result["integrations"]["mail_access"] = {"status": "ok", "detail": "Full Disk Access granted"}
        except PermissionError:
            result["integrations"]["mail_access"] = {"status": "warning", "detail": "Needs Full Disk Access"}

    # Load watcher module status from config
    try:
        with open(CONFIG_PATH, 'r') as f:
            config = yaml.safe_load(f)

        enabled_modules = config.get("watcher", {}).get("modules", [])
        all_modules = ["domains", "contacts", "today_context"]

        for mod in all_modules:
            enabled = mod in enabled_modules
            status = "ok" if enabled else "offline"
            detail = "Enabled" if enabled else "Disabled"

            result["watcher_modules"].append({
                "name": mod,
                "status": status,
                "detail": detail,
            })
    except Exception as e:
        result["warnings"].append({
            "type": "config_error",
            "message": f"Could not read config: {str(e)[:50]}",
        })

    # Check for health warnings from database
    def _load_contact_warnings():
        with get_db() as conn:
            cursor = conn.execute("""
                SELECT name FROM contacts
                WHERE description IS NULL OR description = ''
                LIMIT 5
            """)
            return [row[0] for row in cursor.fetchall()]

    missing_desc = await _run_blocking(_load_contact_warnings)
    if missing_desc:
        result["warnings"].append({
            "type": "contact_metadata",
            "message": f"{len(missing_desc)} contacts missing description ({', '.join(missing_desc[:3])}...)",
        })

    return result


@router.get("/health/docs")
async def system_docs():
    """List system documentation files."""
    result = {
        "system_prompts": [],
        "roles": [],
        "modes": [],
        "system_specs": [],
        "application_specs": [],
    }

    def _load_docs():
        local = {
            "system_prompts": [],
            "roles": [],
            "modes": [],
            "system_specs": [],
            "application_specs": [],
        }

        # System prompts
        claude_md = REPO_ROOT / "CLAUDE.md"
        if claude_md.exists():
            local["system_prompts"].append({
                "path": "CLAUDE.md",
                "name": "CLAUDE.md",
                "lines": _count_file_lines(claude_md),
                "exists": True,
            })

        # Check for BACKGROUND-WORKER.md
        background_worker_md = REPO_ROOT / "BACKGROUND-WORKER.md"
        local["system_prompts"].append({
            "path": "BACKGROUND-WORKER.md",
            "name": "BACKGROUND-WORKER.md",
            "lines": _count_file_lines(background_worker_md) if background_worker_md.exists() else None,
            "exists": background_worker_md.exists(),
        })

        # Roles (.claude/roles/{role}/role.md)
        roles_dir = REPO_ROOT / ".claude" / "roles"
        if roles_dir.exists():
            for role_folder in sorted(roles_dir.iterdir()):
                if not role_folder.is_dir():
                    continue
                role_file = role_folder / "role.md"
                if role_file.exists():
                    role_name = role_folder.name.title()
                    local["roles"].append({
                        "path": f".claude/roles/{role_folder.name}/role.md",
                        "name": role_name,
                        "lines": _count_file_lines(role_file),
                        "exists": True,
                    })

        # Modes (.claude/roles/{role}/*.md except role.md)
        if roles_dir.exists():
            for role_folder in sorted(roles_dir.iterdir()):
                if not role_folder.is_dir():
                    continue
                for mode_file in sorted(role_folder.glob("*.md")):
                    if mode_file.name == "role.md":
                        continue
                    mode_name = mode_file.stem.title()
                    local["modes"].append({
                        "path": f".claude/roles/{role_folder.name}/{mode_file.name}",
                        "name": f"{role_folder.name}/{mode_name}",
                        "lines": _count_file_lines(mode_file),
                        "exists": True,
                    })

        # System specs
        system_spec = REPO_ROOT / ".engine" / "SYSTEM-SPEC.md"
        if system_spec.exists():
            local["system_specs"].append({
                "path": ".engine/SYSTEM-SPEC.md",
                "name": "System Backend SPEC",
                "lines": _count_file_lines(system_spec),
                "exists": True,
            })

        # Custom Application specs
        desktop_dir = REPO_ROOT / "Desktop"
        if desktop_dir.exists():
            for app_dir in desktop_dir.iterdir():
                if app_dir.is_dir():
                    spec_file = app_dir / "APP-SPEC.md"
                    if spec_file.exists():
                        local["application_specs"].append({
                            "path": f"Desktop/{app_dir.name}/APP-SPEC.md",
                            "name": f"{app_dir.name} APP-SPEC",
                            "lines": _count_file_lines(spec_file),
                            "exists": True,
                        })

        return local

    result.update(await _run_blocking(_load_docs))

    return result


# =============================================================================
# SYSTEM CONFIGURATION
# =============================================================================

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

    def _load_config():
        local = {
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
            local["watcher"]["modules"] = {mod: mod in enabled_modules for mod in all_modules}

            # Executor settings
            executor_config = config.get("scheduled_work", {}).get("executor", {})
            local["executor"]["poll_interval_sec"] = executor_config.get("poll_interval_sec", 60)
            local["executor"]["batch_size"] = executor_config.get("batch_size", 1)
            local["executor"]["check_interval_sec"] = config.get("scheduled_work", {}).get("check_interval_sec", 60)

            # SMS settings
            sms_config = config.get("sms", {})
            local["sms"]["enabled"] = sms_config.get("enabled", False)
            quiet_hours = sms_config.get("notifications", {}).get("quiet_hours")
            if quiet_hours:
                local["sms"]["quiet_hours"] = {
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
                        local["schema"]["tables"].append({
                            "name": table_name,
                            "columns": columns,
                        })
            except Exception:
                pass

        # List migrations
        if MIGRATIONS_PATH.exists():
            for migration_file in sorted(MIGRATIONS_PATH.glob("*.sql")):
                local["schema"]["migrations"].append({
                    "name": migration_file.name,
                    "applied": True,
                })

        return local

    result = await _run_blocking(_load_config)

    return result


def _parse_section(content: str, section_name: str) -> str:
    """Extract a section from markdown content by header name."""
    pattern = rf'^(#{{2,3}})\s+{re.escape(section_name)}\s*$'
    match = re.search(pattern, content, re.IGNORECASE | re.MULTILINE)
    if not match:
        return ""

    start_level = len(match.group(1))
    start_pos = match.end()

    next_heading_pattern = rf'^#{{1,{start_level}}}\s+'
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

    def _load_memory():
        local = {
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

        # Parse TODAY.md
        today_file = settings.repo_root / "Desktop" / "TODAY.md"
        if today_file.exists():
            try:
                content = today_file.read_text(encoding="utf-8")
                local["today"]["memory_section"] = _parse_section(content, "Memory")
                local["today"]["friction_section"] = _parse_section(content, "Friction")
                local["today"]["open_loops"] = _parse_section(content, "Open Loops")
            except Exception:
                pass

        # Parse MEMORY.md
        weekly_file = settings.repo_root / "Desktop" / "MEMORY.md"
        if weekly_file.exists():
            try:
                content = weekly_file.read_text(encoding="utf-8")
                local["weekly"]["content"] = content
                local["weekly"]["waiting_on"] = _parse_section(content, "Waiting On")
                local["weekly"]["current_state"] = _parse_section(content, "Current State")
                local["weekly"]["active_threads"] = _parse_section(content, "Active Threads")
                local["longterm"]["content"] = _parse_section(content, "Stable Patterns")
            except Exception:
                pass

        return local

    result = await _run_blocking(_load_memory)

    return result


# =============================================================================
# SYSTEM INFO
# =============================================================================

@router.get("/info")
async def get_system_info():
    """Get system information."""
    return {
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
        },
        "python": {
            "version": sys.version,
            "executable": sys.executable,
        },
        "engine": {
            "version": "4.0.0",
            "port": settings.port,
            "repo_root": str(settings.repo_root),
            "db_path": str(settings.db_path),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/perf")
async def get_perf_metrics():
    """In-process performance metrics by route."""
    return {
        "routes": get_perf_snapshot(),
        "workers": get_worker_snapshot(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/about")
async def get_about():
    """Get about information."""
    return {
        "name": "Claude OS",
        "version": "4.0.0",
        "description": "Your life, rendered as a desktop you can touch.",
        "repository": "life-specifications",
        "author": "Your Name",
        "ai_partner": "Claude (Anthropic)",
        "built_with": [
            "Next.js 15",
            "FastAPI",
            "SQLite",
            "FastMCP",
            "Tailwind CSS",
        ],
    }
