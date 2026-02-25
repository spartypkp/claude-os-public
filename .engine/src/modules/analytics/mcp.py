"""Analytics MCP tool — operational observability for Claude OS.

Operations:
    - specialists: Pass rates, iteration counts, duration by role
    - tools: Tool call frequency, error rates
    - sessions: Session distribution and work rhythm
    - resets: Reset frequency and context patterns
    - subagents: Task subagent usage breakdown by agent type
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastmcp import FastMCP

from core.config import settings
from core.mcp_helpers import get_db

logger = logging.getLogger(__name__)

mcp = FastMCP("life-analytics")


@mcp.tool()
def analytics(
    operation: str,
    days: int = 30,
    role: Optional[str] = None,
    tool_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Operational analytics for Claude OS.

    Args:
        operation: Operation - 'specialists', 'tools', 'sessions', 'resets', 'files', 'insights', 'subagents'
        days: Number of days to look back (default 30)
        role: Filter by role (for specialists operation)
        tool_name: Filter by tool name (for tools operation)

    Returns:
        Object with operation-specific metrics

    Examples:
        analytics("specialists")
        analytics("specialists", days=7, role="builder")
        analytics("tools", days=7)
        analytics("tools", tool_name="mcp__life__calendar")
        analytics("sessions", days=7)
        analytics("resets", days=30)
        analytics("files", days=7)
        analytics("insights")
        analytics("subagents")
        analytics("subagents", days=7)
    """
    try:
        if operation == "specialists":
            return _specialists(days, role)
        elif operation == "tools":
            return _tools(days, tool_name)
        elif operation == "sessions":
            return _sessions(days)
        elif operation == "resets":
            return _resets(days)
        elif operation == "files":
            return _files(days)
        elif operation == "insights":
            return _insights(days)
        elif operation == "subagents":
            return _subagents(days)
        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use: specialists, tools, sessions, resets, files, insights, subagents"}
    except Exception as e:
        logger.error(f"analytics({operation}) failed: {e}")
        return {"success": False, "error": str(e)}


def _specialists(days: int, role: Optional[str]) -> Dict[str, Any]:
    """Specialist task metrics from the specialist_tasks view."""
    with get_db() as conn:
        # Build query with optional role filter
        where_clause = "WHERE prep_started >= datetime('now', ? || ' days')"
        params = [f"-{days}"]
        if role:
            where_clause += " AND role = ?"
            params.append(role)

        # Summary stats
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
        summary = {
            "total_tasks": total,
            "passed": passed,
            "pass_rate": round(passed / total, 2) if total > 0 else None,
            "avg_iterations": round(row["avg_iterations"], 1) if row["avg_iterations"] else None,
            "avg_duration_min": round(row["avg_duration_min"], 1) if row["avg_duration_min"] else None,
        }

        # By role breakdown
        by_role = {}
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

        # Recent tasks (last 10)
        recent = []
        rows = conn.execute(f"""
            SELECT conversation_id, role, prep_started, task_ended,
                   impl_iterations, passed, total_duration_min
            FROM specialist_tasks
            {where_clause}
            ORDER BY prep_started DESC
            LIMIT 10
        """, params).fetchall()

        for r in rows:
            recent.append({
                "conversation_id": r["conversation_id"],
                "role": r["role"],
                "started": r["prep_started"],
                "ended": r["task_ended"],
                "iterations": r["impl_iterations"],
                "passed": bool(r["passed"]) if r["passed"] is not None else None,
                "duration_min": round(r["total_duration_min"], 1) if r["total_duration_min"] else None,
            })

    return {
        "success": True,
        "days": days,
        "summary": summary,
        "by_role": by_role,
        "recent": recent,
    }


