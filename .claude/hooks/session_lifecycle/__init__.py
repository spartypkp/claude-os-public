"""Session lifecycle hook package.

Shared utilities for session lifecycle management.
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Repository root
repo_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(repo_root / ".engine" / "src"))

from services.storage import SystemStorage
from services.workers import TaskService

# Database path
DB_PATH = repo_root / ".engine/data/db/system.db"

# Timezone
PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


def get_db():
    """Get database connection."""
    return SystemStorage(DB_PATH)


def get_session_id(input_data: dict) -> str:
    """Get session ID from environment or input data.

    Truncates to 8 chars to match SessionManager.spawn() format.
    """
    full_id = os.environ.get('CLAUDE_SESSION_ID') or input_data.get('session_id')
    return full_id[:8] if full_id else None


def now_iso() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def format_age(completed_at) -> str:
    """Format time since completion (e.g., '2h ago', '30m ago')."""
    if not completed_at:
        return "recently"

    try:
        if isinstance(completed_at, str):
            completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))
        else:
            completed_dt = completed_at

        # Treat naive timestamps as Pacific
        if completed_dt.tzinfo is None:
            completed_dt = completed_dt.replace(tzinfo=PACIFIC_TZ)

        now_pacific = datetime.now(PACIFIC_TZ)
        completed_pacific = completed_dt.astimezone(PACIFIC_TZ)

        delta = now_pacific - completed_pacific
        total_seconds = delta.total_seconds()

        if total_seconds < 60:
            return "just now"
        elif total_seconds < 3600:
            minutes = int(total_seconds / 60)
            return f"{minutes}m ago"
        elif total_seconds < 86400:
            hours = int(total_seconds / 3600)
            return f"{hours}h ago"
        else:
            days = int(total_seconds / 86400)
            if days >= 2:
                return f"{days}d ago ⚠️"
            else:
                return f"{days}d ago"
    except Exception:
        return "recently"


def truncate_summary(summary: str, max_length: int = 60) -> str:
    """Truncate summary with ellipsis."""
    if len(summary) <= max_length:
        return summary
    return summary[:max_length-3] + "..."


__all__ = [
    'repo_root', 'DB_PATH', 'PACIFIC_TZ',
    'get_db', 'get_session_id', 'now_iso',
    'format_age', 'truncate_summary',
    'TaskService', 'SystemStorage',
]
