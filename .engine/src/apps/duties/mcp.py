"""Duties MCP tool - Claude's interface to Chief duties.

Chief duties are critical scheduled work that interrupts Chief's conversation.
Unlike missions (which spawn specialists), duties run IN Chief's context.

Core duties:
- memory-consolidation (6 AM) - Archive, consolidate memory, process friction
- morning-prep (7 AM) - Create brief, prepare fresh Chief for day
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from .service import DutiesService

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


def duty(
    operation: str,
    slug: Optional[str] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """Manage Chief duties (critical scheduled Chief work).

    Duties are fundamentally different from missions:
    - Duties: Run IN Chief's context (force reset -> inject prompt -> continue)
    - Missions: Spawn NEW specialist windows

    Operations:
        list - List all duties
        get - Get a specific duty (requires slug)
        run_now - Trigger a duty immediately (requires slug)
        history - Get execution history for a duty (requires slug)

    Examples:
        duty("list")
        duty("get", slug="memory-consolidation")
        duty("run_now", slug="memory-consolidation")
        duty("history", slug="memory-consolidation", limit=5)
    """
    service = _get_service()

    try:
        if operation == "list":
            duties = service.list_duties()
            return {
                "success": True,
                "duties": [
                    {
                        "slug": d.slug,
                        "name": d.name,
                        "schedule_time": d.schedule_time,
                        "enabled": d.enabled,
                        "last_run": d.last_run,
                        "last_status": d.last_status,
                    }
                    for d in duties
                ]
            }

        elif operation == "get":
            if not slug:
                return {"success": False, "error": "slug required for get"}

            duty_obj = service.get_duty(slug)
            if not duty_obj:
                return {"success": False, "error": f"Duty not found: {slug}"}

            return {
                "success": True,
                "duty": {
                    "id": duty_obj.id,
                    "slug": duty_obj.slug,
                    "name": duty_obj.name,
                    "description": duty_obj.description,
                    "schedule_time": duty_obj.schedule_time,
                    "prompt_file": duty_obj.prompt_file,
                    "timeout_minutes": duty_obj.timeout_minutes,
                    "enabled": duty_obj.enabled,
                    "last_run": duty_obj.last_run,
                    "last_status": duty_obj.last_status,
                }
            }

        elif operation == "run_now":
            if not slug:
                return {"success": False, "error": "slug required for run_now"}

            duty_obj = service.get_duty(slug)
            if not duty_obj:
                return {"success": False, "error": f"Duty not found: {slug}"}

            if not duty_obj.enabled:
                return {"success": False, "error": f"Duty is disabled: {slug}"}

            # Create execution record - scheduler will pick it up
            execution_id = service.create_execution(duty_obj.id, duty_obj.slug)

            return {
                "success": True,
                "message": f"Duty '{slug}' triggered",
                "execution_id": execution_id,
            }

        elif operation == "history":
            if not slug:
                return {"success": False, "error": "slug required for history"}

            duty_obj = service.get_duty(slug)
            if not duty_obj:
                return {"success": False, "error": f"Duty not found: {slug}"}

            executions = service.list_executions(duty_slug=slug, limit=limit)

            return {
                "success": True,
                "duty_slug": slug,
                "executions": [
                    {
                        "id": e.id,
                        "started_at": e.started_at,
                        "ended_at": e.ended_at,
                        "status": e.status,
                        "duration_seconds": e.duration_seconds,
                        "error_message": e.error_message,
                    }
                    for e in executions
                ]
            }

        elif operation == "running":
            executions = service.get_running_executions()
            return {
                "success": True,
                "executions": [
                    {
                        "id": e.id,
                        "duty_slug": e.duty_slug,
                        "started_at": e.started_at,
                        "status": e.status,
                    }
                    for e in executions
                ]
            }

        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use: list, get, run_now, history, running"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


__all__ = ['duty', 'set_service']
