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
DB_PATH = settings.db_path

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
# Specialist analytics endpoint
# ============================================

@router.get("/specialists")
async def specialists_analytics(days: int = 30, role: Optional[str] = None):
    """Specialist task metrics from the specialist_tasks view.

    Returns pass rates, iteration counts, and durations by role.
    """
    def _load_specialists():
        with get_db() as conn:
            where_clause = "WHERE prep_started >= datetime('now', ? || ' days')"
            params = [f"-{days}"]
            if role:
                where_clause += " AND role = ?"
                params.append(role)

            # Summary
            row = conn.execute(f"""
                SELECT
                    COUNT(*) as total_tasks,
                    SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed_count,
                    AVG(impl_iterations) as avg_iterations,
                    AVG(total_duration_min) as avg_duration_min
                FROM specialist_tasks
                {where_clause}
            """, params).fetchone()

            total = row["total_tasks"] or 0
            passed = row["passed_count"] or 0

            # By role
            rows = conn.execute(f"""
                SELECT
                    role,
                    COUNT(*) as tasks,
                    SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed_count,
                    AVG(impl_iterations) as avg_impl_iterations,
                    AVG(total_duration_min) as avg_duration_min
                FROM specialist_tasks
                {where_clause}
                GROUP BY role
                ORDER BY tasks DESC
            """, params).fetchall()

            by_role = {}
            for r in rows:
                role_tasks = r["tasks"]
                role_passed = r["passed_count"] or 0
                by_role[r["role"]] = {
                    "tasks": role_tasks,
                    "passed": role_passed,
                    "pass_rate": round(role_passed / role_tasks, 2) if role_tasks > 0 else None,
                    "avg_impl_iterations": round(r["avg_impl_iterations"], 1) if r["avg_impl_iterations"] else None,
                    "avg_duration_min": round(r["avg_duration_min"], 1) if r["avg_duration_min"] else None,
                }

            return {
                "summary": {
                    "total_tasks": total,
                    "passed": passed,
                    "pass_rate": round(passed / total, 2) if total > 0 else None,
                    "avg_iterations": round(row["avg_iterations"], 1) if row["avg_iterations"] else None,
                    "avg_duration_min": round(row["avg_duration_min"], 1) if row["avg_duration_min"] else None,
                },
                "by_role": by_role,
                "days": days,
            }

    try:
        return await _run_blocking(_load_specialists)
    except Exception as e:
        logger.error(f"Error getting specialist analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# File analytics endpoints (Observatory V2)
# ============================================

@router.get("/files")
async def file_analytics(days: int = 30, limit: int = 30):
    """File access analytics from tool_calls detail column.

    Returns:
    - top_read: Most-read files (bar chart data)
    - top_written: Most-written/edited files
    - rw_ratio: Read:Write ratio by directory
    - by_role: File access patterns by session role
    """
    def _load_files():
        with get_db() as conn:
            date_filter = f"-{days}"

            # Top read files
            top_read = conn.execute("""
                SELECT detail as file_path, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name = 'Read'
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY detail
                ORDER BY count DESC
                LIMIT ?
            """, (date_filter, limit)).fetchall()

            # Top written/edited files
            top_written = conn.execute("""
                SELECT detail as file_path, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name IN ('Write', 'Edit')
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY detail
                ORDER BY count DESC
                LIMIT ?
            """, (date_filter, limit)).fetchall()

            # R:W ratio by directory (top-level segments)
            rw_rows = conn.execute("""
                SELECT
                    tool_name,
                    detail as file_path
                FROM tool_calls
                WHERE tool_name IN ('Read', 'Write', 'Edit')
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
            """, (date_filter,)).fetchall()

            dir_reads = defaultdict(int)
            dir_writes = defaultdict(int)
            for row in rw_rows:
                path = row["file_path"]
                # Extract directory: keep first 2 meaningful segments after repo root
                parts = path.split('/')
                # Find meaningful directory (skip base repo path segments)
                meaningful = [p for p in parts if p and p not in ('Users', 'claude-os')]
                dir_key = '/'.join(meaningful[:2]) if len(meaningful) >= 2 else (meaningful[0] if meaningful else 'root')
                if row["tool_name"] == 'Read':
                    dir_reads[dir_key] += 1
                else:
                    dir_writes[dir_key] += 1

            all_dirs = set(dir_reads.keys()) | set(dir_writes.keys())
            rw_ratio = []
            for d in sorted(all_dirs, key=lambda x: dir_reads.get(x, 0) + dir_writes.get(x, 0), reverse=True)[:15]:
                reads = dir_reads.get(d, 0)
                writes = dir_writes.get(d, 0)
                rw_ratio.append({
                    "directory": d,
                    "reads": reads,
                    "writes": writes,
                    "ratio": round(reads / writes, 1) if writes > 0 else None,
                })

            # File access by role
            role_rows = conn.execute("""
                SELECT
                    s.role,
                    tc.tool_name,
                    COUNT(*) as count
                FROM tool_calls tc
                JOIN sessions s ON tc.session_id = s.session_id
                WHERE tc.tool_name IN ('Read', 'Write', 'Edit')
                  AND tc.detail IS NOT NULL
                  AND tc.called_at >= datetime('now', ? || ' days')
                GROUP BY s.role, tc.tool_name
                ORDER BY count DESC
            """, (date_filter,)).fetchall()

            by_role = defaultdict(lambda: {"reads": 0, "writes": 0})
            for row in role_rows:
                role = row["role"] or "unknown"
                if row["tool_name"] == 'Read':
                    by_role[role]["reads"] += row["count"]
                else:
                    by_role[role]["writes"] += row["count"]

            return (
                [{"file": r["file_path"], "count": r["count"]} for r in top_read],
                [{"file": r["file_path"], "count": r["count"]} for r in top_written],
                rw_ratio,
                dict(by_role),
            )

    top_read, top_written, rw_ratio, by_role = await _run_blocking(_load_files)

    return {
        "top_read": top_read,
        "top_written": top_written,
        "rw_ratio": rw_ratio,
        "by_role": by_role,
        "days": days,
    }


@router.get("/tool-details")
async def tool_details_analytics(days: int = 30):
    """Tool usage detail analytics from detail column.

    Returns:
    - mcp_operations: Operation frequency per MCP tool
    - search_patterns: Most common Grep/Glob patterns
    - bash_categories: Bash command categorization
    - subagent_types: Task subagent type distribution
    """
    def _load_tool_details():
        with get_db() as conn:
            date_filter = f"-{days}"

            # MCP operation frequency
            mcp_rows = conn.execute("""
                SELECT
                    tool_name,
                    detail as operation,
                    COUNT(*) as count
                FROM tool_calls
                WHERE tool_name LIKE 'mcp__life__%'
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY tool_name, detail
                ORDER BY count DESC
            """, (date_filter,)).fetchall()

            mcp_ops = defaultdict(list)
            for row in mcp_rows:
                # Strip the mcp__life__ prefix for display
                short_name = row["tool_name"].replace("mcp__life__", "")
                mcp_ops[short_name].append({
                    "operation": row["operation"],
                    "count": row["count"],
                })

            # Search patterns (Grep + Glob)
            search_rows = conn.execute("""
                SELECT
                    tool_name,
                    detail as pattern,
                    COUNT(*) as count
                FROM tool_calls
                WHERE tool_name IN ('Grep', 'Glob')
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY tool_name, detail
                ORDER BY count DESC
                LIMIT 30
            """, (date_filter,)).fetchall()

            search_patterns = [
                {"tool": r["tool_name"], "pattern": r["pattern"], "count": r["count"]}
                for r in search_rows
            ]

            # Bash command categories
            bash_rows = conn.execute("""
                SELECT detail as command
                FROM tool_calls
                WHERE tool_name = 'Bash'
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
            """, (date_filter,)).fetchall()

            categories = defaultdict(int)
            for row in bash_rows:
                cmd = row["command"].strip()
                if cmd.startswith(('git ', 'gh ')):
                    categories["git/github"] += 1
                elif cmd.startswith(('npm ', 'npx ', 'node ', 'bun ')):
                    categories["node/npm"] += 1
                elif cmd.startswith(('python', 'pip ', 'pytest ')):
                    categories["python"] += 1
                elif cmd.startswith(('curl ', 'wget ')):
                    categories["http"] += 1
                elif cmd.startswith(('ls', 'cat ', 'find ', 'grep ', 'rg ')):
                    categories["filesystem"] += 1
                elif cmd.startswith(('sqlite3',)):
                    categories["database"] += 1
                elif cmd.startswith(('tmux ',)):
                    categories["tmux"] += 1
                elif cmd.startswith(('./', 'bash ', 'sh ')):
                    categories["scripts"] += 1
                else:
                    categories["other"] += 1

            bash_cats = [
                {"category": k, "count": v}
                for k, v in sorted(categories.items(), key=lambda x: x[1], reverse=True)
            ]

            # Subagent type distribution
            subagent_rows = conn.execute("""
                SELECT detail as subagent_type, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name = 'Task'
                  AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY detail
                ORDER BY count DESC
            """, (date_filter,)).fetchall()

            subagent_types = [
                {"type": r["subagent_type"], "count": r["count"]}
                for r in subagent_rows
            ]

            return dict(mcp_ops), search_patterns, bash_cats, subagent_types

    mcp_operations, search_patterns, bash_categories, subagent_types = await _run_blocking(_load_tool_details)

    return {
        "mcp_operations": mcp_operations,
        "search_patterns": search_patterns,
        "bash_categories": bash_categories,
        "subagent_types": subagent_types,
        "days": days,
    }


@router.get("/insights")
async def analytics_insights(days: int = 30):
    """Auto-generated observations from analytics data.

    Produces data-backed statements like:
    - "Builder is your most-spawned role at 73%"
    - "CLAUDE.md is read 4x more than any other file"
    - "Specialists pass 87% on first try"
    """
    def _load_insights():
        insights = []
        with get_db() as conn:
            date_filter = f"-{days}"

            # 1. Most-spawned role
            role_row = conn.execute("""
                SELECT role, COUNT(*) as count,
                       ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM specialist_tasks
                           WHERE prep_started >= datetime('now', ? || ' days')), 0) as pct
                FROM specialist_tasks
                WHERE prep_started >= datetime('now', ? || ' days')
                GROUP BY role ORDER BY count DESC LIMIT 1
            """, (date_filter, date_filter)).fetchone()
            if role_row and role_row["count"] > 0:
                insights.append({
                    "category": "specialists",
                    "icon": "users",
                    "text": f"{role_row['role'].title()} is the most-spawned role at {int(role_row['pct'])}%",
                    "value": role_row["count"],
                })

            # 2. Specialist pass rate
            pass_row = conn.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed
                FROM specialist_tasks
                WHERE prep_started >= datetime('now', ? || ' days')
                  AND passed IS NOT NULL
            """, (date_filter,)).fetchone()
            if pass_row and pass_row["total"] > 0:
                rate = round(pass_row["passed"] / pass_row["total"] * 100)
                insights.append({
                    "category": "specialists",
                    "icon": "check",
                    "text": f"Specialists pass {rate}% of the time ({pass_row['passed']}/{pass_row['total']} tasks)",
                    "value": rate,
                })

            # 3. Most-read file
            read_row = conn.execute("""
                SELECT detail as file, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name = 'Read' AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY detail ORDER BY count DESC LIMIT 1
            """, (date_filter,)).fetchone()
            if read_row:
                # Get second most-read for comparison
                second_row = conn.execute("""
                    SELECT COUNT(*) as count
                    FROM tool_calls
                    WHERE tool_name = 'Read' AND detail IS NOT NULL
                      AND detail != ?
                      AND called_at >= datetime('now', ? || ' days')
                    GROUP BY detail ORDER BY count DESC LIMIT 1
                """, (read_row["file"], date_filter)).fetchone()
                multiplier = ""
                if second_row and second_row["count"] > 0:
                    mult = round(read_row["count"] / second_row["count"], 1)
                    if mult >= 1.5:
                        multiplier = f" ({mult}x more than the next file)"
                # Truncate path to last 2 segments
                parts = read_row["file"].split('/')
                short = '/'.join(parts[-2:]) if len(parts) >= 2 else read_row["file"]
                insights.append({
                    "category": "files",
                    "icon": "file",
                    "text": f"{short} is the most-read file with {read_row['count']} reads{multiplier}",
                    "value": read_row["count"],
                })

            # 4. Most-used MCP tool
            mcp_row = conn.execute("""
                SELECT tool_name, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name LIKE 'mcp__life__%'
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY tool_name ORDER BY count DESC LIMIT 1
            """, (date_filter,)).fetchone()
            if mcp_row:
                short_name = mcp_row["tool_name"].replace("mcp__life__", "")
                insights.append({
                    "category": "tools",
                    "icon": "tool",
                    "text": f"{short_name}() is the most-used MCP tool with {mcp_row['count']} calls",
                    "value": mcp_row["count"],
                })

            # 5. Total tool calls
            total_row = conn.execute("""
                SELECT COUNT(*) as count
                FROM tool_calls
                WHERE called_at >= datetime('now', ? || ' days')
            """, (date_filter,)).fetchone()
            if total_row:
                insights.append({
                    "category": "system",
                    "icon": "activity",
                    "text": f"{total_row['count']:,} total tool calls in the last {days} days",
                    "value": total_row["count"],
                })

            # 6. Sessions today
            today_row = conn.execute("""
                SELECT COUNT(*) as count
                FROM sessions
                WHERE date(started_at, 'localtime') = date('now', 'localtime')
            """).fetchone()
            if today_row:
                insights.append({
                    "category": "system",
                    "icon": "zap",
                    "text": f"{today_row['count']} sessions today",
                    "value": today_row["count"],
                })

            # 7. Most common search pattern
            grep_row = conn.execute("""
                SELECT detail as pattern, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name = 'Grep' AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY detail ORDER BY count DESC LIMIT 1
            """, (date_filter,)).fetchone()
            if grep_row and grep_row["count"] >= 3:
                insights.append({
                    "category": "tools",
                    "icon": "search",
                    "text": f'Most searched pattern: "{grep_row["pattern"]}" ({grep_row["count"]} times)',
                    "value": grep_row["count"],
                })

            # 8. Avg specialist duration
            dur_row = conn.execute("""
                SELECT AVG(total_duration_min) as avg_min
                FROM specialist_tasks
                WHERE prep_started >= datetime('now', ? || ' days')
                  AND total_duration_min IS NOT NULL
            """, (date_filter,)).fetchone()
            if dur_row and dur_row["avg_min"]:
                mins = round(dur_row["avg_min"], 1)
                insights.append({
                    "category": "specialists",
                    "icon": "clock",
                    "text": f"Average specialist task takes {mins} minutes",
                    "value": mins,
                })

        return insights

    insights = await _run_blocking(_load_insights)
    return {"insights": insights, "days": days}


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
