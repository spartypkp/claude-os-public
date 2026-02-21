"""TODAY.md context sync - injects calendar and priorities.

Simple worker that runs on startup and every 5 minutes.
Replaces the over-engineered watcher/modules/today_context.py.
"""

import asyncio
import logging
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

from core.config import settings

logger = logging.getLogger(__name__)

# Markers in TODAY.md
CALENDAR_START = "<!-- BEGIN CALENDAR -->"
CALENDAR_END = "<!-- END CALENDAR -->"
PRIORITIES_START = "<!-- BEGIN PRIORITIES -->"
PRIORITIES_END = "<!-- END PRIORITIES -->"
EMAIL_INTEL_START = "<!-- BEGIN EMAIL_INTEL -->"
EMAIL_INTEL_END = "<!-- END EMAIL_INTEL -->"


async def start_today_sync(stop_event: asyncio.Event):
    """Run TODAY.md sync on startup and every 5 minutes."""
    logger.info("TODAY sync worker started")

    # Initial sync
    await _sync_today()

    while not stop_event.is_set():
        try:
            # Wait 5 minutes or until stopped
            await asyncio.wait_for(stop_event.wait(), timeout=300)
            break  # stop_event was set
        except asyncio.TimeoutError:
            # Timeout = time to sync again
            await _sync_today()

    logger.info("TODAY sync worker stopped")


async def _sync_today():
    """Inject calendar and priorities into TODAY.md."""
    today_file = settings.repo_root / "Desktop" / "TODAY.md"
    if not today_file.exists():
        return

    try:
        content = today_file.read_text(encoding="utf-8")
        original = content

        # Inject calendar
        calendar_md = _build_calendar()
        content = _inject_section(content, calendar_md, CALENDAR_START, CALENDAR_END)

        # Inject priorities
        priorities_md = _build_priorities()
        content = _inject_section(content, priorities_md, PRIORITIES_START, PRIORITIES_END)

        # Inject email intel
        email_md = _build_email_intel()
        content = _inject_section(content, email_md, EMAIL_INTEL_START, EMAIL_INTEL_END)

        # Only write if changed
        if content != original:
            today_file.write_text(content, encoding="utf-8")
            logger.debug("TODAY.md updated")

    except Exception as e:
        logger.error(f"TODAY sync error: {e}")


def _inject_section(content: str, section: str, start: str, end: str) -> str:
    """Replace content between markers."""
    pattern = re.compile(f"{re.escape(start)}.*?{re.escape(end)}", re.DOTALL)
    if pattern.search(content):
        return pattern.sub(f"{start}\n{section}\n{end}", content)
    return content


def _build_calendar() -> str:
    """Build calendar section from Apple Calendar."""
    try:
        from modules.calendar import get_calendar_service
    except ImportError:
        return "### Today's Schedule\n*Calendar unavailable*"

    try:
        now = datetime.now()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1) - timedelta(seconds=1)

        service = get_calendar_service()
        events = service.get_events(start=start, end=end, limit=20)

        if not events:
            return "### Today's Schedule\n*No events scheduled*"

        lines = ["### Today's Schedule"]
        for event in events:
            if event.start:
                try:
                    time_str = event.start.strftime("%I:%M %p").lstrip("0")

                    if event.end:
                        end_str = event.end.strftime("%I:%M %p").lstrip("0")
                        time_range = f"{time_str} - {end_str}"
                    else:
                        time_range = time_str

                    lines.append(f"- {time_range}: {event.summary or 'Untitled'}")
                except Exception:
                    lines.append(f"- {event.summary or 'Untitled'}")
            elif event.all_day:
                lines.append(f"- All Day: {event.summary or 'Untitled'}")
            else:
                lines.append(f"- {event.summary or 'Untitled'}")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"Calendar build error: {e}")
        return "### Today's Schedule\n*Error loading calendar*"


