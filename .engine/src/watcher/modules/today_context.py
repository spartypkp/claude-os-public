"""Today context module - injects calendar and priorities into today.md.

This module periodically updates the auto-injected sections of today.md:
- Calendar: Today's schedule from Apple Calendar
- Priorities: Today's priorities from SQLite

Both are read-only snapshots for Claude's context - edits go through
MCP tools (Apple Calendar, priority_* tools), not markdown.
"""

from __future__ import annotations

import logging
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .. import constants
from ..context import WatcherContext
from ..events import WatchedEvent
from ..module import WatcherModule
from ..scheduler import PeriodicCallback

logger = logging.getLogger(__name__)


class TodayContextModule(WatcherModule):
    """Periodically injects calendar and priorities into today.md."""

    name = "today_context"
    patterns = []  # No file patterns - runs on timer

    def __init__(self):
        self.ctx: WatcherContext | None = None
        self._periodic: PeriodicCallback | None = None
        self._db_path: Path | None = None

    def initialize(self, ctx: WatcherContext) -> None:
        self.ctx = ctx
        self._db_path = ctx.repo_root / ".engine" / "data" / "db" / "system.db"

    def initial_sync(self, ctx: WatcherContext) -> None:
        """Do initial injection on startup."""
        self._refresh_today_context()

        # Set up periodic refresh (every 5 minutes)
        self._periodic = PeriodicCallback(
            interval_sec=300,  # 5 minutes
            callback=self._refresh_today_context
        )
        self._periodic.start(immediate=False)
        logger.info("TodayContextModule: Started periodic refresh (every 5 min)")

    def handle(self, event: WatchedEvent, ctx: WatcherContext) -> None:
        # We don't watch any files, but if we did we'd refresh here
        pass

    def shutdown(self, ctx: WatcherContext) -> None:
        if self._periodic:
            self._periodic.stop()
            logger.info("TodayContextModule: Stopped periodic refresh")

    def _refresh_today_context(self) -> None:
        """Refresh both calendar and priorities in today.md."""
        if not self.ctx:
            return

        today_file = self.ctx.repo_root / "Desktop" / "TODAY.md"
        if not today_file.exists():
            return

        try:
            content = today_file.read_text(encoding="utf-8")
            original_content = content

            # Inject calendar
            calendar_section = self._build_calendar_section()
            content = self._inject_section(
                content,
                calendar_section,
                constants.CALENDAR_MARKER_START,
                constants.CALENDAR_MARKER_END
            )

            # Inject priorities
            priorities_section = self._build_priorities_section()
            content = self._inject_section(
                content,
                priorities_section,
                constants.PRIORITIES_MARKER_START,
                constants.PRIORITIES_MARKER_END
            )

            # Only write if changed
            if content != original_content:
                today_file.write_text(content, encoding="utf-8")
                logger.debug("TodayContextModule: Updated today.md")

        except Exception as e:
            logger.error(f"TodayContextModule: Error refreshing today.md: {e}")

    def _inject_section(
        self,
        content: str,
        section: str,
        start_marker: str,
        end_marker: str
    ) -> str:
        """Replace content between markers with new section."""
        pattern = re.compile(
            f"{re.escape(start_marker)}.*?{re.escape(end_marker)}",
            re.DOTALL,
        )
        if pattern.search(content):
            return pattern.sub(
                f"{start_marker}\n{section}\n{end_marker}",
                content,
            )
        return content

    def _build_calendar_section(self) -> str:
        """Build calendar section from Apple Calendar."""
        try:
            from integrations.apple import get_events
        except ImportError:
            return "### Today's Schedule\n*Calendar unavailable*\n"

        try:
            # Get today's events
            now = datetime.now()
            start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1) - timedelta(seconds=1)

            events = get_events(
                from_date=start_of_day,
                to_date=end_of_day,
                limit=20
            )

            if not events:
                return "### Today's Schedule\n*No events scheduled*\n"

            lines = ["### Today's Schedule"]
            for event in events:
                start_ts = event.get("start_ts")
                if start_ts:
                    try:
                        start_dt = datetime.fromisoformat(start_ts)
                        time_str = start_dt.strftime("%I:%M %p").lstrip("0")

                        end_ts = event.get("end_ts")
                        if end_ts:
                            end_dt = datetime.fromisoformat(end_ts)
                            end_str = end_dt.strftime("%I:%M %p").lstrip("0")
                            time_range = f"{time_str} - {end_str}"
                        else:
                            time_range = time_str

                        lines.append(f"- {time_range}: {event.get('summary', 'Untitled')}")
                    except Exception:
                        lines.append(f"- {event.get('summary', 'Untitled')}")
                else:
                    # All-day event
                    lines.append(f"- All Day: {event.get('summary', 'Untitled')}")

            return "\n".join(lines) + "\n"

        except Exception as e:
            logger.error(f"Error building calendar section: {e}")
            return "### Today's Schedule\n*Error loading calendar*\n"

    def _build_priorities_section(self) -> str:
        """Build priorities section from SQLite."""
        if not self._db_path or not self._db_path.exists():
            return "### Priorities\n*Database unavailable*\n"

        try:
            conn = sqlite3.connect(str(self._db_path))
            conn.row_factory = sqlite3.Row

            today_date = datetime.now().strftime("%Y-%m-%d")
            cursor = conn.execute("""
                SELECT id, content, level, completed
                FROM priorities
                WHERE date = ?
                ORDER BY level, position
            """, (today_date,))

            rows = list(cursor.fetchall())
            conn.close()

            if not rows:
                return "### Priorities\n*No priorities yet - use priority_create() to add*\n"

            # Group by level
            priorities: Dict[str, List[Dict[str, Any]]] = {
                "critical": [],
                "medium": [],
                "low": []
            }
            for row in rows:
                priorities[row["level"]].append({
                    "id": row["id"],
                    "content": row["content"],
                    "completed": bool(row["completed"])
                })

            lines = ["### Priorities"]

            level_names = [
                ("critical", "Critical"),
                ("medium", "Medium"),
                ("low", "Low")
            ]

            for level_key, level_display in level_names:
                items = priorities.get(level_key, [])
                if items:
                    lines.append(f"#### {level_display}")
                    for item in items:
                        checkbox = "[x]" if item["completed"] else "[ ]"
                        lines.append(f"- {checkbox} {item['content']} (id: {item['id']})")

            if not any(priorities.values()):
                lines.append("*No priorities yet*")

            return "\n".join(lines) + "\n"

        except Exception as e:
            logger.error(f"Error building priorities section: {e}")
            return "### Priorities\n*Error loading priorities*\n"
