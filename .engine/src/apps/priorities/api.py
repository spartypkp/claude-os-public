"""Priorities API - HTTP routes for priority management."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# Jan 2026: Real-time event bus
from utils.event_bus import event_bus

router = APIRouter()

# Service will be injected by the plugin
_service = None


def set_service(service):
    """Set the priorities service (called by plugin)."""
    global _service
    _service = service


def get_service():
    """Get the priorities service."""
    if _service is None:
        raise RuntimeError("PrioritiesService not initialized")
    return _service


# === Request/Response Models ===

class PriorityCreate(BaseModel):
    content: str
    level: str = "medium"
    date: Optional[str] = None


class PriorityUpdate(BaseModel):
    content: Optional[str] = None
    level: Optional[str] = None
    completed: Optional[bool] = None


class PriorityResponse(BaseModel):
    id: str
    content: str
    level: str
    completed: bool
    position: int
    created_at: str


class PrioritiesListResponse(BaseModel):
    date: str
    priorities: dict  # {critical: [], medium: [], low: []}
    count: int
    timestamp: str


# === Routes ===

@router.get("", response_model=PrioritiesListResponse)
async def list_priorities(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    include_completed: bool = Query(False, description="Include completed priorities"),
):
    """List priorities for a date (defaults to today).
    
    Returns priorities grouped by level for Dashboard display.
    """
    service = get_service()
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    
    grouped = service.list_by_date(target_date, include_completed)
    
    # Convert to response format
    priorities = {
        level: [
            {
                "id": p.id,
                "content": p.content,
                "completed": p.completed,
                "position": p.position,
                "created_at": p.created_at,
            }
            for p in plist
        ]
        for level, plist in grouped.items()
    }
    
    total = sum(len(plist) for plist in grouped.values())
    
    return {
        "date": target_date,
        "priorities": priorities,
        "count": total,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("", status_code=201)
async def create_priority(data: PriorityCreate):
    """Create a new priority."""
    service = get_service()
    
    try:
        p = service.create(
            content=data.content,
            level=data.level,
            date=data.date,
        )
        
        # Emit event for Dashboard real-time update
        await event_bus.publish("priority.created", {
            "priority_id": p.id,
            "level": p.level,
            "date": p.date,
        })
        
        return {
            "success": True,
            "id": p.id,
            "date": p.date,
            "level": p.level,
            "position": p.position,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{priority_id}")
async def update_priority(priority_id: str, data: PriorityUpdate):
    """Update a priority."""
    service = get_service()
    
    try:
        p = service.update(
            priority_id=priority_id,
            content=data.content,
            level=data.level,
            completed=data.completed,
        )
        
        if not p:
            raise HTTPException(status_code=404, detail=f"Priority '{priority_id}' not found")
        
        # Emit event for Dashboard real-time update
        await event_bus.publish("priority.updated", {"priority_id": p.id})
        
        return {"success": True, "id": p.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{priority_id}/complete")
async def complete_priority(priority_id: str):
    """Mark a priority as completed."""
    service = get_service()
    
    p = service.complete(priority_id)
    
    if not p:
        raise HTTPException(status_code=404, detail=f"Priority '{priority_id}' not found")
    
    # Emit event for Dashboard real-time update
    await event_bus.publish("priority.completed", {"priority_id": p.id})
    
    return {"success": True, "id": p.id}


@router.delete("/{priority_id}", status_code=204)
async def delete_priority(priority_id: str):
    """Delete a priority."""
    service = get_service()
    
    if not service.delete(priority_id):
        raise HTTPException(status_code=404, detail=f"Priority '{priority_id}' not found")
    
    # Emit event for Dashboard real-time update
    await event_bus.publish("priority.deleted", {"priority_id": priority_id})

