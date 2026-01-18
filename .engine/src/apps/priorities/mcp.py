"""Priorities MCP tools - priority() consolidated tool."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

# Pacific timezone for logging
PACIFIC = ZoneInfo("America/Los_Angeles")

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


def priority(
    operation: str,
    content: Optional[str] = None,
    level: str = "medium",
    date: Optional[str] = None,
    id: Optional[str] = None,
) -> Dict[str, Any]:
    """Priority management for today's tasks.

    Args:
        operation: Operation - 'create', 'delete', 'complete'
        content: Priority text (required for create)
        level: Priority level - 'critical', 'medium', 'low' (default medium)
        date: ISO date YYYY-MM-DD (defaults to today)
        id: Priority ID (required for delete, complete)

    Returns:
        Object with success status and priority data

    Examples:
        priority("create", content="Finish MCP consolidation", level="critical")
        priority("complete", id="abc12345")
        priority("delete", id="abc12345")
    """
    try:
        service = get_service()
        
        if operation == "create":
            if not content:
                return {"success": False, "error": "content required for create"}
            if level not in ('critical', 'medium', 'low'):
                return {"success": False, "error": f"Invalid level '{level}'. Must be critical, medium, or low."}
            
            p = service.create(
                content=content,
                level=level,
                date=date,
            )

            return {
                "success": True,
                "id": p.id,
                "date": p.date,
                "level": p.level,
            }
        
        elif operation == "delete":
            if not id:
                return {"success": False, "error": "id required for delete"}
            
            p = service.get(id)
            if not p:
                return {"success": False, "error": f"Priority '{id}' not found"}
            
            service.delete(id)
            
            return {"success": True}
        
        elif operation == "complete":
            if not id:
                return {"success": False, "error": "id required for complete"}
            
            p = service.get(id)
            if not p:
                return {"success": False, "error": f"Priority '{id}' not found"}
            
            if p.completed:
                return {"success": False, "error": f"Priority '{id}' already completed"}
            
            service.complete(id)

            return {
                "success": True,
                "id": id,
                "content": p.content,
                "reminder": "✓ Done! Keep momentum.",
            }
        
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use create, delete, or complete.",
            }
    
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}

