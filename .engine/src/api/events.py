"""
Unified Events SSE Endpoint - Single real-time stream for Dashboard.

Jan 2026 Architecture Overhaul:
This replaces 33 polling intervals with 1 persistent SSE connection.

Client connects once, receives ALL system events:
- session.started, session.ended, session.state
- worker.created, worker.completed, worker.acked
- priority.created, priority.updated, priority.completed, priority.deleted
- file.created, file.modified, file.deleted, file.moved

Usage (Frontend):
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (e) => {
        const event = JSON.parse(e.data);
        // Invalidate React Query cache based on event.type
        if (event.type.startsWith('session.')) {
            queryClient.invalidateQueries(['sessions']);
        }
    };
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from utils.event_bus import event_bus

router = APIRouter()


@router.get("")
async def stream_events():
    """
    Unified SSE stream for all Dashboard real-time updates.
    
    Events:
        - session.started: {"session_id", "role", "conversation_id"}
        - session.ended: {"session_id"}
        - session.state: {"session_id", "state"}
        - worker.created: {"worker_id", "type", "session_id"}
        - worker.completed: {"worker_id", "status"}
        - worker.acked: {"worker_id"}
        - priority.created: {"priority_id", "content", "level"}
        - priority.updated: {"priority_id"}
        - priority.completed: {"priority_id"}
        - priority.deleted: {"priority_id"}
        - file.modified: {"path", "mtime"}
        - file.created: {"path", "mtime"}
        - file.deleted: {"path"}
        - file.moved: {"path", "dest_path"}
    
    Ping every 15s keeps connection alive.
    """
    
    async def event_generator():
        queue = event_bus.subscribe()
        
        try:
            # Send connection established event
            yield {
                "event": "connected",
                "data": json.dumps({
                    "type": "connected",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "subscriber_count": event_bus.subscriber_count,
                }),
            }
            
            while True:
                try:
                    # Wait for event with timeout (allows graceful cleanup)
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    
                    yield {
                        "event": event.event_type,
                        "data": event.to_json(),
                    }
                    
                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield {
                        "event": "ping",
                        "data": json.dumps({
                            "type": "ping",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }),
                    }
                    
        except asyncio.CancelledError:
            pass
        except GeneratorExit:
            pass
        finally:
            event_bus.unsubscribe(queue)
    
    return EventSourceResponse(event_generator(), ping=15)


@router.get("/health")
async def events_health():
    """Health check for event bus."""
    return {
        "status": "ok",
        "subscriber_count": event_bus.subscriber_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

