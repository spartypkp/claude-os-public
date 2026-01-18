"""Missions HTTP API endpoints."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .service import MissionsService, Mission, MissionExecution
from utils.event_bus import event_bus

router = APIRouter()

# Service injection - set by __init__.py
_service: Optional[MissionsService] = None


def set_service(service: MissionsService) -> None:
    """Set the service instance (called by __init__.py)."""
    global _service
    _service = service


def get_service() -> MissionsService:
    """Get the service instance."""
    if _service is None:
        raise RuntimeError("MissionsService not initialized")
    return _service


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateMissionRequest(BaseModel):
    """Request to create a new user mission."""
    name: str
    slug: str
    description: Optional[str] = None
    
    # Prompt
    prompt_type: str = "file"
    prompt_file: Optional[str] = None
    prompt_inline: Optional[str] = None
    
    # Schedule
    schedule_type: Optional[str] = None
    schedule_cron: Optional[str] = None
    schedule_time: Optional[str] = None
    schedule_days: Optional[List[str]] = None
    
    # Trigger
    trigger_type: Optional[str] = None
    trigger_config: Optional[Dict[str, Any]] = None
    
    # Execution
    timeout_minutes: int = 60
    role: str = "chief"
    mode: str = "autonomous"


class UpdateMissionRequest(BaseModel):
    """Request to update a mission."""
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_file: Optional[str] = None
    prompt_inline: Optional[str] = None
    schedule_type: Optional[str] = None
    schedule_cron: Optional[str] = None
    schedule_time: Optional[str] = None
    schedule_days: Optional[List[str]] = None
    trigger_type: Optional[str] = None
    trigger_config: Optional[Dict[str, Any]] = None
    timeout_minutes: Optional[int] = None
    role: Optional[str] = None
    mode: Optional[str] = None


def mission_to_dict(m: Mission) -> Dict[str, Any]:
    """Convert Mission to API response dict."""
    return {
        "id": m.id,
        "name": m.name,
        "slug": m.slug,
        "description": m.description,
        "source": m.source,
        "app_slug": m.app_slug,
        "prompt_type": m.prompt_type,
        "prompt_file": m.prompt_file,
        "prompt_inline": m.prompt_inline,
        "schedule_type": m.schedule_type,
        "schedule_cron": m.schedule_cron,
        "schedule_time": m.schedule_time,
        "schedule_days": m.schedule_days,
        "trigger_type": m.trigger_type,
        "trigger_config": m.trigger_config,
        "timeout_minutes": m.timeout_minutes,
        "role": m.role,
        "mode": m.mode,
        "enabled": m.enabled,
        "next_run": m.next_run,
        "last_run": m.last_run,
        "last_status": m.last_status,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
        # Computed
        "is_scheduled": m.is_scheduled,
        "is_triggered": m.is_triggered,
        "is_recurring": m.is_recurring,
    }


def execution_to_dict(e: MissionExecution) -> Dict[str, Any]:
    """Convert MissionExecution to API response dict."""
    return {
        "id": e.id,
        "mission_id": e.mission_id,
        "mission_slug": e.mission_slug,
        "started_at": e.started_at,
        "ended_at": e.ended_at,
        "status": e.status,
        "session_id": e.session_id,
        "transcript_path": e.transcript_path,
        "output_summary": e.output_summary,
        "error_message": e.error_message,
        "duration_seconds": e.duration_seconds,
    }


# =============================================================================
# MISSION ENDPOINTS
# =============================================================================

@router.get("")
async def list_missions(
    source: Optional[str] = None,
    enabled_only: bool = False,
    app_slug: Optional[str] = None,
):
    """List all missions with optional filters."""
    service = get_service()
    missions = service.list_missions(
        source=source,
        enabled_only=enabled_only,
        app_slug=app_slug,
    )
    
    return {
        "missions": [mission_to_dict(m) for m in missions],
        "total": len(missions),
    }


@router.get("/running")
async def get_running_missions():
    """Get currently running mission executions."""
    service = get_service()
    executions = service.get_running_executions()
    
    return {
        "running": [execution_to_dict(e) for e in executions],
        "count": len(executions),
    }


@router.get("/executions")
async def list_all_executions(
    status: Optional[str] = None,
    limit: int = 20,
):
    """List recent execution history across all missions."""
    service = get_service()
    executions = service.list_executions(status=status, limit=limit)
    
    return {
        "executions": [execution_to_dict(e) for e in executions],
        "total": len(executions),
    }


@router.get("/executions/{execution_id}")
async def get_execution(execution_id: str):
    """Get a specific execution by ID."""
    service = get_service()
    execution = service.get_execution(execution_id)
    
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    return execution_to_dict(execution)


@router.get("/{slug}")
async def get_mission(slug: str):
    """Get a mission by slug."""
    service = get_service()
    mission = service.get_mission(slug)
    
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")
    
    return mission_to_dict(mission)


@router.post("")
async def create_mission(request: CreateMissionRequest):
    """Create a new user mission."""
    service = get_service()
    
    # Check if slug already exists
    if service.get_mission(request.slug):
        raise HTTPException(
            status_code=400, 
            detail=f"Mission with slug '{request.slug}' already exists"
        )
    
    mission = service.create_mission(
        name=request.name,
        slug=request.slug,
        source="user",  # API can only create user missions
        description=request.description,
        prompt_type=request.prompt_type,
        prompt_file=request.prompt_file,
        prompt_inline=request.prompt_inline,
        schedule_type=request.schedule_type,
        schedule_cron=request.schedule_cron,
        schedule_time=request.schedule_time,
        schedule_days=request.schedule_days,
        trigger_type=request.trigger_type,
        trigger_config=request.trigger_config,
        timeout_minutes=request.timeout_minutes,
        role=request.role,
        mode=request.mode,
    )
    
    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("mission.created", {"slug": mission.slug, "name": mission.name})
    
    return mission_to_dict(mission)


@router.put("/{slug}")
async def update_mission(slug: str, request: UpdateMissionRequest):
    """Update a mission's configuration."""
    service = get_service()
    
    mission = service.get_mission(slug)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")
    
    # Build updates dict from non-None values
    updates = {}
    for field in [
        "name", "description", "prompt_file", "prompt_inline",
        "schedule_type", "schedule_cron", "schedule_time", "schedule_days",
        "trigger_type", "trigger_config", "timeout_minutes", "role", "mode"
    ]:
        value = getattr(request, field)
        if value is not None:
            updates[field] = value
    
    updated = service.update_mission(slug, **updates)
    
    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("mission.updated", {"slug": slug})
    
    return mission_to_dict(updated)


