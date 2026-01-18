"""Health and documentation endpoints for system visibility."""
from pathlib import Path

import yaml
from fastapi import APIRouter

from config import settings
from db import get_db

router = APIRouter()

# Base paths
# health.py is at .engine/src/api/health.py → api → src → .engine → repo_root
REPO_ROOT = Path(settings.repo_root) if hasattr(settings, 'repo_root') else Path(__file__).resolve().parents[3]
CONFIG_PATH = REPO_ROOT / ".engine" / "config" / "config.yaml"
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"


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


def _check_critical_catchup_needed() -> bool:
    """Check if any protected missions need catch-up.
    
    Returns True if Memory Consolidation (or other protected missions)
    haven't run when expected - indicating system was offline.
    """
    from datetime import datetime, timedelta
    
    try:
        from zoneinfo import ZoneInfo
        PACIFIC = ZoneInfo("America/Los_Angeles")
    except ImportError:
        import pytz
        PACIFIC = pytz.timezone("America/Los_Angeles")
    
    try:
        with get_db() as conn:
            # Get protected missions
            cursor = conn.execute(
                "SELECT slug, schedule_type, schedule_time, last_run "
                "FROM missions WHERE source = 'core_protected'"
            )
            protected = cursor.fetchall()
            
            for row in protected:
                slug, schedule_type, schedule_time, last_run = row
                
                if last_run is None:
                    return True  # Never ran
                
                # Parse last_run
                last_run_str = last_run
                if last_run_str.endswith('Z'):
                    last_run_str = last_run_str[:-1] + '+00:00'
                last_run_dt = datetime.fromisoformat(last_run_str).astimezone(PACIFIC)
                
                now_pacific = datetime.now(PACIFIC)
                
                # For time-scheduled missions
                if schedule_type == "time" and schedule_time:
                    parts = schedule_time.split(":")
                    scheduled_hour = int(parts[0])
                    
                    # Expected: should have run today (if past time) or yesterday
                    if now_pacific.hour >= scheduled_hour:
                        expected_date = now_pacific.date()
                    else:
                        expected_date = (now_pacific - timedelta(days=1)).date()
                    
                    if last_run_dt.date() < expected_date:
                        return True  # Missed expected run
                
                # Fallback: > 48 hours is suspicious
                elif (now_pacific - last_run_dt) > timedelta(hours=48):
                    return True
            
            return False
            
    except Exception:
        return False  # On error, assume no catchup needed


@router.get("")
async def system_health():
    """Comprehensive system health check."""
    # Import app from parent module
    import sys
    from pathlib import Path
    src_path = Path(__file__).resolve().parents[1]
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))
    from app import app

    result = {
        "backend": {
            "api": "ok",
            "watcher": "offline",
            "watcher_detail": None,
            "executor": "offline",
            "executor_detail": None,
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

    # Check executor task
    executor_task = getattr(app.state, "executor_task", None)
    if executor_task:
        if executor_task.done():
            result["backend"]["executor"] = "error"
            if executor_task.exception():
                result["backend"]["executor_detail"] = str(executor_task.exception())[:100]
        else:
            result["backend"]["executor"] = "ok"
            # Check for running tasks
            with get_db() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM workers WHERE status = 'running'")
                running_count = cursor.fetchone()[0]
            result["backend"]["executor_detail"] = f"{running_count} running" if running_count else "Idle"

    # Check mission scheduler task
    mission_task = getattr(app.state, "mission_scheduler_task", None)
    if mission_task:
        if mission_task.done():
            result["backend"]["mission_scheduler"] = "error"
            if mission_task.exception():
                result["backend"]["mission_scheduler_detail"] = str(mission_task.exception())[:100]
        else:
            result["backend"]["mission_scheduler"] = "ok"
            # Check for running missions (new unified missions system)
            with get_db() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM mission_executions WHERE status = 'running'")
                running_count = cursor.fetchone()[0]
            result["backend"]["mission_scheduler_detail"] = f"{running_count} running" if running_count else "Idle"
    else:
        result["backend"]["mission_scheduler"] = "offline"
        result["backend"]["mission_scheduler_detail"] = "Not started"
    
    # Check for critical mission catch-up needed
    result["critical_catchup_pending"] = _check_critical_catchup_needed()

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
            # Try to read a byte to check access
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
    with get_db() as conn:
        # Check for contacts missing metadata
        cursor = conn.execute("""
            SELECT name FROM contacts
            WHERE description IS NULL OR description = ''
            LIMIT 5
        """)
        missing_desc = [row[0] for row in cursor.fetchall()]
        if missing_desc:
            result["warnings"].append({
                "type": "contact_metadata",
                "message": f"{len(missing_desc)} contacts missing description ({', '.join(missing_desc[:3])}...)",
            })

    return result


@router.get("/docs")
async def system_docs():
    """List system documentation files."""
    result = {
        "system_prompts": [],
        "roles": [],
        "modes": [],
        "system_specs": [],
        "application_specs": [],
    }

    # System prompts
    claude_md = REPO_ROOT / "CLAUDE.md"
    if claude_md.exists():
        result["system_prompts"].append({
            "path": "CLAUDE.md",
            "name": "CLAUDE.md",
            "lines": _count_file_lines(claude_md),
            "exists": True,
        })

    # Check for BACKGROUND-WORKER.md
    background_worker_md = REPO_ROOT / "BACKGROUND-WORKER.md"
    result["system_prompts"].append({
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
                role_name = role_folder.name.title()  # builder -> Builder
                result["roles"].append({
                    "path": f".claude/roles/{role_folder.name}/role.md",
                    "name": role_name,
                    "lines": _count_file_lines(role_file),
                    "exists": True,
                })

    # Modes (.claude/roles/{role}/*.md except role.md)
    roles_dir = REPO_ROOT / ".claude" / "roles"
    if roles_dir.exists():
        for role_folder in sorted(roles_dir.iterdir()):
            if not role_folder.is_dir():
                continue
            for mode_file in sorted(role_folder.glob("*.md")):
                if mode_file.name == "role.md":
                    continue
                mode_name = mode_file.stem.title()  # interactive.md -> Interactive
                result["modes"].append({
                    "path": f".claude/roles/{role_folder.name}/{mode_file.name}",
                    "name": f"{role_folder.name}/{mode_name}",
                    "lines": _count_file_lines(mode_file),
                    "exists": True,
                })

    # System specs
    system_spec = REPO_ROOT / ".engine" / "SYSTEM-SPEC.md"
    if system_spec.exists():
        result["system_specs"].append({
            "path": ".engine/SYSTEM-SPEC.md",
            "name": "System Backend SPEC",
            "lines": _count_file_lines(system_spec),
            "exists": True,
        })

    # Custom Application specs (folders with APP-SPEC.md in Desktop/)
    desktop_dir = REPO_ROOT / "Desktop"
    if desktop_dir.exists():
        for app_dir in desktop_dir.iterdir():
            if app_dir.is_dir():
                spec_file = app_dir / "APP-SPEC.md"
                if spec_file.exists():
                    result["application_specs"].append({
                        "path": f"Desktop/{app_dir.name}/APP-SPEC.md",
                        "name": f"{app_dir.name} APP-SPEC",
                        "lines": _count_file_lines(spec_file),
                        "exists": True,
                    })

    return result
