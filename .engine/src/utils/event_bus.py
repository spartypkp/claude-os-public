"""
Unified Event Bus - Real-time server→client notifications for Dashboard.

This centralizes ALL real-time events into a single pub/sub system:
- File changes (modified, created, deleted)
- Session lifecycle (started, ended, state changed)
- Worker lifecycle (created, completed, acked)
- Priority changes (created, updated, deleted)

Jan 2026 Architecture Overhaul:
Previously: 33 polling intervals, 200+ API calls/min
Now: 1 SSE stream, server pushes changes as they happen

Usage (Backend - Publishing):
    from utils.event_bus import event_bus

    # When session starts
    await event_bus.publish("session.started", {
        "session_id": "abc123",
        "role": "chief",
        "conversation_id": "conv-xyz"
    })

    # When worker completes
    await event_bus.publish("worker.completed", {
        "worker_id": "def456",
        "status": "complete"
    })

Usage (Backend - SSE Endpoint):
    from utils.event_bus import event_bus

    async def event_stream():
        queue = event_bus.subscribe()
        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield {"event": event.event_type, "data": event.to_json()}
        finally:
            event_bus.unsubscribe(queue)
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set


@dataclass
class SystemEvent:
    """Generic event for any system change."""
    event_type: str  # 'session.started', 'worker.completed', 'file.modified', etc.
    data: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_json(self) -> str:
        """Serialize for SSE data field."""
        return json.dumps({
            "type": self.event_type,
            "data": self.data,
            "timestamp": self.timestamp,
        })


class UnifiedEventBus:
    """
    Async pub/sub for all Dashboard real-time updates.

    Subscribers get asyncio.Queue instances.
    Publishing pushes to all subscriber queues.
    
    Event Types:
        Session:
            - session.started: New session created
            - session.ended: Session terminated
            - session.state: State changed (idle→active→tool)
        
        Worker:
            - worker.created: New worker spawned
            - worker.started: Worker began execution
            - worker.completed: Worker finished (success or failure)
            - worker.acked: Worker acknowledged by user
        
        Priority:
            - priority.created: New priority added
            - priority.updated: Priority modified
            - priority.deleted: Priority removed
            - priority.completed: Priority marked done
        
        File:
            - file.created: New file created
            - file.modified: File content changed
            - file.deleted: File removed
            - file.moved: File renamed/moved
    """

    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    def subscribe(self) -> asyncio.Queue:
        """Register a new subscriber. Returns queue for receiving events."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a subscriber."""
        self._subscribers.discard(queue)

    async def publish(self, event_type: str, data: Dict[str, Any]) -> None:
        """Publish event to all subscribers.
        
        Args:
            event_type: Event type (e.g., 'session.started', 'worker.completed')
            data: Event payload
        """
        event = SystemEvent(event_type=event_type, data=data)
        
        # Copy to avoid modifying set during iteration
        subscribers = list(self._subscribers)
        
        for queue in subscribers:
            try:
                # Non-blocking put - skip slow consumers
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Consumer too slow, drop event for them
                pass

    def publish_sync(self, event_type: str, data: Dict[str, Any]) -> None:
        """Synchronous publish for use in non-async contexts.
        
        Creates an event loop if needed. Use sparingly.
        """
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.publish(event_type, data))
        except RuntimeError:
            # No running loop - create one
            asyncio.run(self.publish(event_type, data))

    @property
    def subscriber_count(self) -> int:
        """Number of active subscribers (for debugging/health checks)."""
        return len(self._subscribers)


# Global singleton
event_bus = UnifiedEventBus()


# === Convenience helpers for common events ===

async def emit_session_started(
    session_id: str,
    role: str,
    conversation_id: Optional[str] = None,
    **extra
) -> None:
    """Emit session started event."""
    await event_bus.publish("session.started", {
        "session_id": session_id,
        "role": role,
        "conversation_id": conversation_id,
        **extra,
    })


async def emit_session_ended(session_id: str, **extra) -> None:
    """Emit session ended event."""
    await event_bus.publish("session.ended", {
        "session_id": session_id,
        **extra,
    })


async def emit_session_state(session_id: str, state: str, **extra) -> None:
    """Emit session state change event."""
    await event_bus.publish("session.state", {
        "session_id": session_id,
        "state": state,
        **extra,
    })


async def emit_worker_created(worker_id: str, **extra) -> None:
    """Emit worker created event."""
    await event_bus.publish("worker.created", {
        "worker_id": worker_id,
        **extra,
    })


async def emit_worker_completed(worker_id: str, status: str, **extra) -> None:
    """Emit worker completed event."""
    await event_bus.publish("worker.completed", {
        "worker_id": worker_id,
        "status": status,
        **extra,
    })


