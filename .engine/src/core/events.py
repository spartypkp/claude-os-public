"""
Core Events - Unified real-time event system.

Single pub/sub for all Dashboard real-time updates via SSE.

Usage (Publishing):
    from core.events import event_bus

    await event_bus.publish("session.started", {"session_id": "abc123", "role": "chief"})
    await event_bus.publish("file.modified", {"path": "Desktop/TODAY.md"})

Usage (Subscribing - SSE endpoint):
    from core.events import event_bus

    async def event_stream():
        queue = event_bus.subscribe()
        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield {"event": event.event_type, "data": event.to_json()}
        finally:
            event_bus.unsubscribe(queue)

Event Types:
    Session: session.started, session.ended, session.state
    Worker: worker.created, worker.started, worker.completed, worker.acked
    Priority: priority.created, priority.updated, priority.deleted, priority.completed
    File: file.created, file.modified, file.deleted, file.moved
    Calendar: calendar.created, calendar.updated, calendar.deleted
    Contact: contact.created, contact.updated, contact.deleted
    Email: email.sent, email.queued, email.cancelled, email.read
    Message: message.sent, message.received
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set


@dataclass
class SystemEvent:
    """Generic event for any system change."""
    event_type: str  # e.g., 'session.started', 'file.modified'
    data: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_json(self) -> str:
        """Serialize for SSE data field."""
        return json.dumps({
            "type": self.event_type,
            "data": self.data,
            "timestamp": self.timestamp,
        })


class EventBus:
    """
    Async pub/sub for all Dashboard real-time updates.

    Subscribers get asyncio.Queue instances.
    Publishing pushes to all subscriber queues.
    """

    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        """Register a new subscriber. Returns queue for receiving events."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a subscriber."""
        self._subscribers.discard(queue)

    async def publish(self, event_type: str, data: Dict[str, Any]) -> None:
        """Publish event to all subscribers."""
        event = SystemEvent(event_type=event_type, data=data)

        # Copy to avoid modifying set during iteration
        subscribers = list(self._subscribers)

        for queue in subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Consumer too slow, drop event
                pass

    def publish_sync(self, event_type: str, data: Dict[str, Any]) -> None:
        """Synchronous publish for non-async contexts. Use sparingly."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.publish(event_type, data))
        except RuntimeError:
            asyncio.run(self.publish(event_type, data))

    @property
    def subscriber_count(self) -> int:
        """Number of active subscribers."""
        return len(self._subscribers)


# Global singleton
event_bus = EventBus()


# === Convenience Emitters ===

# Session events
async def emit_session_started(session_id: str, role: str, conversation_id: Optional[str] = None, **extra) -> None:
    await event_bus.publish("session.started", {"session_id": session_id, "role": role, "conversation_id": conversation_id, **extra})

async def emit_session_ended(session_id: str, **extra) -> None:
    await event_bus.publish("session.ended", {"session_id": session_id, **extra})

async def emit_session_state(session_id: str, state: str, **extra) -> None:
    await event_bus.publish("session.state", {"session_id": session_id, "state": state, **extra})


# Worker events
async def emit_worker_created(worker_id: str, **extra) -> None:
    await event_bus.publish("worker.created", {"worker_id": worker_id, **extra})

async def emit_worker_completed(worker_id: str, status: str, **extra) -> None:
    await event_bus.publish("worker.completed", {"worker_id": worker_id, "status": status, **extra})

async def emit_worker_acked(worker_id: str, **extra) -> None:
    await event_bus.publish("worker.acked", {"worker_id": worker_id, **extra})


# Priority events
async def emit_priority_changed(action: str, priority_id: str, **extra) -> None:
    await event_bus.publish(f"priority.{action}", {"priority_id": priority_id, **extra})


# File events
async def emit_file_changed(event_type: str, path: str, **extra) -> None:
    await event_bus.publish(f"file.{event_type}", {"path": path, **extra})


# Calendar events
async def emit_calendar_created(event_id: str, calendar_id: str, summary: str, start_ts: str, **extra) -> None:
    await event_bus.publish("calendar.created", {"event_id": event_id, "calendar_id": calendar_id, "summary": summary, "start_ts": start_ts, **extra})

async def emit_calendar_updated(event_id: str, calendar_id: str, **extra) -> None:
    await event_bus.publish("calendar.updated", {"event_id": event_id, "calendar_id": calendar_id, **extra})

async def emit_calendar_deleted(event_id: str, calendar_id: str, **extra) -> None:
    await event_bus.publish("calendar.deleted", {"event_id": event_id, "calendar_id": calendar_id, **extra})


# Contact events
async def emit_contact_created(contact_id: str, name: str, **extra) -> None:
    await event_bus.publish("contact.created", {"contact_id": contact_id, "name": name, **extra})

async def emit_contact_updated(contact_id: str, **extra) -> None:
    await event_bus.publish("contact.updated", {"contact_id": contact_id, **extra})

async def emit_contact_deleted(contact_id: str, **extra) -> None:
    await event_bus.publish("contact.deleted", {"contact_id": contact_id, **extra})


# Email events
async def emit_email_sent(email_id: str, account: str, to: list, subject: str, **extra) -> None:
    await event_bus.publish("email.sent", {"email_id": email_id, "account": account, "to": to, "subject": subject, **extra})

async def emit_email_queued(email_id: str, account: str, send_at: str, **extra) -> None:
    await event_bus.publish("email.queued", {"email_id": email_id, "account": account, "send_at": send_at, **extra})

async def emit_email_cancelled(email_id: str, **extra) -> None:
    await event_bus.publish("email.cancelled", {"email_id": email_id, **extra})


# Message events
async def emit_message_sent(message_id: str, recipient: str, **extra) -> None:
    await event_bus.publish("message.sent", {"message_id": message_id, "recipient": recipient, **extra})

async def emit_message_received(message_id: str, sender: str, **extra) -> None:
    await event_bus.publish("message.received", {"message_id": message_id, "sender": sender, **extra})


# === Backwards Compatibility ===
# These can be removed once all code is migrated

# For sse_bus.py migration
@dataclass
class FileChangeEvent:
    """Legacy event type for file changes. Use emit_file_changed instead."""
    event_type: str
    path: str
    mtime: str
    dest_path: Optional[str] = None

    def to_json(self) -> str:
        data = {"path": self.path, "mtime": self.mtime}
        if self.dest_path:
            data["dest_path"] = self.dest_path
        return json.dumps(data)


class SSEBusCompat:
    """Compatibility shim for sse_bus usage. Delegates to event_bus."""

    def subscribe(self) -> asyncio.Queue:
        return event_bus.subscribe()

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        event_bus.unsubscribe(queue)

    async def publish(self, event: FileChangeEvent) -> None:
        await emit_file_changed(event.event_type, event.path, mtime=event.mtime, dest_path=event.dest_path)

    @property
    def subscriber_count(self) -> int:
        return event_bus.subscriber_count


# For migration period
sse_bus = SSEBusCompat()
