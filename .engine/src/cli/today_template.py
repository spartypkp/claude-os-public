"""
TODAY.md template - Single source of truth.

Used by new_day.py and reset_day.py to create fresh TODAY.md files.
"""

from datetime import datetime


def get_today_template(date: datetime = None) -> str:
    """Generate fresh TODAY.md content.

    Args:
        date: Date for the file (defaults to now)

    Returns:
        Complete TODAY.md content as string
    """
    if date is None:
        date = datetime.now()

    date_str = date.strftime("*%A, %B %d, %Y*")

    return f"""---
type: memory
---

# Today

{date_str}

---

<!-- BEGIN CONTEXT -->
## Context

<!-- BEGIN CALENDAR -->
### Today's Schedule
*Loading...*

<!-- END CALENDAR -->

<!-- BEGIN PRIORITIES -->
### Priorities
*No priorities yet*

<!-- END PRIORITIES -->
<!-- END CONTEXT -->

---

## Timeline
*Chronological history of the day. Append-only.*

---

## Notes
*Passive observations, learnings, patterns noticed. Not actionable.*

---

## Open Loops
*Things that need to be closed/processed. Not memory — action queues.*

### Life Stuff

### Noticed
*Might belong in MEMORY.md, IDENTITY.md, or LIFE-SPECs. Memory consolidation evaluates.*

### UX Friction
*Interaction with Claude is awkward. Not broken, just clunky.*

### System
*Bugs, refactoring, feature ideas, plans for Claude OS.*
"""
