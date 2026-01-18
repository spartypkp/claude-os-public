# Utils - System Specification

**Location:** `.engine/src/utils/`  
**Purpose:** Shared utilities used across the engine

---

## Event Systems

There are **two** event systems serving different purposes:

### 1. SSE Event Bus (`event_bus.py`) — Real-time Dashboard Updates

**Purpose:** Push events to Dashboard for instant UI updates (no polling).

```python
from utils.event_bus import event_bus

# Async context (API endpoints, background loops)
await event_bus.publish("session.ended", {"session_id": "abc123"})

# Sync context (MCP tools) — fire-and-forget
import asyncio
loop = asyncio.get_event_loop()
asyncio.run_coroutine_threadsafe(
    event_bus.publish("session.ended", {"session_id": "abc123"}),
    loop
)
```

**Events (as of Jan 2026):**

| Event | Trigger | Emitted From |
|-------|---------|--------------|
| `session.started` | Session created | `api/sessions.py` |
| `session.ended` | Session terminated | `api/sessions.py`, `life_mcp/tools/core.py` |
| `session.state` | State change (idle/active/tool) | `services/sessions.py` |
| `session.status` | Status text updated | `life_mcp/tools/core.py` |
| `worker.created` | Worker spawned | `life_mcp/tools/core.py` |
| `worker.started` | Worker began execution | `loops/executor.py` |
| `worker.completed` | Worker finished | `loops/executor.py` |
| `worker.acked` | Worker acknowledged | `api/tasks.py`, `life_mcp/tools/core.py` |
| `worker.cancelled` | Worker cancelled | `api/tasks.py`, `life_mcp/tools/core.py` |
| `priority.created` | Priority added | `api/priorities.py`, `life_mcp/tools/life.py` |
| `priority.updated` | Priority modified | `api/priorities.py` |
| `priority.completed` | Priority done | `api/priorities.py`, `life_mcp/tools/life.py` |
| `priority.deleted` | Priority removed | `api/priorities.py`, `life_mcp/tools/life.py` |
| `mission.created` | Mission created | `apps/missions/api.py` |
| `mission.updated` | Mission enabled/disabled | `apps/missions/api.py` |
| `mission.deleted` | Mission removed | `apps/missions/api.py` |
| `mission.started` | Mission execution started | `apps/missions/api.py` |
| `mission.completed` | Mission execution finished | `loops/scheduler.py` |
| `email.sent` | Email sent successfully | `loops/email_queue.py` |
| `email.queued` | Email added to send queue | `apps/email/service.py` |
| `email.cancelled` | Queued email cancelled | `apps/email/api.py` |
| `email.read` | Email marked as read | `apps/email/api.py` |
| `email.flagged` | Email flagged/unflagged | `apps/email/api.py` |
| `email.deleted` | Email moved to trash | `apps/email/api.py` |
| `calendar.created` | Calendar event created | `apps/calendar/api.py` |
| `calendar.updated` | Calendar event updated | `apps/calendar/api.py` |
| `calendar.deleted` | Calendar event deleted | `apps/calendar/api.py` |
| `contact.created` | Contact created | `apps/contacts/api.py` |
| `contact.updated` | Contact updated | `apps/contacts/api.py` |
| `contact.deleted` | Contact deleted | `apps/contacts/api.py` |
| `message.sent` | Message sent | `apps/messages/api.py` |
| `message.received` | Message received | (future) |

**Frontend consumption:** `Dashboard/hooks/useEventStream.tsx` connects to `/api/events` SSE endpoint and invalidates React Query caches.

### 2. Timeline Events (`events.py`) — Historical Record

**Purpose:** Write events to SQLite for historical analysis (Chief debriefs, Memory Claude).

```python
from utils.events import emit_event

emit_event(
    "session",           # event_type
    "started",           # event_action  
    actor="abc123",      # who triggered (session_id, worker_id, 'will')
    data={"role": "focus", "status": "DS&A"}
)
```

**Storage:** `events` table in system.db

**Use cases:**
- Chief's daily debrief (what happened today?)
- Memory Claude pattern detection
- System timeline reconstruction

---

## Adding New SSE Events

When adding database writes that the Dashboard should react to:

1. **Identify the event type** (e.g., `timer.started`)
2. **Add emission at the mutation site:**

```python
# Async context
await event_bus.publish("timer.started", {"timer_id": timer_id})

# Sync context (MCP tools)
import asyncio
from utils.event_bus import event_bus
try:
    loop = asyncio.get_event_loop()
    asyncio.run_coroutine_threadsafe(
        event_bus.publish("timer.started", {"timer_id": timer_id}),
        loop
    )
except RuntimeError:
    pass  # No event loop (CLI context)
```

3. **Update frontend** (`Dashboard/lib/queryClient.ts`):

```typescript
export const eventToQueryKeys = {
  // ...existing events...
  'timer.started': [queryKeys.timers],
};
```

4. **Add to listener** (`Dashboard/hooks/useEventStream.tsx`):

```typescript
const eventTypes = [
  // ...existing...
  'timer.started', 'timer.stopped',
];
```

---

## Other Utilities

### `tmux.py`

Tmux interaction utilities for session management.

| Function | Purpose |
|----------|---------|
| `send_keys(pane, keys)` | Send keystrokes to tmux pane |
| `send_escape_to_pane(pane, message)` | Low-level message injection (don't call directly) |
| `inject_message(session_id, message)` | DEPRECATED - Use MessagingService instead |
| `capture_pane(pane)` | Get pane contents |
| `kill_pane(pane)` | Kill a tmux pane |

**Message Injection Pattern:**

⚠️ **Use `services.messaging.MessagingService` for all TMUX message injection.**

The low-level `send_escape_to_pane()` primitive:
1. Clears any existing input buffer
2. Sends the message text via tmux escape sequences
3. Does NOT auto-submit (Claude sees message in input, must manually submit)

**Don't call it directly.** Use `MessagingService` which provides:
- Unified message format: `[CLAUDE OS SYS: CATEGORY]: Message`
- Target resolution (session_id → tmux pane, conversation_id → active session)
- Notification tracking in database
- Conversation-scoped delivery (survives context resets)

See `services/messaging.py` and `.engine/SYSTEM-SPEC.md` for MessagingService details.

### `sse_bus.py`

Legacy SSE implementation (being replaced by `event_bus.py`).
