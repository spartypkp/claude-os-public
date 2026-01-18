"""Worker management endpoints (renamed from tasks, Dec 2025 lifecycle overhaul)."""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db
from config import settings

# Import watcher services for worker lifecycle operations
from services import TaskService, SystemStorage

# Jan 2026: Real-time event bus
from utils.event_bus import event_bus

router = APIRouter()


def _get_task_service():
    """Get TaskService instance for worker lifecycle operations."""
    storage = SystemStorage(settings.db_path)
    return TaskService(storage)


class CreateWorkerRequest(BaseModel):
    type: str
    instructions: str
    execute_at: Optional[str] = None


class SnoozeRequest(BaseModel):
    duration: str = "+1h"


@router.get("/queue")
async def worker_queue():
    """Pending, scheduled, and blocked workers - the invisible queue."""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT
                id,
                task_type,
                COALESCE(attention_title, task_type || ' task') as title,
                status,
                attention_domain as domain,
                params_json,
                execute_at,
                depends_on_json,
                created_at
            FROM workers
            WHERE status = 'pending'
            ORDER BY COALESCE(execute_at, created_at) ASC
        """)

        now = datetime.now(timezone.utc)
        queued = []
        for row in cursor.fetchall():
            task = dict(row)

            # Parse instructions from params_json
            try:
                params = json.loads(task.get("params_json") or "{}")
                task["instructions"] = params.get("instructions", "")
            except json.JSONDecodeError:
                task["instructions"] = ""

            # Parse dependencies
            depends_on = []
            if task.get("depends_on_json"):
                try:
                    depends_on = json.loads(task["depends_on_json"])
                except json.JSONDecodeError:
                    pass
            task["depends_on"] = depends_on

            # Determine queue reason
            if depends_on:
                # Check if dependencies are complete
                dep_cursor = conn.execute("""
                    SELECT id, status FROM workers
                    WHERE id IN ({})
                """.format(",".join("?" * len(depends_on))), depends_on)
                dep_statuses = {r["id"]: r["status"] for r in dep_cursor.fetchall()}
                incomplete_deps = [d for d in depends_on if not dep_statuses.get(d, "").startswith("complete")]
                if incomplete_deps:
                    task["queue_reason"] = "blocked"
                    task["blocked_by"] = incomplete_deps[0][:8]  # Short ID
                else:
                    task["queue_reason"] = "waiting"
            elif task.get("execute_at"):
                try:
                    exec_time = datetime.fromisoformat(task["execute_at"].replace("Z", "+00:00"))
                    if exec_time > now:
                        task["queue_reason"] = "scheduled"
                    else:
                        task["queue_reason"] = "waiting"
                except (ValueError, TypeError):
                    task["queue_reason"] = "waiting"
            else:
                task["queue_reason"] = "waiting"

            # Clean up internal fields and rename for frontend
            del task["params_json"]
            del task["depends_on_json"]
            task["worker_type"] = task.pop("task_type")

            queued.append(task)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workers": queued,
            "total": len(queued)
        }


@router.get("/history")
async def worker_history():
    """Worker history with report summaries."""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT
                id,
                task_type,
                COALESCE(attention_title, task_type || ' task') as title,
                status,
                attention_domain as domain,
                report_summary,
                created_at,
                completed_at
            FROM workers
            WHERE status IN ('complete', 'failed', 'cancelled')
            ORDER BY completed_at DESC
            LIMIT 50
        """)
        workers = []
        for row in cursor.fetchall():
            worker = dict(row)
            # Rename task_type to worker_type for frontend
            worker["worker_type"] = worker.pop("task_type")
            # Phase 3: Status model simplified - no more _unacked/_acked suffixes
            worker["display_status"] = worker["status"]
            workers.append(worker)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workers": workers,
            "total": len(workers)
        }


