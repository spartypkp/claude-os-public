"""Calendar API routes.

Provides REST endpoints for calendar operations:
- Provider management (list, add, remove, test)
- Calendar listing
- Event CRUD
- Search

These routes are mounted at /api/calendar/* by the app plugin.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .service import CalendarService
from .adapters import EventCreate, EventUpdate, ProviderType
from utils.event_bus import emit_calendar_created, emit_calendar_updated, emit_calendar_deleted

router = APIRouter()

_service: Optional[CalendarService] = None


def set_service(service: CalendarService):
    """Set the calendar service (called by plugin)."""
    global _service
    _service = service


def get_service() -> CalendarService:
    """Get the calendar service."""
    if _service is None:
        raise RuntimeError("CalendarService not initialized")
    return _service


# =============================================================================
# Request/Response Models
# =============================================================================

class ProviderInfo(BaseModel):
    type: str
    name: str
    description: str
    available: bool
    configured: bool
    requires_config: bool
    config_fields: List[str] = Field(default_factory=list)
    presets: List[str] = Field(default_factory=list)


class AccountInfo(BaseModel):
    id: str
    provider_type: str
    name: str
    email: Optional[str] = None
    enabled: bool
    is_primary: bool
    connected: bool
    last_sync: Optional[str] = None
    error: Optional[str] = None


class AddAccountRequest(BaseModel):
    provider_type: str
    name: str
    email: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class TestProviderRequest(BaseModel):
    provider_type: str
    config: Dict[str, Any] = Field(default_factory=dict)


class CalendarResponse(BaseModel):
    id: str
    name: str
    color: Optional[str] = None
    account: Optional[str] = None
    provider: str
    writable: bool
    primary: bool


class EventResponse(BaseModel):
    id: str
    summary: str
    start_ts: str
    end_ts: str
    all_day: bool
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_id: Optional[str] = None
    calendar_name: Optional[str] = None
    kind: str = "calendar"
    organizer_email: Optional[str] = None
    organizer_name: Optional[str] = None
    status: str = "confirmed"


class CreateEventRequest(BaseModel):
    title: str = Field(..., alias='summary')
    start_date: str
    end_date: str
    all_day: bool = False
    location: Optional[str] = None
    notes: Optional[str] = Field(None, alias='description')
    calendar_name: Optional[str] = Field(None, alias='calendar_id')
    provider_type: Optional[str] = None
    
    class Config:
        populate_by_name = True


class UpdateEventRequest(BaseModel):
    summary: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_id: Optional[str] = None


class MoveEventRequest(BaseModel):
    event_id: str
    new_start: str
    new_end: str


# =============================================================================
# Provider Routes
# =============================================================================

@router.get("/providers", response_model=List[ProviderInfo])
async def list_providers():
    """List available calendar providers and their status."""
    service = get_service()
    providers = service.get_available_providers()
    return [ProviderInfo(**p) for p in providers]


@router.post("/providers/test")
async def test_provider(request: TestProviderRequest):
    """Test connection to a provider without saving."""
    service = get_service()
    result = service.test_provider(request.provider_type, request.config)
    return result


# =============================================================================
# Account Routes
# =============================================================================

@router.get("/accounts", response_model=List[AccountInfo])
async def list_accounts():
    """List all configured calendar accounts."""
    service = get_service()
    accounts = service.get_accounts()
    return [AccountInfo(**a) for a in accounts]


@router.post("/accounts")
async def add_account(request: AddAccountRequest):
    """Add a new calendar account."""
    service = get_service()
    result = service.add_account(
        provider_type=request.provider_type,
        name=request.name,
        config=request.config,
        email=request.email,
    )
    
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to add account'))
    
    return result


@router.delete("/accounts/{account_id}")
async def remove_account(account_id: str):
    """Remove a calendar account."""
    service = get_service()
    result = service.remove_account(account_id)
    
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to remove account'))
    
    return result


@router.post("/accounts/{account_id}/primary")
async def set_primary_account(account_id: str):
    """Set an account as the primary account."""
    service = get_service()
    result = service.set_primary_account(account_id)
    
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Failed to set primary'))
    
    return result


# =============================================================================
# Calendar Routes
# =============================================================================

@router.get("/calendars", response_model=List[CalendarResponse])
async def list_calendars(
    provider_type: Optional[str] = Query(None, description="Filter by provider type"),
):
    """List all available calendars."""
    service = get_service()
    calendars = service.get_calendars(provider_type)
    
    return [
        CalendarResponse(
            id=c.id,
            name=c.name,
            color=c.color,
            account=c.account,
            provider=c.provider.value,
            writable=c.writable,
            primary=c.primary,
        )
        for c in calendars
    ]


# =============================================================================
# Event Routes
# =============================================================================

@router.get("/events", response_model=List[EventResponse])
async def list_events(
    from_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    to_date: Optional[str] = Query(None, description="End date (ISO format)"),
    days: int = Query(7, ge=1, le=365, description="Number of days if no date range"),
    calendar: Optional[str] = Query(None, description="Filter by calendar ID"),
    provider_type: Optional[str] = Query(None, description="Filter by provider type"),
    use_preferred: bool = Query(True, description="Only show preferred calendars"),
    limit: int = Query(100, ge=1, le=500),
):
    """List calendar events.
    
    This is the primary endpoint for fetching calendar data.
    Aggregates events from all configured providers.
    """
    service = get_service()
    
    # Parse dates
    start = None
    end = None
    
    if from_date:
        start = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
    else:
        now = datetime.now()
        start = datetime(now.year, now.month, now.day)

    if to_date:
        # Fix date-only strings: set to end-of-day so same-day queries work
        # Without this, "2026-01-09" to "2026-01-09" creates 0-width range
        if 'T' not in to_date:
            to_date = to_date + "T23:59:59"
        end = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
    else:
        end = start + timedelta(days=days)
    
    events = service.get_events(
        start=start,
        end=end,
        calendar_id=calendar,
        provider_type=provider_type,
        limit=limit,
    )
    
    return [
        EventResponse(
            id=e.id,
            summary=e.summary,
            start_ts=e.start.isoformat(),
            end_ts=e.end.isoformat(),
            all_day=e.all_day,
            location=e.location,
            description=e.description,
            calendar_id=e.calendar_id,
            calendar_name=e.calendar_name,
            organizer_email=e.organizer_email,
            organizer_name=e.organizer_name,
            status=e.status,
        )
        for e in events
    ]


@router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: str,
    calendar_id: Optional[str] = Query(None),
    provider_type: Optional[str] = Query(None),
):
    """Get a single event by ID."""
    service = get_service()
    event = service.get_event(event_id, calendar_id, provider_type)
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return EventResponse(
        id=event.id,
        summary=event.summary,
        start_ts=event.start.isoformat(),
        end_ts=event.end.isoformat(),
        all_day=event.all_day,
        location=event.location,
        description=event.description,
        calendar_id=event.calendar_id,
        calendar_name=event.calendar_name,
        organizer_email=event.organizer_email,
        organizer_name=event.organizer_name,
        status=event.status,
    )


@router.post("/create")
async def create_event(request: CreateEventRequest):
    """Create a new calendar event.
    
    Creates event in Apple Calendar if available, otherwise local storage.
    """
    service = get_service()
    
    try:
        start = datetime.fromisoformat(request.start_date.replace('Z', '+00:00'))
        end = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
    
    event = EventCreate(
        summary=request.title,
        start=start,
        end=end,
        all_day=request.all_day,
        location=request.location,
        description=request.notes,
        calendar_id=request.calendar_name,
    )
    
    created = service.create_event(event, request.provider_type)

    if not created:
        raise HTTPException(status_code=500, detail="Failed to create event")

    # Emit event for Dashboard real-time update
    await emit_calendar_created(
        event_id=created.id,
        calendar_id=created.calendar_id or "",
        summary=created.summary,
        start_ts=created.start.isoformat(),
    )

    return {
        "success": True,
        "event_id": created.id,
    }


@router.post("/move")
async def move_event(request: MoveEventRequest):
    """Move an event to a new time.
    
    This is used by drag-and-drop in the calendar UI.
    """
    service = get_service()
    
    try:
        new_start = datetime.fromisoformat(request.new_start.replace('Z', '+00:00'))
        new_end = datetime.fromisoformat(request.new_end.replace('Z', '+00:00'))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
    
    update = EventUpdate(start=new_start, end=new_end)
    updated = service.update_event(request.event_id, update)

    if not updated:
        raise HTTPException(status_code=404, detail="Event not found or update failed")

    # Emit event for Dashboard real-time update
    await emit_calendar_updated(
        event_id=updated.id,
        calendar_id=updated.calendar_id or "",
    )

    return {"success": True}


@router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    request: UpdateEventRequest,
    calendar_id: Optional[str] = Query(None),
):
    """Update an existing event."""
    service = get_service()
    
    update = EventUpdate(
        summary=request.summary,
        location=request.location,
        description=request.description,
        calendar_id=request.calendar_id,
    )
    
    if request.start_date:
        try:
            update.start = datetime.fromisoformat(request.start_date.replace('Z', '+00:00'))
        except ValueError:
            pass
    
    if request.end_date:
        try:
            update.end = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
        except ValueError:
            pass
    
    if request.all_day is not None:
        update.all_day = request.all_day
    
    updated = service.update_event(event_id, update, calendar_id)

    if not updated:
        raise HTTPException(status_code=404, detail="Event not found or update failed")

    # Emit event for Dashboard real-time update
    await emit_calendar_updated(
        event_id=updated.id,
        calendar_id=updated.calendar_id or "",
    )

    return {"success": True, "event_id": updated.id}


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    calendar_id: Optional[str] = Query(None),
):
    """Delete an event."""
    service = get_service()
    
    deleted = service.delete_event(event_id, calendar_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found or delete failed")

    # Emit event for Dashboard real-time update
    await emit_calendar_deleted(
        event_id=event_id,
        calendar_id=calendar_id or "",
    )

    return {"success": True}


@router.get("/search", response_model=List[EventResponse])
async def search_events(
    query: str = Query(..., min_length=1),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Search for events by title or description."""
    service = get_service()
    
    start = None
    end = None
    
    if from_date:
        start = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
    if to_date:
        end = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
    
    events = service.search_events(query, start, end, limit)
    
    return [
        EventResponse(
            id=e.id,
            summary=e.summary,
            start_ts=e.start.isoformat(),
            end_ts=e.end.isoformat(),
            all_day=e.all_day,
            location=e.location,
            description=e.description,
            calendar_id=e.calendar_id,
            calendar_name=e.calendar_name,
            organizer_email=e.organizer_email,
            organizer_name=e.organizer_name,
            status=e.status,
        )
        for e in events
    ]


# =============================================================================
# Sync Routes
# =============================================================================

@router.post("/sync")
async def sync_all():
    """Trigger sync for all configured providers."""
    service = get_service()
    results = await service.sync_all()
    return {"success": True, "results": results}

