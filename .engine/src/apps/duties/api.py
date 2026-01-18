"""Duties API - HTTP endpoints for Chief duties.

Note: Duties are core system only. No create/update/delete endpoints.
Users can view duties and trigger them manually, but not modify them.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from .service import DutiesService, Duty, DutyExecution

router = APIRouter(tags=["duties"])

# Service instance - injected by app loader
_service: Optional[DutiesService] = None


def set_service(service: DutiesService) -> None:
    """Inject service instance."""
    global _service
    _service = service


def _get_service() -> DutiesService:
    """Get service instance."""
    if _service is None:
        raise RuntimeError("DutiesService not initialized")
    return _service


# ============================================================================
# LIST / GET
# ============================================================================

@router.get("")
async def list_duties(enabled_only: bool = False):
    """List all Chief duties."""
    service = _get_service()
    duties = service.list_duties(enabled_only=enabled_only)
    return {
        "duties": [_duty_to_dict(d) for d in duties]
    }


@router.get("/{slug}")
async def get_duty(slug: str):
    """Get a specific duty by slug."""
    service = _get_service()
    duty = service.get_duty(slug)
    if not duty:
        raise HTTPException(status_code=404, detail=f"Duty not found: {slug}")
    return _duty_to_dict(duty)


# ============================================================================
# RUN NOW
# ============================================================================

@router.post("/{slug}/run")
async def run_duty_now(slug: str):
    """Trigger a duty to run immediately.

    This creates an execution record. The DutyScheduler will pick it up
    on its next cycle and execute it.
    """
    service = _get_service()
    duty = service.get_duty(slug)
    if not duty:
        raise HTTPException(status_code=404, detail=f"Duty not found: {slug}")

    if not duty.enabled:
        raise HTTPException(status_code=400, detail=f"Duty is disabled: {slug}")

    # Create execution record - scheduler will see this and execute
    execution_id = service.create_execution(duty.id, duty.slug)

    return {
        "success": True,
        "message": f"Duty '{slug}' triggered",
        "execution_id": execution_id,
    }


# ============================================================================
# EXECUTIONS
# ============================================================================

@router.get("/{slug}/history")
async def get_duty_history(slug: str, limit: int = 20):
    """Get execution history for a duty."""
    service = _get_service()

    # Verify duty exists
    duty = service.get_duty(slug)
    if not duty:
        raise HTTPException(status_code=404, detail=f"Duty not found: {slug}")

    executions = service.list_executions(duty_slug=slug, limit=limit)
    return {
        "duty_slug": slug,
        "executions": [_execution_to_dict(e) for e in executions]
    }


@router.get("/executions/recent")
async def get_recent_executions(limit: int = 20):
    """Get recent executions across all duties."""
    service = _get_service()
    executions = service.list_executions(limit=limit)
    return {
        "executions": [_execution_to_dict(e) for e in executions]
    }


@router.get("/executions/running")
async def get_running_executions():
    """Get currently running executions."""
    service = _get_service()
    executions = service.get_running_executions()
    return {
        "executions": [_execution_to_dict(e) for e in executions]
    }


# ============================================================================
# HELPERS
# ============================================================================

def _duty_to_dict(duty: Duty) -> dict:
    """Convert Duty to API response dict."""
    return {
        "id": duty.id,
        "slug": duty.slug,
        "name": duty.name,
        "description": duty.description,
        "schedule_time": duty.schedule_time,
        "prompt_file": duty.prompt_file,
        "timeout_minutes": duty.timeout_minutes,
        "enabled": duty.enabled,
        "last_run": duty.last_run,
        "last_status": duty.last_status,
        "created_at": duty.created_at,
        "updated_at": duty.updated_at,
    }


def _execution_to_dict(execution: DutyExecution) -> dict:
    """Convert DutyExecution to API response dict."""
    return {
        "id": execution.id,
        "duty_id": execution.duty_id,
        "duty_slug": execution.duty_slug,
        "started_at": execution.started_at,
        "ended_at": execution.ended_at,
        "status": execution.status,
        "session_id": execution.session_id,
        "error_message": execution.error_message,
        "duration_seconds": execution.duration_seconds,
    }
