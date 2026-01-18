"""Metrics endpoints for analytics and patterns."""
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter

from config import settings
from db import get_db

router = APIRouter()

# Base paths
# metrics.py is at .engine/src/api/metrics.py → api → src → .engine → repo_root
REPO_ROOT = Path(settings.repo_root) if hasattr(settings, 'repo_root') else Path(__file__).resolve().parents[3]
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"


@router.get("/patterns")
async def metrics_patterns(days: int = 7):
    """Pattern analysis metrics for the Patterns tab.

    Returns:
    - work_rhythm: Hour × Day activity matrix (sessions started per slot)
    - session_stats: By role - count, avg duration, workers spawned
    - app_distribution: Time by app from activity_log (if available)
    - weekly_comparison: This week vs last week metrics
    """
    result = {
        "work_rhythm": [],  # List of {day: 0-6, hour: 0-23, count: N}
        "session_stats": {},  # {role: {count, avg_duration_mins, workers_spawned}}
        "app_distribution": [],  # [{app, minutes, percentage}]
        "weekly_comparison": {
            "this_week": {"sessions": 0, "workers": 0, "priorities_completed": 0},
            "last_week": {"sessions": 0, "workers": 0, "priorities_completed": 0},
        },
    }

    with get_db() as conn:
        # 1. Work rhythm heatmap (hour × day of week)
        cursor = conn.execute("""
            SELECT
                CAST(strftime('%w', started_at, 'localtime') AS INTEGER) as day_of_week,
                CAST(strftime('%H', started_at, 'localtime') AS INTEGER) as hour,
                COUNT(*) as count
            FROM sessions
            WHERE started_at >= datetime('now', ? || ' days')
            GROUP BY day_of_week, hour
            ORDER BY day_of_week, hour
        """, (f"-{days}",))

        rhythm_data = defaultdict(lambda: defaultdict(int))
        for row in cursor.fetchall():
            rhythm_data[row[0]][row[1]] = row[2]

        # Convert to list format for frontend
        for day in range(7):
            for hour in range(24):
                count = rhythm_data[day][hour]
                if count > 0:
                    result["work_rhythm"].append({
                        "day": day,
                        "hour": hour,
                        "count": count,
                    })

        # 2. Session stats by role
        cursor = conn.execute("""
            SELECT
                COALESCE(role, 'unknown') as role,
                COUNT(*) as count,
                AVG(
                    CASE WHEN ended_at IS NOT NULL
                    THEN (julianday(ended_at) - julianday(started_at)) * 24 * 60
                    ELSE NULL END
                ) as avg_duration_mins
            FROM sessions
            WHERE started_at >= datetime('now', ? || ' days')
            GROUP BY role
        """, (f"-{days}",))

        for row in cursor.fetchall():
            role = row[0]
            result["session_stats"][role] = {
                "count": row[1],
                "avg_duration_mins": round(row[2], 1) if row[2] else 0,
                "workers_spawned": 0,
            }

        # Get worker counts per role
        cursor = conn.execute("""
            SELECT
                COALESCE(s.role, 'unknown') as role,
                COUNT(w.id) as worker_count
            FROM sessions s
            LEFT JOIN workers w ON w.spawned_by_session = s.session_id
            WHERE s.started_at >= datetime('now', ? || ' days')
            GROUP BY s.role
        """, (f"-{days}",))

        for row in cursor.fetchall():
            role = row[0]
            if role in result["session_stats"]:
                result["session_stats"][role]["workers_spawned"] = row[1]

        # 3. App distribution from activity_log (last 24h due to retention)
        cursor = conn.execute("""
            SELECT
                frontmost_app,
                COUNT(*) * 0.5 as minutes,  -- 30-second samples
                COUNT(*) as samples
            FROM activity_log
            WHERE timestamp >= datetime('now', '-24 hours')
            AND frontmost_app IS NOT NULL
            AND frontmost_app != ''
            GROUP BY frontmost_app
            ORDER BY samples DESC
            LIMIT 10
        """)

        total_samples = 0
        apps = []
        for row in cursor.fetchall():
            apps.append({
                "app": row[0],
                "minutes": round(row[1], 1),
                "samples": row[2],
            })
            total_samples += row[2]

        for app in apps:
            app["percentage"] = round(app["samples"] / total_samples * 100, 1) if total_samples > 0 else 0
            del app["samples"]

        result["app_distribution"] = apps

        # 4. Weekly comparison
        # This week
        cursor = conn.execute("""
            SELECT COUNT(*) FROM sessions
            WHERE started_at >= datetime('now', 'weekday 0', '-7 days', 'localtime')
        """)
        result["weekly_comparison"]["this_week"]["sessions"] = cursor.fetchone()[0]

        cursor = conn.execute("""
            SELECT COUNT(*) FROM workers
            WHERE created_at >= datetime('now', 'weekday 0', '-7 days', 'localtime')
        """)
        result["weekly_comparison"]["this_week"]["workers"] = cursor.fetchone()[0]

        cursor = conn.execute("""
            SELECT COUNT(*) FROM priorities
            WHERE completed = 1 AND completed_at >= datetime('now', 'weekday 0', '-7 days', 'localtime')
        """)
        result["weekly_comparison"]["this_week"]["priorities_completed"] = cursor.fetchone()[0]

        # Last week
        cursor = conn.execute("""
            SELECT COUNT(*) FROM sessions
            WHERE started_at >= datetime('now', 'weekday 0', '-14 days', 'localtime')
            AND started_at < datetime('now', 'weekday 0', '-7 days', 'localtime')
        """)
        result["weekly_comparison"]["last_week"]["sessions"] = cursor.fetchone()[0]

        cursor = conn.execute("""
            SELECT COUNT(*) FROM workers
            WHERE created_at >= datetime('now', 'weekday 0', '-14 days', 'localtime')
            AND created_at < datetime('now', 'weekday 0', '-7 days', 'localtime')
        """)
        result["weekly_comparison"]["last_week"]["workers"] = cursor.fetchone()[0]

        cursor = conn.execute("""
            SELECT COUNT(*) FROM priorities
            WHERE completed = 1
            AND completed_at >= datetime('now', 'weekday 0', '-14 days', 'localtime')
            AND completed_at < datetime('now', 'weekday 0', '-7 days', 'localtime')
        """)
        result["weekly_comparison"]["last_week"]["priorities_completed"] = cursor.fetchone()[0]

    return result


