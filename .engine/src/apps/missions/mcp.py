"""Missions MCP tool for Claude access."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .service import MissionsService

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


def mission(
    operation: str,
    slug: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    prompt_file: Optional[str] = None,
    prompt_inline: Optional[str] = None,
    schedule_type: Optional[str] = None,
    schedule_cron: Optional[str] = None,
    schedule_time: Optional[str] = None,
    schedule_days: Optional[List[str]] = None,
    trigger_type: Optional[str] = None,
    trigger_config: Optional[Dict[str, Any]] = None,
    timeout_minutes: Optional[int] = None,
    role: Optional[str] = None,
    mode: Optional[str] = None,
    source: Optional[str] = None,
    enabled_only: bool = False,
    limit: int = 20,
) -> Dict[str, Any]:
    """Manage scheduled and triggered missions.

    Missions are autonomous Claude sessions that run on schedule or in response
    to triggers. Note: Chief work is handled by the separate duties system.
    Missions only spawn specialists (role != 'chief').

    Args:
        operation: Operation to perform:
            - "list": List all missions (optional: source, enabled_only filters)
            - "get": Get mission details by slug
            - "create": Create a new user mission
            - "update": Update mission configuration
            - "enable": Enable a disabled mission
            - "disable": Disable a mission
            - "run_now": Trigger immediate execution
            - "history": Get execution history for a mission
            - "running": Get currently running executions

        slug: Mission identifier (required for get, update, enable, disable, run_now, history)
        name: Mission name (required for create)
        description: Mission description
        prompt_file: Path to prompt .md file
        prompt_inline: Inline prompt text (alternative to prompt_file)
        schedule_type: 'time', 'cron', or None for triggered
        schedule_cron: Cron expression (e.g., "0 6 * * *")
        schedule_time: Time in HH:MM format (e.g., "06:00")
        schedule_days: Days to run (e.g., ["mon", "tue", "wed"])
        trigger_type: 'file_change', 'calendar_event', 'app_hook'
        trigger_config: Trigger-specific configuration dict
        timeout_minutes: Max execution time (default 60)
        role: Claude role to spawn (default "builder" - cannot be "chief")
        mode: Claude mode (default "mission")
        source: Filter for list: 'core_default', 'custom_app', 'user'
        enabled_only: For list, only return enabled missions
        limit: For history, max records to return

    Returns:
        Dict with operation result

    Examples:
        # List all missions
        mission("list")

        # List only enabled core missions
        mission("list", source="core_default", enabled_only=True)

        # Get a specific mission
        mission("get", slug="autonomous-dev-work")

        # Create a new scheduled mission
        mission("create",
                slug="weekly-review",
                name="Weekly Review",
                description="Sunday planning session",
                schedule_type="cron",
                schedule_cron="0 10 * * 0",
                prompt_file="Desktop/working/weekly-review.md",
                role="deep-work")

        # Run a mission immediately
        mission("run_now", slug="autonomous-dev-work")

        # Disable a mission
        mission("disable", slug="autonomous-dev-work")

        # Get execution history
        mission("history", slug="autonomous-dev-work", limit=10)

        # See what's running
        mission("running")
    """
    service = get_service()
    
    try:
        if operation == "list":
            missions = service.list_missions(
                source=source,
                enabled_only=enabled_only,
            )
            return {
                "success": True,
                "missions": [
                    {
                        "slug": m.slug,
                        "name": m.name,
                        "source": m.source,
                        "role": m.role,
                        "enabled": m.enabled,
                        "schedule_type": m.schedule_type,
                        "schedule_time": m.schedule_time,
                        "trigger_type": m.trigger_type,
                        "next_run": m.next_run,
                        "last_run": m.last_run,
                        "last_status": m.last_status,
                    }
                    for m in missions
                ],
                "count": len(missions),
            }
        
        elif operation == "get":
            if not slug:
                return {"success": False, "error": "slug required for get operation"}
            
            m = service.get_mission(slug)
            if not m:
                return {"success": False, "error": f"Mission '{slug}' not found"}
            
            return {
                "success": True,
                "mission": {
                    "id": m.id,
                    "slug": m.slug,
                    "name": m.name,
                    "description": m.description,
                    "source": m.source,
                    "app_slug": m.app_slug,
                    "prompt_type": m.prompt_type,
                    "prompt_file": m.prompt_file,
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
                },
            }
        
        elif operation == "create":
            if not slug:
                return {"success": False, "error": "slug required for create operation"}
            if not name:
                return {"success": False, "error": "name required for create operation"}
            if not prompt_file and not prompt_inline:
                return {"success": False, "error": "prompt_file or prompt_inline required"}
            
            # Check if exists
            if service.get_mission(slug):
                return {"success": False, "error": f"Mission '{slug}' already exists"}
            
            m = service.create_mission(
                name=name,
                slug=slug,
                source="user",  # MCP can only create user missions
                description=description,
                prompt_type="inline" if prompt_inline else "file",
                prompt_file=prompt_file,
                prompt_inline=prompt_inline,
                schedule_type=schedule_type,
                schedule_cron=schedule_cron,
                schedule_time=schedule_time,
                schedule_days=schedule_days,
                trigger_type=trigger_type,
                trigger_config=trigger_config,
                timeout_minutes=timeout_minutes or 60,
                role=role or "builder",  # Cannot be "chief" - Chief work handled by duties
                mode=mode or "mission",
            )
            
            return {
                "success": True,
                "message": f"Mission '{slug}' created",
                "mission": {
                    "slug": m.slug,
                    "name": m.name,
                    "next_run": m.next_run,
                },
            }
        
        elif operation == "update":
            if not slug:
                return {"success": False, "error": "slug required for update operation"}
            
            m = service.get_mission(slug)
            if not m:
                return {"success": False, "error": f"Mission '{slug}' not found"}
            
            # Build updates from provided args
            updates = {}
            if name is not None:
                updates["name"] = name
            if description is not None:
                updates["description"] = description
            if prompt_file is not None:
                updates["prompt_file"] = prompt_file
            if prompt_inline is not None:
                updates["prompt_inline"] = prompt_inline
            if schedule_type is not None:
                updates["schedule_type"] = schedule_type
            if schedule_cron is not None:
                updates["schedule_cron"] = schedule_cron
            if schedule_time is not None:
                updates["schedule_time"] = schedule_time
            if schedule_days is not None:
                updates["schedule_days"] = schedule_days
            if trigger_type is not None:
                updates["trigger_type"] = trigger_type
            if trigger_config is not None:
                updates["trigger_config"] = trigger_config
            if timeout_minutes is not None:
                updates["timeout_minutes"] = timeout_minutes
            if role is not None:
                updates["role"] = role
            if mode is not None:
                updates["mode"] = mode
            
            if not updates:
                return {"success": False, "error": "No updates provided"}
            
            updated = service.update_mission(slug, **updates)
            return {
                "success": True,
                "message": f"Mission '{slug}' updated",
                "mission": {
                    "slug": updated.slug,
                    "name": updated.name,
                    "next_run": updated.next_run,
                },
            }
        
        elif operation == "enable":
            if not slug:
                return {"success": False, "error": "slug required for enable operation"}
            
            m = service.get_mission(slug)
            if not m:
                return {"success": False, "error": f"Mission '{slug}' not found"}
            
            updated = service.enable_mission(slug)
            return {
                "success": True,
                "message": f"Mission '{slug}' enabled",
                "next_run": updated.next_run,
            }
        
        elif operation == "disable":
            if not slug:
                return {"success": False, "error": "slug required for disable operation"}

            m = service.get_mission(slug)
            if not m:
                return {"success": False, "error": f"Mission '{slug}' not found"}

            service.disable_mission(slug)
            return {
                "success": True,
                "message": f"Mission '{slug}' disabled",
            }
        
        elif operation == "run_now":
            if not slug:
                return {"success": False, "error": "slug required for run_now operation"}
            
            m = service.get_mission(slug)
            if not m:
                return {"success": False, "error": f"Mission '{slug}' not found"}
            
            if not m.enabled:
                return {
                    "success": False,
                    "error": f"Cannot run disabled mission '{slug}'. Enable it first.",
                }
            
            # Create execution record
            execution_id = service.create_execution(
                mission_id=m.id,
                mission_slug=m.slug,
            )
            
            # Set next_run to now so scheduler picks it up immediately
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            service.set_next_run(m.id, now)
            
            return {
                "success": True,
                "message": f"Mission '{slug}' queued for immediate execution",
                "execution_id": execution_id,
            }
        
        elif operation == "history":
            if not slug:
                return {"success": False, "error": "slug required for history operation"}
            
            m = service.get_mission(slug)
            if not m:
                return {"success": False, "error": f"Mission '{slug}' not found"}
            
            executions = service.list_executions(mission_slug=slug, limit=limit)
            
            return {
                "success": True,
                "mission_slug": slug,
                "executions": [
                    {
                        "id": e.id,
                        "started_at": e.started_at,
                        "ended_at": e.ended_at,
                        "status": e.status,
                        "duration_seconds": e.duration_seconds,
                        "output_summary": e.output_summary,
                        "error_message": e.error_message,
                    }
                    for e in executions
                ],
                "count": len(executions),
            }
        
        elif operation == "running":
            executions = service.get_running_executions()
            
            return {
                "success": True,
                "running": [
                    {
                        "id": e.id,
                        "mission_slug": e.mission_slug,
                        "started_at": e.started_at,
                        "session_id": e.session_id,
                    }
                    for e in executions
                ],
                "count": len(executions),
            }
        
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Valid operations: list, get, create, update, enable, disable, run_now, history, running",
            }
    
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"Internal error: {str(e)}"}


__all__ = ['mission', 'set_service']

