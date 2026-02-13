"""Priorities API - REST endpoints for Dashboard."""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.database import get_db
from core.events import event_bus

router = APIRouter(tags=["priorities"])


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB operations in a thread."""
    import asyncio
    return await asyncio.to_thread(fn, *args, **kwargs)


class CreatePriorityRequest(BaseModel):
    content: str
    level: str = "medium"
    date: Optional[str] = None


class UpdatePriorityRequest(BaseModel):
    content: Optional[str] = None
    level: Optional[str] = None
    completed: Optional[bool] = None


@router.get("")
async def list_priorities(date: Optional[str] = None, include_completed: bool = False):
    """List priorities for a date (defaults to today).

    Returns priorities grouped by level for Dashboard display.
    """
    target_date = date or datetime.now().strftime("%Y-%m-%d")

    def _load_priorities():
        with get_db() as conn:
            sql = """
                SELECT id, content, level, completed, position, created_at
                FROM priorities
                WHERE date = ?
            """
            params = [target_date]

            if not include_completed:
                sql += " AND completed = 0"

            sql += " ORDER BY level, position"

            cursor = conn.execute(sql, params)
            rows = cursor.fetchall()

            # Group by level
            priorities = {"critical": [], "medium": [], "low": []}
            for row in rows:
                priorities[row["level"]].append({
                    "id": row["id"],
                    "content": row["content"],
                    "completed": bool(row["completed"]),
                    "position": row["position"],
                    "created_at": row["created_at"],
                })

            total = sum(len(p) for p in priorities.values())
            return priorities, total

    priorities, total = await _run_blocking(_load_priorities)

    return {
        "date": target_date,
        "priorities": priorities,
        "count": total,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.post("")
async def create_priority(request: CreatePriorityRequest):
    """Create a new priority."""
    if request.level not in ('critical', 'medium', 'low'):
        raise HTTPException(status_code=400, detail=f"Invalid level '{request.level}'")

    target_date = request.date or datetime.now().strftime("%Y-%m-%d")
    priority_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    def _create_priority():
        with get_db() as conn:
            # Get next position for this date+level
            cursor = conn.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM priorities WHERE date = ? AND level = ?",
                (target_date, request.level)
            )
            position = cursor.fetchone()[0]

            conn.execute("""
                INSERT INTO priorities (id, date, content, level, completed, position, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?, ?)
            """, (priority_id, target_date, request.content, request.level, position, now, now))
            conn.commit()
            return position

    position = await _run_blocking(_create_priority)

    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("priority.created", {
        "id": priority_id,
        "content": request.content,
        "level": request.level,
        "date": target_date,
    })

    return {
        "success": True,
        "id": priority_id,
        "date": target_date,
        "level": request.level,
        "position": position
    }


@router.put("/{priority_id}")
async def update_priority(priority_id: str, request: UpdatePriorityRequest):
    """Update a priority."""
    if request.level is not None and request.level not in ('critical', 'medium', 'low'):
        raise HTTPException(status_code=400, detail=f"Invalid level '{request.level}'")

    def _update_priority():
        with get_db() as conn:
            # Check priority exists
            cursor = conn.execute("SELECT id, date, level FROM priorities WHERE id = ?", (priority_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Priority '{priority_id}' not found")

            updates = []
            values = []
            now = datetime.now(timezone.utc).isoformat()

            if request.content is not None:
                updates.append("content = ?")
                values.append(request.content)
            if request.level is not None:
                updates.append("level = ?")
                values.append(request.level)
                # Reset position when level changes
                cursor = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM priorities WHERE date = ? AND level = ?",
                    (row["date"], request.level)
                )
                new_position = cursor.fetchone()[0]
                updates.append("position = ?")
                values.append(new_position)
            if request.completed is not None:
                updates.append("completed = ?")
                values.append(1 if request.completed else 0)
                if request.completed:
                    updates.append("completed_at = ?")
                    values.append(now)
                else:
                    updates.append("completed_at = NULL")

            if not updates:
                raise HTTPException(status_code=400, detail="No fields to update")

            updates.append("updated_at = ?")
            values.append(now)
            values.append(priority_id)

            sql = f"UPDATE priorities SET {', '.join(updates)} WHERE id = ?"
            conn.execute(sql, tuple(values))
            conn.commit()

    await _run_blocking(_update_priority)

    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("priority.updated", {"id": priority_id})

    return {"success": True, "id": priority_id}


@router.post("/{priority_id}/complete")
async def complete_priority(priority_id: str):
    """Mark a priority as completed."""
    now = datetime.now(timezone.utc).isoformat()

    def _complete_priority():
        with get_db() as conn:
            cursor = conn.execute("SELECT id FROM priorities WHERE id = ?", (priority_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail=f"Priority '{priority_id}' not found")

            conn.execute("""
                UPDATE priorities
                SET completed = 1, completed_at = ?, updated_at = ?
                WHERE id = ?
            """, (now, now, priority_id))
            conn.commit()

    await _run_blocking(_complete_priority)

    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("priority.completed", {"id": priority_id})

    return {"success": True, "id": priority_id}


@router.delete("/{priority_id}")
async def delete_priority(priority_id: str):
    """Delete a priority."""
    def _delete_priority():
        with get_db() as conn:
            cursor = conn.execute("SELECT id FROM priorities WHERE id = ?", (priority_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail=f"Priority '{priority_id}' not found")

            conn.execute("DELETE FROM priorities WHERE id = ?", (priority_id,))
            conn.commit()

    await _run_blocking(_delete_priority)

    # Emit SSE event for Dashboard real-time update
    await event_bus.publish("priority.deleted", {"id": priority_id})

    return {"success": True}
