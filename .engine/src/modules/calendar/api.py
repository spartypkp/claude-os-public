"""Calendar API - REST endpoints for Dashboard.

Bridges to Apple Calendar via CalendarService.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.database import get_db
from modules.calendar import get_calendar_service
from modules.calendar.models import EventCreate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["calendar"])


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB or filesystem operations in a thread."""
    import asyncio
    return await asyncio.to_thread(fn, *args, **kwargs)


def _get_events_as_dicts(from_date=None, to_date=None, limit=50, calendar_filter=None):
    """Get events from service and convert to legacy dict format."""
    service = get_calendar_service()
    events = service.get_events(
        start=from_date,
        end=to_date,
        calendar_id=calendar_filter,
        limit=limit,
    )
    return [
        {
            "summary": event.summary,
            "start_ts": event.start.isoformat() if event.start else None,
            "end_ts": event.end.isoformat() if event.end else None,
            "location": event.location,
            "all_day": event.all_day,
            "calendar_name": event.calendar_name,
            "kind": "calendar",
            "id": event.id,
            "organizer_email": event.organizer_email,
            "organizer_name": event.organizer_name,
        }
        for event in events
    ]


def _get_calendars_as_dicts():
    """Get calendars from service and convert to legacy dict format."""
    service = get_calendar_service()
    calendars = service.get_calendars()
    return [
        {
            "id": cal.id,
            "name": cal.name,
            "title": cal.name,
            "UUID": cal.id,
        }
        for cal in calendars
    ]


@router.get("/events")
async def list_events(
    from_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    to_date: Optional[str] = Query(None, description="End date (ISO format)"),
    days: int = Query(7, ge=1, le=365, description="Number of days to fetch if no date range"),
    calendar: Optional[str] = Query(None, description="Filter by calendar name"),
    use_preferred: bool = Query(True, description="Only show preferred calendars"),
    limit: int = Query(100, ge=1, le=500),
):
    """List calendar events from Apple Calendar."""
    try:
        start = None
        end = None

        if from_date:
            start = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
        else:
            now = datetime.now()
            start = datetime(now.year, now.month, now.day)

        if to_date:
            end = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
        else:
            end = start + timedelta(days=days)

        events = await _run_blocking(
            _get_events_as_dicts,
            from_date=start,
            to_date=end,
            limit=limit,
            calendar_filter=calendar,
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


@router.get("/calendars")
async def list_calendars():
    """List available calendars."""
    try:
        calendars = await _run_blocking(_get_calendars_as_dicts)
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
    import subprocess
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


@router.post("/create")
async def create_event(req: CreateEventRequest):
    """Create a new calendar event via CalendarService."""
    try:
        start_dt = datetime.fromisoformat(req.start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(req.end_date.replace('Z', '+00:00'))

        service = get_calendar_service()
        aliases = service.get_aliases()
        raw_calendar = req.calendar_name or 'Calendar'
        calendar_name = aliases.get(raw_calendar.lower(), raw_calendar)

        event_create = EventCreate(
            summary=req.title,
            start=start_dt,
            end=end_dt,
            location=req.location,
            description=req.notes,
            calendar_id=calendar_name,
        )

        created = await _run_blocking(service.create_event, event_create)
        if not created:
            raise Exception("Failed to create event")

        logger.info(f"Created event: {req.title} -> {created.id}")
        return {"success": True, "event_id": created.id}

    except Exception as e:
        logger.error(f"Failed to create event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/move")
async def move_event(req: MoveEventRequest):
    """Move a calendar event to a new time via AppleScript."""
    try:
        new_start = datetime.fromisoformat(req.new_start.replace('Z', '+00:00'))
        new_end = datetime.fromisoformat(req.new_end.replace('Z', '+00:00'))

        start_str = new_start.strftime('%B %d, %Y at %I:%M:%S %p')
        end_str = new_end.strftime('%B %d, %Y at %I:%M:%S %p')

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

        result = await _run_blocking(run_applescript, script)

        if result == "not_found":
            raise HTTPException(status_code=404, detail="Event not found")

        logger.info(f"Moved event {req.event_id} to {start_str}")
        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to move event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CALENDAR PREFERENCES
# =============================================================================

DEFAULT_CALENDAR_SETTINGS = {
    "default_calendar": "Willdiamond3",
    "default_meeting_calendar": "Willdiamond3",
    "default_personal_calendar": "Calendar",
}


class CalendarPreferencesUpdate(BaseModel):
    """Request body for updating calendar preferences."""
    default_calendar: Optional[str] = None
    default_meeting_calendar: Optional[str] = None
    default_personal_calendar: Optional[str] = None


def _get_calendar_setting(key: str) -> Optional[str]:
    """Get a calendar setting from the settings table."""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            )
            row = cursor.fetchone()
            return row["value"] if row else None
    except Exception:
        return None


def _set_calendar_setting(key: str, value: str) -> bool:
    """Set a calendar setting in the settings table."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
                """,
                (key, value, now, value, now)
            )
            conn.commit()
        return True
    except Exception:
        return False


@router.get("/preferences")
async def get_calendar_preferences():
    """Get calendar preferences."""
    def _load_preferences():
        return {
            "default_calendar": _get_calendar_setting("default_calendar") or DEFAULT_CALENDAR_SETTINGS["default_calendar"],
            "default_meeting_calendar": _get_calendar_setting("default_meeting_calendar") or DEFAULT_CALENDAR_SETTINGS["default_meeting_calendar"],
            "default_personal_calendar": _get_calendar_setting("default_personal_calendar") or DEFAULT_CALENDAR_SETTINGS["default_personal_calendar"],
            "defaults": DEFAULT_CALENDAR_SETTINGS,
        }

    return await _run_blocking(_load_preferences)


@router.patch("/preferences")
async def update_calendar_preferences(data: CalendarPreferencesUpdate):
    """Update calendar preferences."""
    updated = []

    def _update_preferences():
        if data.default_calendar is not None:
            if _set_calendar_setting("default_calendar", data.default_calendar):
                updated.append("default_calendar")
            else:
                raise HTTPException(status_code=500, detail="Failed to update default_calendar")

        if data.default_meeting_calendar is not None:
            if _set_calendar_setting("default_meeting_calendar", data.default_meeting_calendar):
                updated.append("default_meeting_calendar")
            else:
                raise HTTPException(status_code=500, detail="Failed to update default_meeting_calendar")

        if data.default_personal_calendar is not None:
            if _set_calendar_setting("default_personal_calendar", data.default_personal_calendar):
                updated.append("default_personal_calendar")
            else:
                raise HTTPException(status_code=500, detail="Failed to update default_personal_calendar")

    await _run_blocking(_update_preferences)

    if not updated:
        raise HTTPException(status_code=400, detail="No fields to update")

    return {
        "success": True,
        "updated": updated,
        "settings": await get_calendar_preferences()
    }
