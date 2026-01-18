"""Trash API routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Service injection (set by __init__.py)
_service = None


def set_service(service):
    global _service
    _service = service


class TrashRequest(BaseModel):
    path: str


class RestoreRequest(BaseModel):
    dest_path: Optional[str] = None


class EmptyTrashRequest(BaseModel):
    older_than_days: Optional[int] = None


@router.post("/trash")
async def trash_item(request: TrashRequest):
    """Move a file or folder to trash."""
    try:
        return _service.trash(request.path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trash")
async def list_trash():
    """List all items in trash."""
    try:
        return _service.list_trash()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trash/{trash_id}")
async def get_trash_item(trash_id: str):
    """Get info about a specific trashed item."""
    try:
        return _service.get_trash_info(trash_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trash/{trash_id}/restore")
async def restore_item(trash_id: str, request: RestoreRequest = None):
    """Restore an item from trash."""
    try:
        dest_path = request.dest_path if request else None
        return _service.restore(trash_id, dest_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/trash/{trash_id}")
async def permanent_delete_item(trash_id: str):
    """Permanently delete a specific item from trash."""
    try:
        return _service.permanent_delete(trash_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trash/empty")
async def empty_trash(request: EmptyTrashRequest = None):
    """Empty the trash (permanently delete all items)."""
    try:
        older_than_days = request.older_than_days if request else None
        return _service.empty_trash(older_than_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

