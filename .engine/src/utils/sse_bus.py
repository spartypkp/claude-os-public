"""
SSE Event Bus - Real-time filesystem notifications for UI sync.

This is separate from events.py (database timeline).
This provides live pub/sub for SSE streaming to frontend.

Usage:
    from utils.sse_bus import sse_bus, FileChangeEvent

    # Subscribe (in SSE endpoint)
    queue = sse_bus.subscribe()
    try:
        while True:
            event = await asyncio.wait_for(queue.get(), timeout=30.0)
            yield {"event": event.event_type, "data": event.to_json()}
    finally:
        sse_bus.unsubscribe(queue)

    # Publish (from watcher)
    await sse_bus.publish(FileChangeEvent(
        event_type="modified",
        path="Desktop/TODAY.md",
        mtime="2026-01-05T10:30:00Z"
    ))
"""

import asyncio
import json
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional, Set


@dataclass
class FileChangeEvent:
    """Event for filesystem changes."""
    event_type: str  # 'created', 'modified', 'deleted', 'moved'
    path: str  # Relative path: 'Desktop/TODAY.md'
    mtime: str  # ISO timestamp
    dest_path: Optional[str] = None  # For moves

    def to_json(self) -> str:
        """Serialize to JSON for SSE data field."""
        data = {
            "path": self.path,
            "mtime": self.mtime,
        }
        if self.dest_path:
            data["dest_path"] = self.dest_path
        return json.dumps(data)


class SSEEventBus:
    """
    Simple async pub/sub for SSE streaming.

    Each subscriber gets their own asyncio.Queue.
    Publishing pushes to all subscriber queues.
    """

    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    def subscribe(self) -> asyncio.Queue:
        """Register a new subscriber. Returns queue for receiving events."""
        queue: asyncio.Queue = asyncio.Queue()
        # Note: Can't use lock here since this might be called from sync context
        # The set operations are atomic enough for our use case
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a subscriber."""
        self._subscribers.discard(queue)

    async def publish(self, event: FileChangeEvent) -> None:
        """Publish event to all subscribers."""
        # Create list to avoid modifying set during iteration
        subscribers = list(self._subscribers)
        for queue in subscribers:
            try:
                # Non-blocking put to avoid slow consumers blocking
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # If queue is full, consumer is too slow - skip this event for them
                pass

    @property
    def subscriber_count(self) -> int:
        """Number of active subscribers (for debugging)."""
        return len(self._subscribers)


# Global singleton instance
sse_bus = SSEEventBus()
