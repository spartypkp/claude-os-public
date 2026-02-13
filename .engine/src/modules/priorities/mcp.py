"""Priorities MCP tool - Today's task management."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_services, get_current_session_id
from .service import PrioritiesService

mcp = FastMCP("life-priorities")


@mcp.tool()
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
        services = get_services()
        priority_service = PrioritiesService(services.storage)
        session_id = get_current_session_id()

        if operation == "create":
            if not content:
                return {"success": False, "error": "content required for create"}

            p = priority_service.create(content=content, level=level, date=date)

            # Emit event for audit trail
            from core.event_log import emit_event
            emit_event(
                "priority",
                "created",
                actor=session_id,
                data={"id": p.id, "content": p.content, "level": p.level}
            )

            # Emit SSE event for Dashboard real-time update
            _emit_sse_event("priority.created", {
                "id": p.id,
                "content": p.content,
                "level": p.level,
                "date": p.date,
            })

            return {"success": True, "id": p.id, "date": p.date, "level": p.level}

        elif operation == "delete":
            if not id:
                return {"success": False, "error": "id required for delete"}

            existing = priority_service.get(id)
            if not existing:
                return {"success": False, "error": f"Priority '{id}' not found"}

            deleted = priority_service.delete(id)
            if not deleted:
                return {"success": False, "error": f"Failed to delete priority '{id}'"}

            from core.event_log import emit_event
            emit_event(
                "priority",
                "deleted",
                actor=session_id,
                data={"id": id, "content": existing.content, "level": existing.level}
            )

            _emit_sse_event("priority.deleted", {"id": id})

            return {"success": True}

        elif operation == "complete":
            if not id:
                return {"success": False, "error": "id required for complete"}

            existing = priority_service.get(id)
            if not existing:
                return {"success": False, "error": f"Priority '{id}' not found"}

            if existing.completed:
                return {"success": False, "error": f"Priority '{id}' already completed"}

            p = priority_service.complete(id)

            from core.event_log import emit_event
            emit_event(
                "priority",
                "completed",
                actor=session_id,
                data={"id": id, "content": p.content, "level": p.level}
            )

            _emit_sse_event("priority.completed", {"id": id})

            return {
                "success": True,
                "id": id,
                "content": p.content,
                "reminder": "✓ Done! Keep momentum."
            }

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use create, delete, or complete."}

    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _emit_sse_event(event_type: str, data: dict):
    """Emit SSE event for Dashboard real-time update."""
    import asyncio
    try:
        from core.events import event_bus
        loop = asyncio.get_event_loop()
        asyncio.run_coroutine_threadsafe(
            event_bus.publish(event_type, data),
            loop
        )
    except RuntimeError:
        pass  # No event loop (CLI context)
