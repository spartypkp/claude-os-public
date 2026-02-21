"""Calendar MCP tool - Unified calendar operations."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_services
from modules.accounts.access import get_access_service
from .service import CalendarService, EventCreate, EventUpdate

mcp = FastMCP("life-calendar")


@mcp.tool()
def calendar(
    operation: str,
    # List/Get operations
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    event_id: Optional[str] = None,
    calendar_id: Optional[str] = None,
    limit: int = 100,
    # Create/Update operations
    title: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    all_day: bool = False,
    location: Optional[str] = None,
    description: Optional[str] = None,
    recurrence_rule: Optional[str] = None,
    attendees: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Calendar operations across all providers.

    Args:
        operation: Operation - 'list', 'get', 'create', 'update', 'delete', 'calendars'

        # List/Get operations
        from_date: Start date (ISO format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        to_date: End date (ISO format)
        event_id: Event ID (required for get, update, delete)
        calendar_id: Calendar ID filter or target
        limit: Max events to return (default 100)

        # Create/Update operations
        title: Event title (required for create)
        start_time: Start datetime (ISO format, required for create)
        end_time: End datetime (ISO format, required for create)
        all_day: All-day event flag
        location: Event location
        description: Event description
        recurrence_rule: iCalendar RRULE for recurring events
        attendees: List of attendee email addresses
            Note: creates local event attendee records only. Does NOT send
            calendar invitations. Google Calendar invite sending not yet supported.

    Returns:
        Object with success status and operation-specific data

    Examples:
        # List operations
        calendar("list", from_date="2026-01-07", to_date="2026-01-14")
        calendar("calendars")  # List available calendars

        # Get specific event
        calendar("get", event_id="abc123")

        # Create event
        calendar("create", title="Meeting", start_time="2026-01-08T14:00:00",
                 end_time="2026-01-08T15:00:00", location="Office")

        # Update event
        calendar("update", event_id="abc123", title="Updated Meeting",
                 location="Zoom")

        # Delete event
        calendar("delete", event_id="abc123")
    """
    try:
        services = get_services()
        storage = services.storage
        calendar_service = CalendarService(storage)

        if operation == "calendars":
            return _calendar_list_calendars(calendar_service)
        elif operation == "list":
            return _calendar_list_events(calendar_service, from_date, to_date, calendar_id, limit)
        elif operation == "get":
            return _calendar_get_event(calendar_service, event_id)
        elif operation == "create":
            return _calendar_create_event(calendar_service, title, start_time, end_time, all_day,
                                         location, description, calendar_id, recurrence_rule, attendees)
        elif operation == "update":
            return _calendar_update_event(calendar_service, event_id, title, start_time, end_time,
                                         location, description, calendar_id)
        elif operation == "delete":
            return _calendar_delete_event(calendar_service, event_id, calendar_id)
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use list, get, create, update, delete, or calendars"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


def _calendar_list_calendars(service: CalendarService) -> Dict[str, Any]:
    calendars = service.get_calendars()

    calendars_data = [
        {
            "id": cal.id,
            "name": cal.name,
            "provider": cal.provider.value,
            "is_primary": cal.primary,
            "color": cal.color,
        }
        for cal in calendars
    ]

    return {
        "success": True,
        "count": len(calendars_data),
        "calendars": calendars_data
    }


def _calendar_list_events(service: CalendarService, from_date: Optional[str], to_date: Optional[str],
                          calendar_id: Optional[str], limit: int) -> Dict[str, Any]:
    start = None
    end = None

    if from_date:
        start = datetime.fromisoformat(from_date.replace('Z', '+00:00'))

    if to_date:
        # Fix date-only strings: set to end-of-day so same-day queries work
        if 'T' not in to_date:
            to_date = to_date + "T23:59:59"
        end = datetime.fromisoformat(to_date.replace('Z', '+00:00'))

    events = service.get_events(
        start=start,
        end=end,
        calendar_id=calendar_id,
        limit=limit
    )

    events_data = [
        {
            "id": event.id,
            "title": event.summary,
            "start": event.start.isoformat(),
            "end": event.end.isoformat(),
            "all_day": event.all_day,
            "location": event.location,
            "description": event.description,
            "calendar_id": event.calendar_id,
            "calendar_name": event.calendar_name,
            "provider": event.provider.value,
        }
        for event in events
    ]

    return {
        "success": True,
        "count": len(events_data),
        "events": events_data
    }


def _calendar_get_event(service: CalendarService, event_id: Optional[str]) -> Dict[str, Any]:
    if not event_id:
        return {
            "success": False,
            "error": "event_id required for get operation"
        }

    event = service.get_event(event_id)

    if not event:
        return {
            "success": False,
            "error": f"Event {event_id} not found"
        }

    event_data = {
        "id": event.id,
        "title": event.summary,
        "start": event.start.isoformat(),
        "end": event.end.isoformat(),
        "all_day": event.all_day,
        "location": event.location,
        "description": event.description,
        "calendar_id": event.calendar_id,
        "calendar_name": event.calendar_name,
        "provider": event.provider.value,
        "recurrence_rule": event.recurrence_rule,
        "attendees": event.attendees,
    }

    # Fire-and-forget contact signal
    try:
        from modules.contacts.signals import process_calendar_signals
        from modules.contacts.standalone import StandaloneContactsRepository
        repo = StandaloneContactsRepository(get_services().storage)
        process_calendar_signals(event_data, repo)
    except Exception:
        pass  # Never block calendar operations

    return {
        "success": True,
        "event": event_data
    }


