# === CUSTOM APP PATTERN ===
# api.py exposes REST endpoints that the Dashboard UI calls.
# It uses FastAPI's APIRouter and runs blocking DB operations in threads.
# The Dashboard fetches from http://localhost:5001/api/{app-name}/.

"""Reading List API - REST endpoints for Dashboard."""

from __future__ import annotations

import asyncio
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .service import ReadingListService

router = APIRouter(tags=["reading-list"])


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# === Request Models ===

class AddItemRequest(BaseModel):
    title: str
    author: Optional[str] = None
    type: str = "book"
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class UpdateItemRequest(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    status: Optional[str] = None
    rating: Optional[int] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


# === Endpoints ===

@router.get("")
async def list_items(
    status: Optional[str] = None,
    type: Optional[str] = None,
    tag: Optional[str] = None,
):
    """List reading list items with optional filters."""
    service = ReadingListService()
    items = await _run_blocking(service.list, status=status, type=type, tag=tag)
    return {"items": items, "count": len(items)}


@router.post("")
async def add_item(request: AddItemRequest):
    """Add a new item to the reading list."""
    service = ReadingListService()
    try:
        item = await _run_blocking(
            service.add,
            title=request.title,
            author=request.author,
            type=request.type,
            tags=request.tags,
            notes=request.notes,
        )
        return {"success": True, "item": item}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{item_id}")
async def update_item(item_id: str, request: UpdateItemRequest):
    """Update a reading list item."""
    service = ReadingListService()
    try:
        item = await _run_blocking(
            service.update,
            item_id=item_id,
            title=request.title,
            author=request.author,
            status=request.status,
            rating=request.rating,
            notes=request.notes,
            tags=request.tags,
        )
        if not item:
            raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found")
        return {"success": True, "item": item}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{item_id}")
async def remove_item(item_id: str):
    """Remove an item from the reading list."""
    service = ReadingListService()
    deleted = await _run_blocking(service.remove, item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found")
    return {"success": True}


@router.get("/stats")
async def get_stats():
    """Get reading statistics."""
    service = ReadingListService()
    stats = await _run_blocking(service.stats)
    return stats
