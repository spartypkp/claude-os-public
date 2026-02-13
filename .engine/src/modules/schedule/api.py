"""Schedule API - REST endpoints bridging MCP tool to CronScheduler."""
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["schedule"])


def _get_scheduler():
    """Get the scheduler from the backend process."""
    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    if not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not running")
    return scheduler


class AddEntryRequest(BaseModel):
    expression: str
    action: str
    payload: str
    critical: bool = False


@router.get("")
async def list_entries():
    """List all schedule entries."""
    scheduler = _get_scheduler()
    entries = await asyncio.to_thread(scheduler.list_entries)
    return {"success": True, "entries": entries, "count": len(entries)}


@router.post("")
async def add_entry(request: AddEntryRequest):
    """Add a schedule entry."""
    scheduler = _get_scheduler()
    try:
        entry_id = await asyncio.to_thread(
            scheduler.add_entry,
            request.expression, request.action, request.payload,
            critical=request.critical,
        )
        return {"success": True, "entry_id": entry_id, "message": "Entry added to SCHEDULE.md"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{entry_id}")
async def remove_entry(entry_id: str):
    """Remove a schedule entry."""
    scheduler = _get_scheduler()
    removed = await asyncio.to_thread(scheduler.remove_entry, entry_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Entry {entry_id} not found")
    return {"success": True, "message": f"Entry {entry_id} removed"}


@router.post("/{entry_id}/enable")
async def enable_entry(entry_id: str):
    """Enable a schedule entry."""
    scheduler = _get_scheduler()
    ok = await asyncio.to_thread(scheduler.set_enabled, entry_id, True)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Entry {entry_id} not found")
    return {"success": True, "message": f"Entry {entry_id} enabled"}


@router.post("/{entry_id}/disable")
async def disable_entry(entry_id: str):
    """Disable a schedule entry."""
    scheduler = _get_scheduler()
    ok = await asyncio.to_thread(scheduler.set_enabled, entry_id, False)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Entry {entry_id} not found")
    return {"success": True, "message": f"Entry {entry_id} disabled"}


@router.get("/history")
async def get_history(limit: int = 20):
    """Get schedule execution history."""
    scheduler = _get_scheduler()
    history = await asyncio.to_thread(scheduler.get_history, limit)
    return {"success": True, "history": history, "count": len(history)}
