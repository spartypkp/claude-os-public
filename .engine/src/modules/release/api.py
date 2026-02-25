"""Release API - endpoints for the Release Dashboard app."""
import logging
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, HTTPException

from .service import ReleaseService

router = APIRouter(tags=["release"])
logger = logging.getLogger(__name__)

_service = None


def get_service() -> ReleaseService:
    global _service
    if _service is None:
        _service = ReleaseService()
    return _service


@router.get("/pending")
async def list_pending():
    """List all pending features."""
    service = get_service()
    features = service.list_pending()
    return {"items": [asdict(f) for f in features]}


@router.get("/pending/{slug}")
async def get_feature(slug: str):
    """Get a single pending feature by slug."""
    service = get_service()
    feature = service.get_feature(slug)
    if not feature:
        raise HTTPException(status_code=404, detail=f"Feature '{slug}' not found")
    return asdict(feature)


@router.post("/pending/{slug}/synced")
async def mark_synced(slug: str):
    """Remove a feature from pending (mark as synced)."""
    service = get_service()
    feature = service.get_feature(slug)
    if not feature:
        raise HTTPException(status_code=404, detail=f"Feature '{slug}' not found")

    success = service.mark_synced(slug)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to remove feature")
    return {"success": True}


@router.get("/history")
async def list_history():
    """List all completed syncs."""
    service = get_service()
    entries = service.list_history()
    return {"items": [asdict(e) for e in entries]}


@router.get("/stats")
async def get_stats():
    """Get release pipeline summary stats."""
    service = get_service()
    return service.get_stats()
