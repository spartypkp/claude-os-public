"""Analytics API - Metrics, patterns, and usage tracking endpoints.

Combines:
- /metrics: System metrics, work patterns, session analytics
- /usage: Claude Code usage tracking
"""
import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from core.config import settings
from core.database import get_db
from core.storage import SystemStorage
from .usage_tracker import UsageTracker

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analytics"])

# Paths
REPO_ROOT = Path(settings.repo_root) if hasattr(settings, 'repo_root') else Path(__file__).resolve().parents[4]
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"

# Store tracker instance (set during startup)
_tracker: Optional[UsageTracker] = None


def set_tracker(tracker: UsageTracker):
    """Set the global tracker instance."""
    global _tracker
    _tracker = tracker


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# ============================================
# Metrics endpoints
# ============================================

@router.get("/patterns")
async def metrics_patterns(days: int = 7):
    """Pattern analysis metrics for the Patterns tab.

    Returns:
    - work_rhythm: Hour x Day activity matrix (sessions started per slot)
    - session_stats: By role - count, avg duration
    - app_distribution: Time by app from activity_log (if available)
    - weekly_comparison: This week vs last week metrics
    """
    result = {
        "work_rhythm": [],  # List of {day: 0-6, hour: 0-23, count: N}
        "session_stats": {},  # {role: {count, avg_duration_mins}}
        "app_distribution": [],  # [{app, minutes, percentage}]
        "weekly_comparison": {
            "this_week": {"sessions": 0, "priorities_completed": 0},
            "last_week": {"sessions": 0, "priorities_completed": 0},
        },
    }

    def _load_patterns():
        with get_db() as conn:
            # 1. Work rhythm heatmap (hour x day of week)
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
            work_rhythm = []
            for day in range(7):
                for hour in range(24):
                    count = rhythm_data[day][hour]
                    if count > 0:
                        work_rhythm.append({
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

            session_stats = {}
            for row in cursor.fetchall():
                role = row[0]
                session_stats[role] = {
                    "count": row[1],
                    "avg_duration_mins": round(row[2], 1) if row[2] else 0,
                }

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

            # 4. Weekly comparison
            cursor = conn.execute("""
                SELECT COUNT(*) FROM sessions
                WHERE started_at >= datetime('now', 'weekday 0', '-7 days', 'localtime')
            """)
            this_week_sessions = cursor.fetchone()[0]

            cursor = conn.execute("""
                SELECT COUNT(*) FROM priorities
                WHERE completed = 1 AND completed_at >= datetime('now', 'weekday 0', '-7 days', 'localtime')
            """)
            this_week_completed = cursor.fetchone()[0]

            cursor = conn.execute("""
                SELECT COUNT(*) FROM sessions
                WHERE started_at >= datetime('now', 'weekday 0', '-14 days', 'localtime')
                AND started_at < datetime('now', 'weekday 0', '-7 days', 'localtime')
            """)
            last_week_sessions = cursor.fetchone()[0]

            cursor = conn.execute("""
                SELECT COUNT(*) FROM priorities
                WHERE completed = 1
                AND completed_at >= datetime('now', 'weekday 0', '-14 days', 'localtime')
                AND completed_at < datetime('now', 'weekday 0', '-7 days', 'localtime')
            """)
            last_week_completed = cursor.fetchone()[0]

            return (
                work_rhythm,
                session_stats,
                apps,
                this_week_sessions,
                this_week_completed,
                last_week_sessions,
                last_week_completed,
            )

    (
        result["work_rhythm"],
        result["session_stats"],
        result["app_distribution"],
        this_week_sessions,
        this_week_completed,
        last_week_sessions,
        last_week_completed,
    ) = await _run_blocking(_load_patterns)

    result["weekly_comparison"]["this_week"]["sessions"] = this_week_sessions
    result["weekly_comparison"]["this_week"]["priorities_completed"] = this_week_completed
    result["weekly_comparison"]["last_week"]["sessions"] = last_week_sessions
    result["weekly_comparison"]["last_week"]["priorities_completed"] = last_week_completed

    return result


@router.get("/overview")
async def metrics_overview():
    """Life-focused metrics overview for the dashboard.

    Returns actionable metrics rather than DevOps stats:
    - drift_days: Days since last critical priority completed (ADHD drift detection)
    - completion_rates: Completion % by priority level for last 7 days
    - claude_time_today: Total Claude session hours today
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
        "priorities_today": {
            "critical": {"total": 0, "completed": 0},
            "medium": {"total": 0, "completed": 0},
            "low": {"total": 0, "completed": 0},
        },
    }

    def _load_overview():
        with get_db() as conn:
            # 1. Drift detector: days since last critical priority completed
            cursor = conn.execute("""
                SELECT julianday('now') - julianday(MAX(completed_at)) as days_since
                FROM priorities
                WHERE level = 'critical' AND completed = 1 AND completed_at IS NOT NULL
            """)
            row = cursor.fetchone()
            drift_days = round(row[0], 1) if row and row[0] is not None else None

            # 2. Completion rates by level (last 7 days)
            completion_rates = {
                "critical": 0.0,
                "medium": 0.0,
                "low": 0.0,
            }
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
                if level in completion_rates and total > 0:
                    completion_rates[level] = round(completed / total * 100, 1)

            # 3. Claude time today (sum of session durations)
            cursor = conn.execute("""
                SELECT SUM(
                    (julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24
                ) as hours
                FROM sessions
                WHERE date(started_at) = date('now', 'localtime')
            """)
            row = cursor.fetchone()
            claude_time_today = round(row[0], 1) if row and row[0] else 0.0

            # 4. Today's priorities breakdown
            priorities_today = {
                "critical": {"total": 0, "completed": 0},
                "medium": {"total": 0, "completed": 0},
                "low": {"total": 0, "completed": 0},
            }
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
                if level in priorities_today:
                    priorities_today[level] = {
                        "total": row[1],
                        "completed": row[2],
                    }

            return drift_days, completion_rates, claude_time_today, priorities_today

    (
        result["drift_days"],
        result["completion_rates"],
        result["claude_time_today"],
        result["priorities_today"],
    ) = await _run_blocking(_load_overview)

    return result


@router.get("/system")
async def system_metrics():
    """System execution metrics and database stats."""
    result = {
        "database": {
            "size_bytes": 0,
            "wal_size_bytes": 0,
            "tables": {},
        },
    }

    def _load_table_counts():
        tables = ["sessions", "contacts", "priorities", "staged_content"]
        counts = {}
        with get_db() as conn:
            for table in tables:
                try:
                    cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
                    counts[table] = cursor.fetchone()[0]
                except Exception:
                    pass  # Table might not exist
        return counts

    result["database"]["tables"] = await _run_blocking(_load_table_counts)

    # Database file sizes
    if DB_PATH.exists():
        result["database"]["size_bytes"] = DB_PATH.stat().st_size

    wal_path = DB_PATH.with_suffix(".db-wal")
    if wal_path.exists():
        result["database"]["wal_size_bytes"] = wal_path.stat().st_size

    return result


# ============================================
# Usage tracking endpoints
# ============================================

@router.get("/usage/current")
async def get_current_usage():
    """
    Get current Claude Code usage statistics.

    Returns:
        {
            "session": {
                "used": 45234,
                "total": 100000,
                "percentage": 45.2,
                "resetAt": "2026-01-11T18:30:00"
            },
            "weekly": {...} | null,
            "model": "Sonnet 4.5" | null,
            "plan": "max" | null,
            "lastUpdated": "2026-01-11T15:45:23",
            "status": "success" | "error"
        }
    """
    def _load_latest_usage():
        storage = SystemStorage(settings.db_path)
        tracker = UsageTracker(storage)
        return tracker.get_latest_usage()

    try:
        latest = await _run_blocking(_load_latest_usage)

        if not latest:
            return {
                'status': 'no_data',
                'message': 'No usage data available yet. Tracker will fetch data soon.'
            }

        if latest['fetch_status'] == 'error':
            return {
                'status': 'error',
                'error': latest['error_message'],
                'lastUpdated': latest['timestamp']
            }

        if latest['fetch_status'] == 'parsing_failed':
            return {
                'status': 'parsing_failed',
                'error': 'Could not parse usage data from Claude Code',
                'lastUpdated': latest['timestamp']
            }

        # Format response
        response = {
            'session': {
                'used': latest['session_tokens_used'],
                'total': latest['session_tokens_total'],
                'percentage': latest['session_percentage'],
                'resetAt': latest['session_reset_at']
            },
            'model': latest['current_model'],
            'plan': latest['plan_tier'],
            'lastUpdated': latest['timestamp'],
            'status': 'success'
        }

        # Add weekly if available
        if latest['weekly_tokens_used'] is not None:
            response['weekly'] = {
                'used': latest['weekly_tokens_used'],
                'total': latest['weekly_tokens_total'],
                'percentage': latest['weekly_percentage'],
                'resetAt': latest['weekly_reset_at']
            }
        else:
            response['weekly'] = None

        return response

    except Exception as e:
        logger.error(f"Error getting current usage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/usage/refresh")
async def refresh_usage():
    """
    Manually trigger a usage data refresh.

    Triggers an immediate fetch. Returns immediately while fetch happens
    in background.
    """
    try:
        if not _tracker:
            raise HTTPException(status_code=503, detail="Usage tracker not initialized")

        asyncio.create_task(_tracker.fetch_and_store_usage())

        return {
            'status': 'refreshing',
            'message': 'Usage data refresh triggered. Check back in a few seconds.'
        }

    except Exception as e:
        logger.error(f"Error triggering refresh: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usage/history")
async def get_usage_history(limit: int = 100):
    """
    Get historical usage data.

    Args:
        limit: Max number of records to return (default 100)

    Returns:
        List of usage records, most recent first
    """
    def _load_usage_history():
        storage = SystemStorage(settings.db_path)
        return storage.fetchall("""
            SELECT
                timestamp,
                session_percentage,
                weekly_percentage,
                current_model,
                fetch_status
            FROM claude_usage
            ORDER BY timestamp DESC
            LIMIT ?
        """, (limit,))

    try:
        results = await _run_blocking(_load_usage_history)

        return {
            'history': [{key: row[key] for key in row.keys()} for row in results]
        }

    except Exception as e:
        logger.error(f"Error getting usage history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
