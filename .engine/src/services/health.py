"""Aggregate watcher health warnings."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class WatcherHealthService:
    """Health checks for watcher system.

    Note: Calendar validation removed - calendar data now comes from
    Apple Calendar via pyapple-mcp, not from calendar.md.
    """

    def __init__(self):
        pass

    def collect(
        self,
        *,
        contact_warnings: Optional[List[str]] = None,
        config: Optional[Dict[str, Any]] = None,
        desktop_path: Optional[Path] = None,
    ) -> List[str]:
        """Collect all health warnings."""
        errors: List[str] = []
        errors.extend(self._summarize_contact_warnings(contact_warnings))
        if desktop_path:
            errors.extend(self._validate_day_turnover_state(desktop_path))
        return errors

    def format_section(self, errors: List[str]) -> str:
        lines = ["### Watcher Health 🔒", ""]
        if not errors:
            lines.append("*No issues detected.*")
        else:
            for error in errors:
                lines.append(f"- ⚠️ {error}")
        return "\n".join(lines)

    def _summarize_contact_warnings(self, warnings: Optional[List[str]]) -> List[str]:
        if not warnings:
            return []
        missing_description: List[str] = []
        missing_tags: List[str] = []
        other: List[str] = []
        for warning in warnings:
            lower = warning.lower()
            if "missing description" in lower:
                missing_description.append(warning.split()[0])
            elif "missing tags" in lower:
                missing_tags.append(warning.split()[0])
            else:
                other.append(warning)
        messages: List[str] = []
        if missing_description:
            sample = ", ".join(missing_description[:3])
            remaining = len(missing_description) - len(missing_description[:3])
            line = f"Contacts missing description: {sample}"
            if remaining > 0:
                line += f" (+{remaining} more)"
            messages.append(line)
        if missing_tags:
            sample = ", ".join(missing_tags[:3])
            remaining = len(missing_tags) - len(missing_tags[:3])
            line = f"Contacts missing tags: {sample}"
            if remaining > 0:
                line += f" (+{remaining} more)"
            messages.append(line)
        messages.extend(other)
        return messages

    def _validate_day_turnover_state(self, desktop_path: Path) -> List[str]:
        """Check for anomalous day turnover file states."""
        errors: List[str] = []

        today_file = desktop_path / "TODAY.md"
        yesterday_file = desktop_path / "yesterday.md"

        today_exists = today_file.exists()
        yesterday_exists = yesterday_file.exists()

        # Critical: Both files exist (invalid state)
        if today_exists and yesterday_exists:
            errors.append("Invalid state: both TODAY.md and yesterday.md exist - run new_day.py to resolve")
            return errors  # Don't check other conditions if this critical error exists

        # Missing TODAY.md (outside turnover window)
        now = datetime.now()
        if not today_exists and not yesterday_exists:
            # Allow 3:00-3:05 AM window where this is normal
            if not (now.hour == 3 and now.minute < 5):
                errors.append("TODAY.md missing - run new_day.py to initialize")

        # Stuck yesterday.md (hasn't been archived in >12 hours)
        if yesterday_exists:
            try:
                mtime = yesterday_file.stat().st_mtime
                age_hours = (datetime.now().timestamp() - mtime) / 3600
                if age_hours > 12:
                    errors.append(f"yesterday.md not archived ({int(age_hours)} hours old) - morning check-in may not have run")
            except Exception:
                pass  # Ignore stat errors

        return errors