def _calendar_create_event(service: CalendarService, title: Optional[str], start_time: Optional[str],
                           end_time: Optional[str], all_day: bool, location: Optional[str],
                           description: Optional[str], calendar_id: Optional[str],
                           recurrence_rule: Optional[str], attendees: Optional[List[str]]) -> Dict[str, Any]:
    # Access tier check — create requires assist or higher
    try:
        access = get_access_service()
        if not access.can_assist('calendar'):
            return {
                "success": False,
                "error": "Calendar access is set to 'Read' mode. Change to 'Assist' or 'Autonomous' in Settings to create events."
            }
    except RuntimeError:
        pass  # AccessService not initialized

    if not title or not start_time or not end_time:
        return {
            "success": False,
            "error": "title, start_time, and end_time required for create"
        }

    start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    end = datetime.fromisoformat(end_time.replace('Z', '+00:00'))

    event_create = EventCreate(
        summary=title,
        start=start,
        end=end,
        all_day=all_day,
        location=location,
        description=description,
        calendar_id=calendar_id,
        recurrence_rule=recurrence_rule,
        attendees=attendees or []
    )

    try:
        created_event = service.create_event(event=event_create)
    except Exception as e:
        cal_name = calendar_id or 'default'
        return {
            "success": False,
            "error": f"Failed to create event in calendar '{cal_name}'. Calendar.app returned error: {e}. Check that the calendar exists."
        }

    if not created_event:
        cal_name = calendar_id or 'default'
        return {
            "success": False,
            "error": f"Failed to create event in calendar '{cal_name}'. Check that the calendar exists in Calendar.app."
        }

    # Log to Timeline
    from core.timeline import log_system_event
    time_str = created_event.start.strftime("%b %d %I:%M%p").replace(" 0", " ").lower()
    log_system_event(f'Calendar: added "{created_event.summary}" for {time_str}')

    # Emit SSE event for real-time Dashboard update
    from core.mcp_helpers import notify_backend_event
    notify_backend_event("calendar.created", {"id": created_event.id, "title": created_event.summary})

    return {
        "success": True,
        "event": {
            "id": created_event.id,
            "title": created_event.summary,
            "start": created_event.start.isoformat(),
            "end": created_event.end.isoformat(),
            "calendar_id": created_event.calendar_id,
        },
        "logged_to": "Timeline"
    }


def _calendar_update_event(service: CalendarService, event_id: Optional[str], title: Optional[str],
                           start_time: Optional[str], end_time: Optional[str], location: Optional[str],
                           description: Optional[str], calendar_id: Optional[str]) -> Dict[str, Any]:
    # Access tier check — update requires assist or higher
    try:
        access = get_access_service()
        if not access.can_assist('calendar'):
            return {
                "success": False,
                "error": "Calendar access is set to 'Read' mode. Change to 'Assist' or 'Autonomous' in Settings to update events."
            }
    except RuntimeError:
        pass

    if not event_id:
        return {
            "success": False,
            "error": "event_id required for update operation"
        }

    event_update = EventUpdate()

    if title is not None:
        event_update.summary = title
    if start_time is not None:
        event_update.start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    if end_time is not None:
        event_update.end = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    if location is not None:
        event_update.location = location
    if description is not None:
        event_update.description = description
    if calendar_id is not None:
        event_update.calendar_id = calendar_id

    try:
        updated_event = service.update_event(
            event_id=event_id,
            update=event_update,
            calendar_id=calendar_id,
        )
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to update event {event_id}. Calendar.app returned error: {e}"
        }

    if not updated_event:
        return {
            "success": False,
            "error": f"Failed to update event {event_id}. The event may not exist or the calendar may be read-only."
        }

    # Log to Timeline
    from core.timeline import log_system_event
    time_str = updated_event.start.strftime("%b %d %I:%M%p").replace(" 0", " ").lower()
    log_system_event(f'Calendar: "{updated_event.summary}" updated to {time_str}')

    # Emit SSE event for real-time Dashboard update
    from core.mcp_helpers import notify_backend_event
    notify_backend_event("calendar.updated", {"id": updated_event.id, "title": updated_event.summary})

    return {
        "success": True,
        "event": {
            "id": updated_event.id,
            "title": updated_event.summary,
            "start": updated_event.start.isoformat(),
            "end": updated_event.end.isoformat(),
        },
        "logged_to": "Timeline"
    }


def _calendar_delete_event(service: CalendarService, event_id: Optional[str],
                           calendar_id: Optional[str]) -> Dict[str, Any]:
    # Access tier check — delete requires autonomous
    try:
        access = get_access_service()
        if not access.can_act_autonomously('calendar'):
            tier = access.get_tier('calendar')
            return {
                "success": False,
                "error": f"Calendar access must be 'Autonomous' to delete events. Current tier: '{tier.title()}'. Change in Settings."
            }
    except RuntimeError:
        pass

    if not event_id:
        return {
            "success": False,
            "error": "event_id required for delete operation"
        }

    # Get event title before deleting for logging
    event_to_delete = service.get_event(event_id)
    event_title = event_to_delete.summary if event_to_delete else event_id

    try:
        success = service.delete_event(
            event_id=event_id,
            calendar_id=calendar_id,
        )
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to delete event {event_id}. Calendar.app returned error: {e}"
        }

    if success:
        from core.timeline import log_system_event
        log_system_event(f'Calendar: "{event_title}" cancelled')

        # Emit SSE event for real-time Dashboard update
        from core.mcp_helpers import notify_backend_event
        notify_backend_event("calendar.deleted", {"id": event_id, "title": event_title})

        return {
            "success": True,
            "message": f"Event {event_id} deleted",
            "logged_to": "Timeline"
        }
    else:
        return {
            "success": False,
            "error": f"Failed to delete event {event_id}. The event may not exist or the calendar may be read-only."
        }
