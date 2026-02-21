"""
FastAPI routes for Ember.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.storage import SystemStorage
from core.config import settings
from .service import EmberService


router = APIRouter(prefix="/api/ember", tags=["ember"])


class NoteRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


def get_service() -> EmberService:
    """Get EmberService instance."""
    storage = SystemStorage(settings.db_path)
    return EmberService(storage)


@router.get("/state")
async def get_state():
    """Get Ember's current state."""
    try:
        service = get_service()
        state = service.refresh_state()

        return {
            "name": state.name,
            "trace_count": state.trace_count,
            "stage": state.stage,
            "stage_description": state.stage_description,
            "mood": state.mood,
            "mood_color": state.mood_color,
            "last_fed": state.last_fed.isoformat() if state.last_fed else None,
            "last_interaction": state.last_interaction.isoformat() if state.last_interaction else None,
            "last_note": state.last_note,
            "created_at": state.created_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_history():
    """Get Ember's interaction history."""
    try:
        service = get_service()
        history = service.get_history()

        return {
            "state": {
                "trace_count": history["state"].trace_count,
                "stage": history["state"].stage,
                "mood": history["state"].mood
            },
            "notes": [
                {
                    "direction": n.direction,
                    "message": n.message,
                    "created_at": n.created_at.isoformat()
                }
                for n in history["notes"]
            ],
            "mood_history": [
                {
                    "mood": m.mood,
                    "color": m.color,
                    "trigger": m.trigger,
                    "recorded_at": m.recorded_at.isoformat()
                }
                for m in history["mood_history"]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/note")
async def submit_note(request: NoteRequest):
    """Submit a note to Ember."""
    try:
        service = get_service()
        note_id = service.leave_note(request.message, request.session_id)

        return {
            "success": True,
            "note_id": note_id,
            "message": "Note delivered to Ember"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/play")
async def play():
    """Play with Ember."""
    try:
        service = get_service()
        result = service.play()

        return {
            "success": True,
            "note": result["note"],
            "message": "Ember enjoyed that"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