def _build_priorities() -> str:
    """Build priorities section from SQLite."""
    db_path = settings.repo_root / ".engine" / "data" / "db" / "system.db"
    if not db_path.exists():
        return "### Priorities\n*Database unavailable*"

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row

        today = datetime.now().strftime("%Y-%m-%d")
        cursor = conn.execute("""
            SELECT id, content, level, completed
            FROM priorities
            WHERE date = ?
            ORDER BY level, position
        """, (today,))

        rows = list(cursor.fetchall())
        conn.close()

        if not rows:
            return "### Priorities\n*No priorities yet - use priority_create() to add*"

        # Group by level
        by_level: Dict[str, List[Dict[str, Any]]] = {
            "critical": [], "medium": [], "low": []
        }
        for row in rows:
            by_level[row["level"]].append({
                "id": row["id"],
                "content": row["content"],
                "completed": bool(row["completed"])
            })

        lines = ["### Priorities"]
        for level_key, level_name in [("critical", "Critical"), ("medium", "Medium"), ("low", "Low")]:
            items = by_level.get(level_key, [])
            if items:
                lines.append(f"#### {level_name}")
                for item in items:
                    check = "[x]" if item["completed"] else "[ ]"
                    lines.append(f"- {check} {item['content']} (id: {item['id']})")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"Priorities build error: {e}")
        return "### Priorities\n*Error loading priorities*"


def _build_email_intel() -> str:
    """Build Email Intel section from unhandled classifications in DB."""
    db_path = settings.repo_root / ".engine" / "data" / "db" / "system.db"
    if not db_path.exists():
        return "## Email Intel\n*Database unavailable*"

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row

        rows = conn.execute("""
            SELECT category, summary, display_name, sender, subject,
                   suggested_actions, received_at, classified_at
            FROM email_classifications
            WHERE handled = 0
            ORDER BY
                CASE category
                    WHEN 'action_needed' THEN 1
                    WHEN 'heads_up' THEN 2
                    WHEN 'fyi' THEN 3
                    ELSE 4
                END,
                COALESCE(received_at, classified_at) DESC
        """).fetchall()
        conn.close()

        # Group by category
        by_cat: Dict[str, List[Dict[str, Any]]] = {
            "action_needed": [], "heads_up": [], "fyi": []
        }
        for row in rows:
            cat = row["category"]
            if cat in by_cat:
                name = row["display_name"] or row["sender"] or "Unknown"
                # Clean up sender format — extract name from "Name <email>"
                if "<" in name and not row["display_name"]:
                    name = name.split("<")[0].strip().strip('"')
                by_cat[cat].append({
                    "name": name,
                    "summary": row["summary"] or row["subject"] or "No summary",
                    "actions": row["suggested_actions"].split("\n") if row["suggested_actions"] else [],
                })

        lines = [
            "## Email Intel",
            "*Rendered from DB. Chief processes on wake.*",
            "",
        ]

        # Action Needed
        lines.append("### Action Needed")
        if by_cat["action_needed"]:
            for item in by_cat["action_needed"]:
                lines.append(f"- **{item['name']}** — {item['summary']}")
                for action in item["actions"]:
                    if action.strip():
                        lines.append(f"  - {action.strip()}")
        lines.append("")

        # Heads Up
        lines.append("### Heads Up")
        if by_cat["heads_up"]:
            for item in by_cat["heads_up"]:
                lines.append(f"- **{item['name']}** — {item['summary']}")
                for action in item["actions"]:
                    if action.strip():
                        lines.append(f"  - {action.strip()}")
        lines.append("")

        # FYI — just summaries, no actions
        lines.append("### FYI")
        if by_cat["fyi"]:
            for item in by_cat["fyi"]:
                lines.append(f"- **{item['name']}** — {item['summary']}")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"Email intel build error: {e}")
        return "## Email Intel\n*Error loading email intel*"


__all__ = ["start_today_sync"]
