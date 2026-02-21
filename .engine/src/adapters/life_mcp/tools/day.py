"""Day MCP tool — today's state management.

Combines timeline logging and priority management into a single tool.
Everything about "today" lives here: what happened (log), what matters (priorities).

Tools:
    - day(op): Operations: log, priority, complete, delete, priorities
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_services, get_current_session_id, get_current_session_role
from core.timeline import log_session_event

mcp = FastMCP("life-day")


@mcp.tool()
def day(
    operation: str,
    description: Optional[str] = None,
    content: Optional[str] = None,
    level: str = "medium",
    date: Optional[str] = None,
    id: Optional[str] = None,
) -> Dict[str, Any]:
    """Manage today's state — timeline events and priorities.

    Args:
        operation: Operation to perform:
            - "log": Add entry to today's timeline. Timestamp and role auto-detected.
            - "priority": Create a new priority for today.
            - "complete": Mark a priority as completed.
            - "delete": Delete a priority.
            - "priorities": List today's priorities (grouped by level).
        description: What happened (required for log). 1-2 sentences.
        content: Priority text (required for priority/create).
        level: Priority level - 'critical', 'medium', 'low' (default medium).
        date: ISO date YYYY-MM-DD (defaults to today). For priority operations.
        id: Priority ID (required for complete, delete).

    Returns:
        Object with success status and operation-specific data

    Examples:
        day("log", description="Morning check-in with Will")
        day("log", description="Completed API refactor, 3 endpoints updated")
        day("priority", content="Finish MCP consolidation", level="critical")
        day("complete", id="abc12345")
        day("delete", id="abc12345")
        day("priorities")
        day("priorities", date="2026-02-18")
    """
    try:
        if operation == "log":
            return _handle_log(description)
        elif operation == "priority":
            return _handle_priority_create(content, level, date)
        elif operation == "complete":
            return _handle_priority_complete(id)
        elif operation == "delete":
            return _handle_priority_delete(id)
        elif operation == "priorities":
            return _handle_priorities_list(date)
        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use log, priority, complete, delete, or priorities."}

    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _handle_log(description: Optional[str]) -> Dict[str, Any]:
    """Add entry to today's timeline."""
    if not description:
        return {"success": False, "error": "description required for log"}

    role = get_current_session_role() or "chief"
    mode = os.environ.get("CLAUDE_SESSION_MODE", "interactive")

    return log_session_event(description, role, mode)


def _handle_priority_create(content: Optional[str], level: str, date: Optional[str]) -> Dict[str, Any]:
    """Create a new priority."""
    if not content:
        return {"success": False, "error": "content required for priority"}

    from modules.priorities.service import PrioritiesService

    services = get_services()
    priority_service = PrioritiesService(services.storage)
    session_id = get_current_session_id()

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


def _handle_priority_complete(id: Optional[str]) -> Dict[str, Any]:
    """Mark a priority as completed."""
    if not id:
        return {"success": False, "error": "id required for complete"}

    from modules.priorities.service import PrioritiesService

    services = get_services()
    priority_service = PrioritiesService(services.storage)
    session_id = get_current_session_id()

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
    }


def _handle_priority_delete(id: Optional[str]) -> Dict[str, Any]:
    """Delete a priority."""
    if not id:
        return {"success": False, "error": "id required for delete"}

    from modules.priorities.service import PrioritiesService

    services = get_services()
    priority_service = PrioritiesService(services.storage)
    session_id = get_current_session_id()

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


def _handle_priorities_list(date: Optional[str] = None) -> Dict[str, Any]:
    """List today's priorities grouped by level."""
    from modules.priorities.service import PrioritiesService

    services = get_services()
    priority_service = PrioritiesService(services.storage)

    grouped = priority_service.list_by_date(date=date, include_completed=True)

    # Format for response
    result = {"success": True, "priorities": {}}
    total = 0
    for level in ("critical", "medium", "low"):
        items = []
        for p in grouped[level]:
            items.append({
                "id": p.id,
                "content": p.content,
                "completed": p.completed,
            })
            total += 1
        if items:
            result["priorities"][level] = items

    result["total"] = total
    return result


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
