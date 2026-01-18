"""Context WebSocket and HTTP endpoints for real-time events.

Handles real-time context events from Claude Code to the dashboard:
- Contact mentions
- Calendar focus
- File references
- Attention alerts
- Stage updates
"""
import json
import time
import uuid
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter()

# Track connected WebSocket clients
context_clients: Set[WebSocket] = set()


class ContextEvent(BaseModel):
    type: str
    data: Dict = {}


async def broadcast_context_event(event: dict):
    """Broadcast context event to all connected WebSocket clients."""
    message = json.dumps(event)
    dead_clients = set()

    for client in context_clients:
        try:
            await client.send_text(message)
        except Exception:
            dead_clients.add(client)

    # Clean up dead clients
    for client in dead_clients:
        context_clients.discard(client)


@router.websocket("")
async def context_websocket(websocket: WebSocket):
    """WebSocket for real-time context events from Claude Code.

    Receives JSON messages with event type and data:
    - contact_mention: Show contact card in context panel
    - calendar_focus: Highlight a time range
    - file_reference: Show file preview
    - attention: Pulse a section
    - stage_update: Notify portal of new staged content
    """
    await websocket.accept()
    context_clients.add(websocket)

    try:
        while True:
            # Receive message from this client
            message = await websocket.receive_text()

            try:
                event = json.loads(message)
                if isinstance(event, dict) and 'type' in event:
                    await broadcast_context_event(event)
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    finally:
        context_clients.discard(websocket)


@router.post("/send")
async def send_context_event(event: ContextEvent):
    """POST endpoint for Claude to push context events.

    Body: {
        "type": "contact_mention" | "calendar_focus" | "file_reference" | "attention" | "stage_update",
        "data": { ... event-specific data ... }
    }
    """
    full_event = {
        "id": str(uuid.uuid4())[:8],
        "type": event.type,
        "timestamp": int(time.time() * 1000),
        "data": event.data
    }

    await broadcast_context_event(full_event)

    return {
        "success": True,
        "clients_notified": len(context_clients)
    }


@router.get("/test")
async def test_context():
    """Test endpoint to verify WebSocket is working."""
    test_event = {
        "id": str(uuid.uuid4())[:8],
        "type": "attention",
        "timestamp": int(time.time() * 1000),
        "data": {
            "message": "WebSocket test event",
            "level": "info"
        }
    }

    await broadcast_context_event(test_event)

    return {
        "success": True,
        "message": "Test event sent",
        "clients_notified": len(context_clients)
    }