@router.get("/{worker_id}/report")
async def worker_report(worker_id: str):
    """Get full report for a specific worker, including instructions."""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT
                id,
                task_type,
                COALESCE(attention_title, task_type || ' worker') as title,
                status,
                params_json,
                report_md,
                report_summary,
                created_at,
                completed_at,
                system_log_path
            FROM workers
            WHERE id LIKE ? || '%'
            LIMIT 1
        """, (worker_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Worker not found")

        result = dict(row)

        # Parse instructions from params_json
        try:
            params = json.loads(result.get("params_json") or "{}")
            result["instructions"] = params.get("instructions", "")
        except json.JSONDecodeError:
            result["instructions"] = ""

        # Clean up internal field and rename for frontend
        del result["params_json"]
        result["worker_type"] = result.pop("task_type")

        return result


@router.get("/{worker_id}/output")
async def worker_output(worker_id: str):
    """Get output for a worker - both activity trace and report."""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT
                id,
                status,
                live_output,
                report_md,
                updated_at
            FROM workers
            WHERE id LIKE ? || '%'
            LIMIT 1
        """, (worker_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Worker not found")

        result = dict(row)
        is_complete = result["status"] not in ("pending", "running")

        # Return both activity trace and report separately
        return {
            "id": result["id"],
            "status": result["status"],
            "activity": result.get("live_output") or "",
            "report": result.get("report_md") or "",
            # Legacy field for backwards compat
            "output": result.get("report_md") or result.get("live_output") or "",
            "is_complete": is_complete,
            "updated_at": result["updated_at"]
        }


@router.post("")
async def create_worker(request: CreateWorkerRequest):
    """Create an async worker.

    Note: Worker creation is typically done via MCP tools (worker("create", ...))
    which spawn Claude SDK instances. This endpoint is not fully implemented.
    """
    # TODO: Implement direct worker creation if needed for Dashboard
    # For now, workers are created via MCP tools by Claude sessions
    raise HTTPException(
        status_code=501,
        detail="Worker creation via API not implemented. Use MCP worker() tool instead."
    )


@router.post("/{worker_id}/ack")
async def ack_worker(worker_id: str):
    """Acknowledge a completed worker."""
    try:
        task_service = _get_task_service()
        # Resolve short ID to full ID
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT id FROM workers WHERE id LIKE ? || '%' LIMIT 1",
                (worker_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Worker {worker_id} not found")
            full_id = row["id"]

        result = task_service.acknowledge(full_id)
        
        # Emit event for Dashboard real-time update
        await event_bus.publish("worker.acked", {"worker_id": full_id})
        
        return {"success": True, "message": f"Acknowledged worker {worker_id}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{worker_id}/snooze")
async def snooze_worker(worker_id: str, request: SnoozeRequest):
    """Snooze a worker notification."""
    try:
        task_service = _get_task_service()
        # Resolve short ID to full ID
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT id FROM workers WHERE id LIKE ? || '%' LIMIT 1",
                (worker_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Worker {worker_id} not found")
            full_id = row["id"]

        # Parse duration string (e.g., "+1h", "+30m")
        duration_str = request.duration.lstrip("+")
        if duration_str.endswith("h"):
            delta = timedelta(hours=int(duration_str[:-1]))
        elif duration_str.endswith("m"):
            delta = timedelta(minutes=int(duration_str[:-1]))
        else:
            delta = timedelta(hours=1)  # Default to 1 hour

        notify_after = datetime.now(timezone.utc) + delta
        task_service.snooze(full_id, notify_after=notify_after)
        return {"success": True, "message": f"Snoozed worker {worker_id} until {notify_after.isoformat()}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{worker_id}/cancel")
async def cancel_worker(worker_id: str):
    """Cancel a running worker."""
    try:
        task_service = _get_task_service()
        # Resolve short ID to full ID
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT id FROM workers WHERE id LIKE ? || '%' LIMIT 1",
                (worker_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Worker {worker_id} not found")
            full_id = row["id"]

        task_service.delete(full_id)  # delete() marks as cancelled
        
        # Emit event for Dashboard real-time update
        await event_bus.publish("worker.cancelled", {"worker_id": full_id})
        
        return {"success": True, "message": f"Cancelled worker {worker_id}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
