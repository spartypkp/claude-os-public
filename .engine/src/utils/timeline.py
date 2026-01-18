"""
Timeline Service - Central service for appending to TODAY.md Timeline.

All timeline entries flow through this service. Callers provide description
and source info; this service adds the timestamp.

Format: HH:MM [Attribution] — Description

Attribution types:
- [Role] or [Role/mode] - from Claude sessions
- [System] - from system events (calendar, email)
- [App-Name] - from custom apps (Job-Search, Leetcode)
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
import pytz

# Pacific timezone for timestamps
PACIFIC = pytz.timezone("America/Los_Angeles")

# Repository root - go up from .engine/src/utils/ to repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


def get_today_md_path() -> Path:
    """Get path to TODAY.md."""
    return REPO_ROOT / "Desktop" / "TODAY.md"


def append_to_timeline(description: str, attribution: str) -> Dict[str, Any]:
    """Append entry to Timeline section. Timestamp auto-generated.

    Args:
        description: What happened (1-2 sentences)
        attribution: Source tag like [Chief], [System], [Job-Search]

    Returns:
        Dict with success status
    """
    today_path = get_today_md_path()

    if not today_path.exists():
        return {"success": False, "error": "TODAY.md not found"}

    try:
        # Generate timestamp
        timestamp = datetime.now(PACIFIC).strftime("%H:%M")
        entry = f"{timestamp} {attribution} — {description}"

        # Read file
        text = today_path.read_text()
        lines = text.split('\n')

        # Find ## Timeline section
        timeline_idx = None
        for i, line in enumerate(lines):
            if line.strip() == "## Timeline":
                timeline_idx = i
                break

        if timeline_idx is None:
            return {"success": False, "error": "## Timeline section not found in TODAY.md"}

        # Find insertion point (before next section or end)
        insert_idx = None
        for i in range(timeline_idx + 1, len(lines)):
            # Stop at next ## section or ---
            if lines[i].strip().startswith("## ") or lines[i].strip() == "---":
                insert_idx = i
                break

        if insert_idx is None:
            insert_idx = len(lines)

        # Walk back over blank lines to insert after last content line
        # This keeps entries compact while preserving blank line before delimiter
        actual_insert = insert_idx
        while actual_insert > timeline_idx + 1 and lines[actual_insert - 1].strip() == "":
            actual_insert -= 1

        # Insert the entry
        lines.insert(actual_insert, entry)

        # Write back
        today_path.write_text('\n'.join(lines))

        return {
            "success": True,
            "entry": entry,
            "logged_to": "Timeline"
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def log_session_event(description: str, role: str, mode: Optional[str] = None) -> Dict[str, Any]:
    """Log event from a Claude session.

    Args:
        description: What happened
        role: Session role (Chief, Builder, Deep-Work, etc.)
        mode: Session mode (interactive, background) - optional

    Returns:
        Dict with success status
    """
    # Format: [Role] or [Role/mode]
    if mode and mode != "interactive":
        attribution = f"[{role.title()}/{mode}]"
    else:
        attribution = f"[{role.title()}]"

    return append_to_timeline(description, attribution)


def log_system_event(description: str) -> Dict[str, Any]:
    """Log system-generated event (calendar, email, etc.).

    Args:
        description: What happened

    Returns:
        Dict with success status
    """
    return append_to_timeline(description, "[System]")


def log_app_event(description: str, app_name: str) -> Dict[str, Any]:
    """Log event from a custom app.

    Args:
        description: What happened
        app_name: Name of the app (Job-Search, Leetcode, etc.)

    Returns:
        Dict with success status
    """
    return append_to_timeline(description, f"[{app_name}]")