def _tools(days: int, tool_name: Optional[str]) -> Dict[str, Any]:
    """Tool call frequency and error rates from tool_calls table."""
    with get_db() as conn:
        where_clause = "WHERE called_at >= datetime('now', ? || ' days')"
        params = [f"-{days}"]
        if tool_name:
            where_clause += " AND tool_name = ?"
            params.append(tool_name)

        # Top tools by call count
        rows = conn.execute(f"""
            SELECT
                tool_name,
                COUNT(*) as calls,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors,
                AVG(duration_ms) as avg_ms
            FROM tool_calls
            {where_clause}
            GROUP BY tool_name
            ORDER BY calls DESC
            LIMIT 25
        """, params).fetchall()

        top_tools = []
        total_calls = 0
        total_errors = 0
        for r in rows:
            calls = r["calls"]
            errors = r["errors"] or 0
            total_calls += calls
            total_errors += errors
            top_tools.append({
                "tool": r["tool_name"],
                "calls": calls,
                "errors": errors,
                "error_rate": round(errors / calls, 3) if calls > 0 else 0,
                "avg_ms": round(r["avg_ms"], 0) if r["avg_ms"] else None,
            })

        # Recent errors (if any)
        error_rows = conn.execute(f"""
            SELECT tool_name, error_type, called_at
            FROM tool_calls
            {where_clause} AND success = 0
            ORDER BY called_at DESC
            LIMIT 10
        """, params).fetchall()

        recent_errors = [
            {"tool": r["tool_name"], "error": r["error_type"], "at": r["called_at"]}
            for r in error_rows
        ]

    return {
        "success": True,
        "days": days,
        "total_calls": total_calls,
        "total_errors": total_errors,
        "error_rate": round(total_errors / total_calls, 3) if total_calls > 0 else 0,
        "top_tools": top_tools,
        "recent_errors": recent_errors,
    }


def _sessions(days: int) -> Dict[str, Any]:
    """Session distribution and work rhythm."""
    with get_db() as conn:
        # Session count by role
        rows = conn.execute("""
            SELECT
                COALESCE(role, 'unknown') as role,
                COUNT(*) as count,
                AVG(
                    CASE WHEN ended_at IS NOT NULL
                    THEN (julianday(ended_at) - julianday(started_at)) * 24 * 60
                    ELSE NULL END
                ) as avg_duration_min
            FROM sessions
            WHERE started_at >= datetime('now', ? || ' days')
            GROUP BY role
            ORDER BY count DESC
        """, (f"-{days}",)).fetchall()

        by_role = {}
        total_sessions = 0
        for r in rows:
            by_role[r["role"]] = {
                "count": r["count"],
                "avg_duration_min": round(r["avg_duration_min"], 1) if r["avg_duration_min"] else None,
            }
            total_sessions += r["count"]

        # Active sessions right now
        active = conn.execute(
            "SELECT COUNT(*) as c FROM sessions WHERE ended_at IS NULL"
        ).fetchone()["c"]

        # Work rhythm (hour x day heatmap)
        rhythm_rows = conn.execute("""
            SELECT
                CAST(strftime('%w', started_at, 'localtime') AS INTEGER) as day,
                CAST(strftime('%H', started_at, 'localtime') AS INTEGER) as hour,
                COUNT(*) as count
            FROM sessions
            WHERE started_at >= datetime('now', ? || ' days')
            GROUP BY day, hour
            ORDER BY day, hour
        """, (f"-{days}",)).fetchall()

        work_rhythm = [
            {"day": r["day"], "hour": r["hour"], "count": r["count"]}
            for r in rhythm_rows
            if r["count"] > 0
        ]

    return {
        "success": True,
        "days": days,
        "total_sessions": total_sessions,
        "active_now": active,
        "by_role": by_role,
        "work_rhythm": work_rhythm,
    }


def _resets(days: int) -> Dict[str, Any]:
    """Reset frequency and context patterns."""
    with get_db() as conn:
        # Reset count and breakdown by reason
        rows = conn.execute("""
            SELECT
                reason,
                COUNT(*) as count
            FROM handoffs
            WHERE requested_at >= datetime('now', ? || ' days')
            GROUP BY reason
            ORDER BY count DESC
        """, (f"-{days}",)).fetchall()

        by_reason = {}
        total_resets = 0
        for r in rows:
            by_reason[r["reason"]] = r["count"]
            total_resets += r["count"]

        # Resets per day trend
        daily_rows = conn.execute("""
            SELECT
                date(requested_at, 'localtime') as day,
                COUNT(*) as count
            FROM handoffs
            WHERE requested_at >= datetime('now', ? || ' days')
            GROUP BY day
            ORDER BY day DESC
            LIMIT 14
        """, (f"-{days}",)).fetchall()

        daily = [{"date": r["day"], "resets": r["count"]} for r in daily_rows]

        # Approximate context % at reset (closest usage record)
        avg_context_row = conn.execute("""
            SELECT AVG(cu.session_percentage) as avg_pct
            FROM handoffs h
            JOIN claude_usage cu ON
                ABS(julianday(cu.timestamp) - julianday(h.requested_at)) < 0.01
            WHERE h.requested_at >= datetime('now', ? || ' days')
              AND cu.session_percentage IS NOT NULL
        """, (f"-{days}",)).fetchone()

        avg_context_at_reset = round(avg_context_row["avg_pct"], 1) if avg_context_row and avg_context_row["avg_pct"] else None

    return {
        "success": True,
        "days": days,
        "total_resets": total_resets,
        "by_reason": by_reason,
        "avg_context_at_reset_pct": avg_context_at_reset,
        "daily": daily,
    }