@router.get("/overview")
async def metrics_overview():
    """Life-focused metrics overview for the dashboard.

    Returns actionable metrics rather than DevOps stats:
    - drift_days: Days since last critical priority completed (ADHD drift detection)
    - completion_rates: Completion % by priority level for last 7 days
    - claude_time_today: Total Claude session hours today
    - worker_success_rate: Worker completion success rate
    - priorities_today: Count of priorities by level and completion status
    """
    result = {
        "drift_days": None,  # Days since last critical completion
        "completion_rates": {
            "critical": 0.0,
            "medium": 0.0,
            "low": 0.0,
        },
        "claude_time_today": 0.0,  # Hours
        "worker_success_rate": 0.0,
        "priorities_today": {
            "critical": {"total": 0, "completed": 0},
            "medium": {"total": 0, "completed": 0},
            "low": {"total": 0, "completed": 0},
        },
    }

    with get_db() as conn:
        # 1. Drift detector: days since last critical priority completed
        cursor = conn.execute("""
            SELECT julianday('now') - julianday(MAX(completed_at)) as days_since
            FROM priorities
            WHERE level = 'critical' AND completed = 1 AND completed_at IS NOT NULL
        """)
        row = cursor.fetchone()
        if row and row[0] is not None:
            result["drift_days"] = round(row[0], 1)

        # 2. Completion rates by level (last 7 days)
        cursor = conn.execute("""
            SELECT
                level,
                COUNT(*) as total,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
            FROM priorities
            WHERE date >= date('now', '-7 days') AND date IS NOT NULL
            GROUP BY level
        """)
        for row in cursor.fetchall():
            level = row[0]
            total = row[1]
            completed = row[2]
            if level in result["completion_rates"] and total > 0:
                result["completion_rates"][level] = round(completed / total * 100, 1)

        # 3. Claude time today (sum of session durations)
        cursor = conn.execute("""
            SELECT SUM(
                (julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24
            ) as hours
            FROM sessions
            WHERE date(started_at) = date('now', 'localtime')
        """)
        row = cursor.fetchone()
        if row and row[0]:
            result["claude_time_today"] = round(row[0], 1)

        # 4. Worker success rate (all time, excluding pending/running)
        cursor = conn.execute("""
            SELECT
                SUM(CASE WHEN status LIKE 'complete%' THEN 1 ELSE 0 END) as success,
                COUNT(*) as total
            FROM workers
            WHERE status NOT IN ('pending', 'running', 'snoozed', 'cancelled')
        """)
        row = cursor.fetchone()
        if row and row[1] > 0:
            result["worker_success_rate"] = round(row[0] / row[1] * 100, 1)

        # 5. Today's priorities breakdown
        cursor = conn.execute("""
            SELECT
                level,
                COUNT(*) as total,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
            FROM priorities
            WHERE date = date('now', 'localtime')
            GROUP BY level
        """)
        for row in cursor.fetchall():
            level = row[0]
            if level in result["priorities_today"]:
                result["priorities_today"][level] = {
                    "total": row[1],
                    "completed": row[2],
                }

    return result