@router.delete("/{slug}")
async def delete_mission(slug: str):
    """Delete a user mission."""
    service = get_service()
    
    mission = service.get_mission(slug)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")
    
    if mission.source != "user":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete {mission.source} mission. Only user missions can be deleted."
        )
    
    service.delete_mission(slug)
    
    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("mission.deleted", {"slug": slug})
    
    return {"success": True, "message": f"Mission '{slug}' deleted"}


@router.post("/{slug}/enable")
async def enable_mission(slug: str):
    """Enable a mission."""
    service = get_service()
    
    mission = service.get_mission(slug)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")
    
    updated = service.enable_mission(slug)
    
    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("mission.updated", {"slug": slug, "enabled": True})
    
    return mission_to_dict(updated)


@router.post("/{slug}/disable")
async def disable_mission(slug: str):
    """Disable a mission."""
    service = get_service()

    mission = service.get_mission(slug)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")

    updated = service.disable_mission(slug)
    
    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("mission.updated", {"slug": slug, "enabled": False})
    
    return mission_to_dict(updated)


@router.post("/{slug}/run")
async def run_mission_now(slug: str):
    """Trigger immediate execution of a mission."""
    service = get_service()
    
    mission = service.get_mission(slug)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")
    
    if not mission.enabled:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot run disabled mission '{slug}'. Enable it first."
        )
    
    # Create execution record
    execution_id = service.create_execution(
        mission_id=mission.id,
        mission_slug=mission.slug,
    )
    
    # TODO: Actually spawn the mission via SessionManager
    # For now, return the execution ID for the scheduler to pick up
    # In Phase 3, the scheduler will be refactored to handle this
    
    # Set next_run to now so scheduler picks it up immediately
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    service.set_next_run(mission.id, now)
    
    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("mission.started", {"slug": slug, "execution_id": execution_id})
    
    return {
        "success": True,
        "message": f"Mission '{slug}' queued for immediate execution",
        "execution_id": execution_id,
    }


@router.get("/{slug}/history")
async def get_mission_history(slug: str, limit: int = 10):
    """Get execution history for a specific mission."""
    service = get_service()
    
    mission = service.get_mission(slug)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{slug}' not found")
    
    executions = service.list_executions(mission_slug=slug, limit=limit)
    
    return {
        "mission": mission_to_dict(mission),
        "executions": [execution_to_dict(e) for e in executions],
        "total": len(executions),
    }