def _files(days: int) -> Dict[str, Any]:
    """File access analytics from tool_calls detail column."""
    from collections import defaultdict

    with get_db() as conn:
        date_filter = f"-{days}"

        # Top read files
        top_read = conn.execute("""
            SELECT detail as file_path, COUNT(*) as count
            FROM tool_calls
            WHERE tool_name = 'Read' AND detail IS NOT NULL
              AND called_at >= datetime('now', ? || ' days')
            GROUP BY detail ORDER BY count DESC LIMIT 20
        """, (date_filter,)).fetchall()

        # Top written/edited
        top_written = conn.execute("""
            SELECT detail as file_path, COUNT(*) as count
            FROM tool_calls
            WHERE tool_name IN ('Write', 'Edit') AND detail IS NOT NULL
              AND called_at >= datetime('now', ? || ' days')
            GROUP BY detail ORDER BY count DESC LIMIT 20
        """, (date_filter,)).fetchall()

    return {
        "success": True,
        "days": days,
        "top_read": [{"file": r["file_path"], "count": r["count"]} for r in top_read],
        "top_written": [{"file": r["file_path"], "count": r["count"]} for r in top_written],
    }


def _subagents(days: int) -> Dict[str, Any]:
    """Subagent (Task tool) usage breakdown by agent type."""
    with get_db() as conn:
        date_filter = f"-{days}"

        rows = conn.execute("""
            SELECT
                detail as agent_type,
                COUNT(*) as calls,
                COUNT(DISTINCT session_id) as sessions,
                MIN(called_at) as first_seen,
                MAX(called_at) as last_seen
            FROM tool_calls
            WHERE tool_name = 'Task'
              AND detail IS NOT NULL
              AND called_at >= datetime('now', ? || ' days')
            GROUP BY detail
            ORDER BY calls DESC
        """, (date_filter,)).fetchall()

        total_calls = sum(r["calls"] for r in rows)

        # Built-in agents (not from .claude/agents/)
        builtin = {"Explore", "Bash", "Plan", "general-purpose", "claude-code-guide", "statusline-setup"}

        agents = []
        for r in rows:
            agents.append({
                "agent": r["agent_type"],
                "calls": r["calls"],
                "sessions": r["sessions"],
                "pct": round(r["calls"] / total_calls * 100, 1) if total_calls > 0 else 0,
                "first_seen": r["first_seen"],
                "last_seen": r["last_seen"],
                "kind": "built-in" if r["agent_type"] in builtin else "custom",
            })

    return {
        "success": True,
        "days": days,
        "total_calls": total_calls,
        "agent_count": len(agents),
        "agents": agents,
    }


def _insights(days: int) -> Dict[str, Any]:
    """Auto-generated observations from analytics data."""
    insights = []
    with get_db() as conn:
        date_filter = f"-{days}"

        # Most-spawned role
        try:
            role_row = conn.execute("""
                SELECT role, COUNT(*) as count
                FROM specialist_tasks
                WHERE prep_started >= datetime('now', ? || ' days')
                GROUP BY role ORDER BY count DESC LIMIT 1
            """, (date_filter,)).fetchone()
            if role_row:
                insights.append(f"{role_row['role'].title()} is the most-spawned role ({role_row['count']} tasks)")
        except Exception:
            pass

        # Total tool calls
        try:
            total = conn.execute("""
                SELECT COUNT(*) as c FROM tool_calls
                WHERE called_at >= datetime('now', ? || ' days')
            """, (date_filter,)).fetchone()
            if total:
                insights.append(f"{total['c']:,} total tool calls in the last {days} days")
        except Exception:
            pass

        # Most-read file
        try:
            read_row = conn.execute("""
                SELECT detail as file, COUNT(*) as count
                FROM tool_calls
                WHERE tool_name = 'Read' AND detail IS NOT NULL
                  AND called_at >= datetime('now', ? || ' days')
                GROUP BY detail ORDER BY count DESC LIMIT 1
            """, (date_filter,)).fetchone()
            if read_row:
                parts = read_row["file"].split('/')
                short = '/'.join(parts[-2:]) if len(parts) >= 2 else read_row["file"]
                insights.append(f"{short} is the most-read file ({read_row['count']} reads)")
        except Exception:
            pass

    return {"success": True, "days": days, "insights": insights}
