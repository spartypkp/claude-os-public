"""Morning brief draft — accumulates overnight content for the 6 AM brief.

The email pipeline calls update_draft() after each classification.
The draft rebuilds from DB on every call (idempotent, handles reclassification).
Chief reads the draft at morning reset and does the editorial pass.
reset_day.py clears it during daily archive.
"""

import logging
import os
import sqlite3
import tempfile
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# Protected location — not on Desktop, safe from cleanup/specialists
DRAFT_PATH = Path(__file__).resolve().parents[3] / "data" / "morning-brief-draft.md"

# Serialize file writes across concurrent pipeline workers
_write_lock = threading.Lock()

# Limits to prevent overnight bloat
MAX_TRIAGE_ITEMS = 15
MAX_DIGEST_ITEMS = 10

EMPTY_TEMPLATE = """\
# Morning Brief Draft
*Auto-populated by email pipeline. Chief does final editorial pass.*
*Last updated: never*

<!-- BEGIN TRIAGE -->
## Email Triage
<!-- END TRIAGE -->

<!-- BEGIN DIGESTS -->
## Newsletter Digests
<!-- END DIGESTS -->

<!-- BEGIN OVERNIGHT -->
## Overnight
<!-- END OVERNIGHT -->
"""


def update_draft(db_path: str) -> None:
    """Rebuild the morning brief draft from current DB state.

    Called by pipeline after each classification. Thread-safe via lock.
    Writes atomically (tmp file + rename) to prevent partial reads.
    """
    with _write_lock:
        try:
            triage_md = _build_triage(db_path)
            digests_md = _build_digests(db_path)
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

            content = f"""\
# Morning Brief Draft
*Auto-populated by email pipeline. Chief does final editorial pass.*
*Last updated: {now}*

<!-- BEGIN TRIAGE -->
{triage_md}
<!-- END TRIAGE -->

<!-- BEGIN DIGESTS -->
{digests_md}
<!-- END DIGESTS -->

<!-- BEGIN OVERNIGHT -->
## Overnight
<!-- END OVERNIGHT -->
"""
            # Atomic write: tmp file in same directory, then rename
            DRAFT_PATH.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_path = tempfile.mkstemp(
                dir=str(DRAFT_PATH.parent), suffix=".md.tmp"
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(content)
                os.rename(tmp_path, str(DRAFT_PATH))
            except Exception:
                # Clean up tmp file on failure
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise

            logger.debug("Morning brief draft updated")

        except Exception as e:
            logger.debug(f"Brief draft update failed (non-critical): {e}")


def clear_draft() -> None:
    """Reset draft to empty template. Called by reset_day.py."""
    with _write_lock:
        DRAFT_PATH.parent.mkdir(parents=True, exist_ok=True)
        DRAFT_PATH.write_text(EMPTY_TEMPLATE, encoding="utf-8")


def _build_triage(db_path: str) -> str:
    """Build triage section from unhandled action_needed/heads_up classifications."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=18)).isoformat()

    rows = conn.execute(
        """SELECT category, summary, display_name, sender, subject,
                  suggested_actions, received_at
           FROM email_classifications
           WHERE handled = 0
             AND category IN ('action_needed', 'heads_up')
             AND COALESCE(classified_at, '') > ?
           ORDER BY
               CASE category
                   WHEN 'action_needed' THEN 1
                   WHEN 'heads_up' THEN 2
               END,
               COALESCE(received_at, classified_at) DESC
           LIMIT ?""",
        (cutoff, MAX_TRIAGE_ITEMS),
    ).fetchall()
    conn.close()

    if not rows:
        return "## Email Triage\n*No unhandled items*"

    by_cat: Dict[str, List[Dict[str, Any]]] = {
        "action_needed": [],
        "heads_up": [],
    }

    for row in rows:
        cat = row["category"]
        name = row["display_name"] or row["sender"] or "Unknown"
        if "<" in name and not row["display_name"]:
            name = name.split("<")[0].strip().strip('"')

        by_cat[cat].append({
            "name": name,
            "summary": row["summary"] or row["subject"] or "No summary",
            "actions": row["suggested_actions"].split("\n") if row["suggested_actions"] else [],
        })

    lines = ["## Email Triage"]

    if by_cat["action_needed"]:
        lines.append("")
        lines.append("### Action Needed")
        for item in by_cat["action_needed"]:
            lines.append(f"- **{item['name']}** — {item['summary']}")
            for action in item["actions"]:
                if action.strip():
                    lines.append(f"  - {action.strip()}")

    if by_cat["heads_up"]:
        lines.append("")
        lines.append("### Heads Up")
        for item in by_cat["heads_up"]:
            lines.append(f"- **{item['name']}** — {item['summary']}")
            for action in item["actions"]:
                if action.strip():
                    lines.append(f"  - {action.strip()}")

    if not by_cat["action_needed"] and not by_cat["heads_up"]:
        lines.append("*No unhandled items*")

    return "\n".join(lines)


def _build_digests(db_path: str) -> str:
    """Build digests section from classifications with extracted_content."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=18)).isoformat()

    rows = conn.execute(
        """SELECT display_name, sender, subject, extracted_content,
                  received_at, classified_at
           FROM email_classifications
           WHERE extracted_content IS NOT NULL
             AND extracted_content != ''
             AND COALESCE(classified_at, '') > ?
           ORDER BY COALESCE(received_at, classified_at) DESC
           LIMIT ?""",
        (cutoff, MAX_DIGEST_ITEMS),
    ).fetchall()
    conn.close()

    if not rows:
        return "## Newsletter Digests\n*No digests available*"

    lines = ["## Newsletter Digests"]

    for row in rows:
        source = row["display_name"] or row["sender"] or "Unknown"
        if "<" in source and not row["display_name"]:
            source = source.split("<")[0].strip().strip('"')

        # Format timestamp
        ts = row["received_at"] or row["classified_at"] or ""
        time_label = ""
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                time_label = f" — {dt.strftime('%b %d, %I:%M %p').lstrip('0')}"
            except (ValueError, AttributeError):
                pass

        lines.append("")
        lines.append(f"### {source}{time_label}")
        lines.append(row["extracted_content"].strip())

    return "\n".join(lines)