@router.get("")
async def system_metrics():
    """System execution metrics and database stats."""
    result = {
        "workers": {
            "last_24h": 0,
            "last_7d": 0,
            "last_30d": 0,
            "total": 0,
            "success_rate": 0.0,
            "avg_duration_minutes": 0,
            "by_type": {},
        },
        "database": {
            "size_bytes": 0,
            "wal_size_bytes": 0,
            "tables": {},
        },
        "recent_failures": [],
    }

    with get_db() as conn:
        # Task counts by time period
        now = datetime.now()
        day_ago = (now - timedelta(days=1)).isoformat()
        week_ago = (now - timedelta(days=7)).isoformat()
        month_ago = (now - timedelta(days=30)).isoformat()

        cursor = conn.execute("SELECT COUNT(*) FROM workers WHERE created_at > ?", (day_ago,))
        result["workers"]["last_24h"] = cursor.fetchone()[0]

        cursor = conn.execute("SELECT COUNT(*) FROM workers WHERE created_at > ?", (week_ago,))
        result["workers"]["last_7d"] = cursor.fetchone()[0]

        cursor = conn.execute("SELECT COUNT(*) FROM workers WHERE created_at > ?", (month_ago,))
        result["workers"]["last_30d"] = cursor.fetchone()[0]

        cursor = conn.execute("SELECT COUNT(*) FROM workers")
        result["workers"]["total"] = cursor.fetchone()[0]

        # Success rate
        cursor = conn.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status LIKE 'complete%') as success,
                COUNT(*) as total
            FROM workers
            WHERE status NOT IN ('pending', 'running', 'scheduled')
        """)
        row = cursor.fetchone()
        if row and row[1] > 0:
            result["workers"]["success_rate"] = row[0] / row[1]

        # Average duration (for completed tasks with timestamps)
        cursor = conn.execute("""
            SELECT AVG(
                (julianday(completed_at) - julianday(created_at)) * 24 * 60
            )
            FROM workers
            WHERE completed_at IS NOT NULL
        """)
        avg = cursor.fetchone()[0]
        result["workers"]["avg_duration_minutes"] = int(avg) if avg else 0

        # By type
        cursor = conn.execute("""
            SELECT task_type, COUNT(*)
            FROM workers
            GROUP BY task_type
        """)
        result["workers"]["by_type"] = {row[0]: row[1] for row in cursor.fetchall()}

        # Recent failures
        cursor = conn.execute("""
            SELECT id, task_type, updated_at, last_error
            FROM workers
            WHERE status LIKE 'failed%'
            ORDER BY updated_at DESC
            LIMIT 5
        """)
        result["recent_failures"] = [
            {
                "id": row[0],
                "type": row[1],
                "failed_at": row[2],
                "reason": row[3][:100] if row[3] else None,
            }
            for row in cursor.fetchall()
        ]

        # Table row counts
        tables = ["workers", "sessions", "missions", "contacts", "priorities", "staged_content"]
        for table in tables:
            try:
                cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
                result["database"]["tables"][table] = cursor.fetchone()[0]
            except Exception:
                pass  # Table might not exist

    # Database file sizes
    if DB_PATH.exists():
        result["database"]["size_bytes"] = DB_PATH.stat().st_size

    wal_path = DB_PATH.with_suffix(".db-wal")
    if wal_path.exists():
        result["database"]["wal_size_bytes"] = wal_path.stat().st_size

    return result