async def emit_worker_acked(worker_id: str, **extra) -> None:
    """Emit worker acknowledged event."""
    await event_bus.publish("worker.acked", {
        "worker_id": worker_id,
        **extra,
    })


async def emit_priority_changed(
    action: str,  # 'created', 'updated', 'deleted', 'completed'
    priority_id: str,
    **extra
) -> None:
    """Emit priority change event."""
    await event_bus.publish(f"priority.{action}", {
        "priority_id": priority_id,
        **extra,
    })


# Re-export for backwards compat with existing file watcher
async def emit_file_changed(
    event_type: str,  # 'created', 'modified', 'deleted', 'moved'
    path: str,
    **extra
) -> None:
    """Emit file change event (for migration from sse_bus)."""
    await event_bus.publish(f"file.{event_type}", {
        "path": path,
        **extra,
    })


# === Email Events ===

async def emit_email_sent(
    email_id: str,
    account: str,
    to: list,
    subject: str,
    **extra
) -> None:
    """Emit email sent event."""
    await event_bus.publish("email.sent", {
        "email_id": email_id,
        "account": account,
        "to": to,
        "subject": subject,
        **extra,
    })


async def emit_email_queued(
    email_id: str,
    account: str,
    send_at: str,
    **extra
) -> None:
    """Emit email queued event."""
    await event_bus.publish("email.queued", {
        "email_id": email_id,
        "account": account,
        "send_at": send_at,
        **extra,
    })


async def emit_email_cancelled(email_id: str, **extra) -> None:
    """Emit email cancelled event."""
    await event_bus.publish("email.cancelled", {
        "email_id": email_id,
        **extra,
    })


async def emit_email_read(
    message_id: str,
    account: str,
    **extra
) -> None:
    """Emit email marked as read event."""
    await event_bus.publish("email.read", {
        "message_id": message_id,
        "account": account,
        **extra,
    })


async def emit_email_flagged(
    message_id: str,
    account: str,
    flagged: bool,
    **extra
) -> None:
    """Emit email flagged/unflagged event."""
    await event_bus.publish("email.flagged", {
        "message_id": message_id,
        "account": account,
        "flagged": flagged,
        **extra,
    })


async def emit_email_deleted(
    message_id: str,
    account: str,
    mailbox: str = "Trash",
    **extra
) -> None:
    """Emit email deleted event."""
    await event_bus.publish("email.deleted", {
        "message_id": message_id,
        "account": account,
        "mailbox": mailbox,
        **extra,
    })


# === Calendar Events ===

async def emit_calendar_created(
    event_id: str,
    calendar_id: str,
    summary: str,
    start_ts: str,
    **extra
) -> None:
    """Emit calendar event created event."""
    await event_bus.publish("calendar.created", {
        "event_id": event_id,
        "calendar_id": calendar_id,
        "summary": summary,
        "start_ts": start_ts,
        **extra,
    })


async def emit_calendar_updated(
    event_id: str,
    calendar_id: str,
    **extra
) -> None:
    """Emit calendar event updated event."""
    await event_bus.publish("calendar.updated", {
        "event_id": event_id,
        "calendar_id": calendar_id,
        **extra,
    })


async def emit_calendar_deleted(
    event_id: str,
    calendar_id: str,
    **extra
) -> None:
    """Emit calendar event deleted event."""
    await event_bus.publish("calendar.deleted", {
        "event_id": event_id,
        "calendar_id": calendar_id,
        **extra,
    })


# === Contact Events ===

async def emit_contact_created(
    contact_id: str,
    name: str,
    **extra
) -> None:
    """Emit contact created event."""
    await event_bus.publish("contact.created", {
        "contact_id": contact_id,
        "name": name,
        **extra,
    })


async def emit_contact_updated(
    contact_id: str,
    **extra
) -> None:
    """Emit contact updated event."""
    await event_bus.publish("contact.updated", {
        "contact_id": contact_id,
        **extra,
    })


async def emit_contact_deleted(
    contact_id: str,
    **extra
) -> None:
    """Emit contact deleted event."""
    await event_bus.publish("contact.deleted", {
        "contact_id": contact_id,
        **extra,
    })


# === Message Events ===

async def emit_message_sent(
    message_id: str,
    recipient: str,
    **extra
) -> None:
    """Emit message sent event."""
    await event_bus.publish("message.sent", {
        "message_id": message_id,
        "recipient": recipient,
        **extra,
    })


async def emit_message_received(
    message_id: str,
    sender: str,
    **extra
) -> None:
    """Emit message received event."""
    await event_bus.publish("message.received", {
        "message_id": message_id,
        "sender": sender,
        **extra,
    })

