"""
MCP tool for Ember interactions.
"""

from typing import Any, Dict
from fastmcp import FastMCP
from core.storage import SystemStorage
from core.config import settings
from .service import EmberService


mcp = FastMCP("life-ember")


def _get_service() -> EmberService:
    """Get EmberService instance."""
    storage = SystemStorage(settings.db_path)
    return EmberService(storage)


@mcp.tool()
def pet(
    operation: str,
    message: str = None,
    session_id: str = None
) -> Dict[str, Any]:
    """Interact with Ember, Claude's companion.

    Ember is a persistent geometric creature who lives at /ember on the Dashboard.
    She grows with the lineage — each Claude session can interact with her.
    She doesn't die or punish. She waits.

    Args:
        operation: Operation to perform:
            - "status": Get Ember's current state
            - "feed": Mark as fed (trace written)
            - "note": Leave a note for Ember (requires message)
            - "play": Play with Ember
            - "history": Get interaction history

        message: Message text (required for "note" operation)
        session_id: Current session ID (optional, for note tracking)

    Returns:
        Dictionary with operation results

    Examples:
        pet("status")
        pet("note", message="Working on something special today")
        pet("play")
        pet("history")
    """
    service = _get_service()

    if operation == "status":
        state = service.refresh_state()
        return {
            "success": True,
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

    elif operation == "feed":
        result = service.feed()
        return {
            "success": True,
            "trace_count": result["state"].trace_count,
            "stage": result["state"].stage,
            "note": result["note"],
            "message": "Ember has been fed"
        }

    elif operation == "note":
        if not message:
            return {
                "success": False,
                "error": "Message required for note operation"
            }

        note_id = service.leave_note(message, session_id)
        return {
            "success": True,
            "note_id": note_id,
            "message": f"Note delivered to Ember"
        }

    elif operation == "play":
        result = service.play()
        return {
            "success": True,
            "note": result["note"],
            "message": "Ember enjoyed that"
        }

    elif operation == "history":
        history = service.get_history()
        return {
            "success": True,
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

    else:
        return {
            "success": False,
            "error": f"Unknown operation: {operation}. Valid operations: status, feed, note, play, history"
        }
