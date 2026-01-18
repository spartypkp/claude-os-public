"""Calendar routes - bridge to Apple Calendar.

These endpoints let the dashboard:
- List calendar events (via direct database read)
- Create events (via AppleScript)
- Move events (via AppleScript)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
import subprocess
import json
import logging

from integrations.apple import get_events, get_calendars, CALENDAR_ALIASES

logger = logging.getLogger("calendar")

router = APIRouter()


@router.get("/calendar/events")
async def list_events(
    from_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    to_date: Optional[str] = Query(None, description="End date (ISO format)"),
    days: int = Query(7, ge=1, le=365, description="Number of days to fetch if no date range"),
    calendar: Optional[str] = Query(None, description="Filter by calendar name"),
    use_preferred: bool = Query(True, description="Only show preferred calendars"),
    limit: int = Query(100, ge=1, le=500),
):
    """List calendar events from Apple Calendar.

    Reads directly from the macOS Calendar database for real-time access.
    """
    try:
        # Parse dates if provided
        start = None
        end = None

        if from_date:
            start = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
        else:
            # Default: start from beginning of today
            now = datetime.now()
            start = datetime(now.year, now.month, now.day)

        if to_date:
            end = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
        else:
            # Default: end at start + days
            end = start + timedelta(days=days)

        events = get_events(
            from_date=start,
            to_date=end,
            limit=limit,
            calendar_filter=calendar,
            use_preferred=use_preferred,
        )

        return {
            "events": events,
            "count": len(events),
            "from_date": start.isoformat(),
            "to_date": end.isoformat(),
        }

    except Exception as e:
        logger.error(f"Failed to fetch calendar events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calendar/calendars")
async def list_calendars():
    """List available calendars."""
    try:
        calendars = get_calendars()
        return {"calendars": calendars, "count": len(calendars)}
    except Exception as e:
        logger.error(f"Failed to fetch calendars: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateEventRequest(BaseModel):
    title: str
    start_date: str  # ISO format
    end_date: str    # ISO format
    location: str | None = None
    notes: str | None = None
    calendar_name: str | None = None


class MoveEventRequest(BaseModel):
    event_id: str
    new_start: str  # ISO format
    new_end: str    # ISO format


def run_applescript(script: str) -> str:
    """Run AppleScript and return output."""
    try:
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            logger.error(f"AppleScript error: {result.stderr}")
            raise Exception(result.stderr)
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        raise Exception("AppleScript timed out")


@router.post("/calendar/create")
async def create_event(req: CreateEventRequest):
    """Create a new calendar event via AppleScript.

    Uses AppleScript to create events in Apple Calendar since the MCP
    tool would require a Claude instance to invoke.
    """
    try:
        # Parse dates
        start_dt = datetime.fromisoformat(req.start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(req.end_date.replace('Z', '+00:00'))

        # Format for AppleScript
        start_str = start_dt.strftime('%B %d, %Y at %I:%M:%S %p')
        end_str = end_dt.strftime('%B %d, %Y at %I:%M:%S %p')

        # Escape title for AppleScript
        title_escaped = req.title.replace('"', '\\"')
        location_escaped = (req.location or '').replace('"', '\\"')
        notes_escaped = (req.notes or '').replace('"', '\\"')

        # Resolve calendar alias (e.g., "Exchange" -> "Calendar") and default
        raw_calendar = req.calendar_name or 'Calendar'
        calendar_name = CALENDAR_ALIASES.get(raw_calendar.lower(), raw_calendar)

        # Build AppleScript
        script = f'''
tell application "Calendar"
    tell calendar "{calendar_name}"
        set newEvent to make new event with properties {{summary:"{title_escaped}", start date:date "{start_str}", end date:date "{end_str}"'''

        if req.location:
            script += f', location:"{location_escaped}"'
        if req.notes:
            script += f', description:"{notes_escaped}"'

        script += '''}}
        return uid of newEvent
    end tell
end tell'''

        event_uid = run_applescript(script)
        logger.info(f"Created event: {req.title} -> {event_uid}")

        return {"success": True, "event_id": event_uid}

    except Exception as e:
        logger.error(f"Failed to create event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calendar/move")
async def move_event(req: MoveEventRequest):
    """Move a calendar event to a new time via AppleScript.

    Since Apple Calendar MCP doesn't have an update operation,
    we use AppleScript to modify the event directly.
    """
    try:
        # Parse dates
        new_start = datetime.fromisoformat(req.new_start.replace('Z', '+00:00'))
        new_end = datetime.fromisoformat(req.new_end.replace('Z', '+00:00'))

        # Format for AppleScript
        start_str = new_start.strftime('%B %d, %Y at %I:%M:%S %p')
        end_str = new_end.strftime('%B %d, %Y at %I:%M:%S %p')

        # AppleScript to find and update the event by UID
        script = f'''
tell application "Calendar"
    set foundEvent to missing value
    repeat with cal in calendars
        try
            set foundEvent to first event of cal whose uid is "{req.event_id}"
            exit repeat
        end try
    end repeat

    if foundEvent is not missing value then
        set start date of foundEvent to date "{start_str}"
        set end date of foundEvent to date "{end_str}"
        return "success"
    else
        return "not_found"
    end if
end tell'''

        result = run_applescript(script)

        if result == "not_found":
            raise HTTPException(status_code=404, detail="Event not found")

        logger.info(f"Moved event {req.event_id} to {start_str}")
        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to move event: {e}")
        raise HTTPException(status_code=500, detail=str(e))
