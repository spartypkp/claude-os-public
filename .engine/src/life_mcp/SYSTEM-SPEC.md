# Life MCP Server - Specification

**Location:** `.engine/src/life_mcp/`
**Purpose:** Claude's primary interface to the life system. All actions go through MCP.

---

## Architecture

**Modular composition** of tool packages:

```
server.py (composition)
├── tools/core.py      → Core session/task/system tools
└── tools/life.py      → Life management tools
```

**Design principle:** server.py is ONLY composition. Tool logic lives in the tools/ modules or custom apps.

---

## Tool Categories

### Core Tools (`tools/core.py`)

| Tool | Purpose | SSE Events |
|------|---------|------------|
| `team(op)` | Spawn/manage Claude specialist sessions (Chief-only) | `session.ended` (on close) |
| `reset()` | Handoff to fresh session with context (preserves conversation_id) | — |
| `done()` | End session gracefully (notifies Chief in background mode) | `session.ended` |
| `status()` | Update status line in Dashboard | `session.status` |
| `service(op)` | Manage backend/dashboard services | — |
| `mission(op)` | Manage scheduled/triggered missions | — |

**team() Operations:**
- `spawn` — Start new specialist session (role, task, mode)
- `list` — List active team members
- `peek` — View recent output from a session
- `close` — End a team member's session

### Life Tools (`tools/life.py`)

| Tool | Purpose | SSE Events |
|------|---------|------------|
| `contact(op)` | CRUD for contacts | — |
| `priority(op)` | Manage daily priorities | `priority.created`, `priority.completed`, `priority.deleted` |
| `timer(op)` | Start/stop/check timers | — |
| `log()` | Log to TODAY.md | — |
| `remind()` | Create reminder | — |
| `email(op)` | Email operations | — |
| `calendar(op)` | Calendar operations | — |

---

## Configuration

**MCP config:** `.mcp.json` in repo root

```json
{
  "mcpServers": {
    "life": {
      "command": ".engine/src/life_mcp/server.py"
    }
  }
}
```

---

## Helper Functions (`tools/helpers.py`)

Common utilities used across tool modules:

| Function | Purpose |
|----------|---------|
| `get_today_md_path()` | Returns path to Desktop/TODAY.md |
| `get_session_id()` | Get current session ID from env |
| `log_to_today_md()` | Append to TODAY.md sections |
| `log_to_day_arc()` | Log timestamped event to Day Arc |
| `get_db()` | Database connection context manager |
| `REPO_ROOT` | Project root path constant |
| `PACIFIC` | Pacific timezone (ZoneInfo) |

---

## Two Tool Registration Systems

**Important:** There are two parallel systems for MCP tools:

1. **MCP Server (`life_mcp/server.py`)** — Tools registered via `@mcp.tool()` decorator or `mcp.mount()`. These are what Claude Code sees when using the `life` MCP server.

2. **Core App System (`core.register_tool()`)** — Tools registered by apps for Dashboard/API access. These are NOT exposed to MCP.

Currently, the same tools are implemented in both systems (life.py has contact/priority, apps/ has ContactsApp/PrioritiesApp). This duplication exists for backwards compatibility during migration.

---

## Adding New Tools

### To MCP Server (Claude access)

1. **Choose the right module:** `tools/core.py` or `tools/life.py`
2. **Implement the tool function** with `@mcp.tool()` decorator
3. **Update this spec** with the new tool

---

## Conversation Architecture

**Critical architecture detail:** The system uses `conversation_id` (stable) instead of `session_id` (ephemeral) for identity and task tracking.

### Eternal Chief

Chief uses a special eternal `conversation_id` of `"chief"` that persists across days. This provides:
- Continuity for overnight missions (they appear in Chief's history)
- Task ownership that survives context resets
- Single conversation thread for the daily orchestrator

Specialists use unique conversation IDs per task (e.g., `builder-abc12345`).

### Why Conversation-Scoped?

Sessions are ephemeral—context resets create new session IDs. Background tasks spawned in session A must be visible to session B after reset.

**Solution:** Background task tracking uses `conversation_id` (stable) instead of `session_id` (ephemeral).

### Messaging Integration

Task completion notifications use MessagingService (`services/messaging.py`) to deliver notifications to the current active session in the conversation.

This replaced the old hook-based injection system. Benefits:
- Unified TMUX message injection
- Persistent notification tracking (`conversation_notifications` table)
- Survives session resets
- Consistent formatting

## SSE Event Emission

MCP tools that mutate state should emit SSE events for Dashboard real-time updates.

**Pattern for sync MCP tools:**

```python
# After database mutation
import asyncio
from utils.event_bus import event_bus

try:
    loop = asyncio.get_event_loop()
    asyncio.run_coroutine_threadsafe(
        event_bus.publish("event.type", {"key": "value"}),
        loop
    )
except RuntimeError:
    pass  # No event loop (CLI context)
```

See `src/utils/SYSTEM-SPEC.md` for full event documentation.

---

## Related

- **Apple MCP:** `pyapple-mcp` - Calendar, Messages, Mail (separate package)
- **Hooks:** `.claude/hooks/` - Session lifecycle integration
- **Database:** Schema at `.engine/config/schema.sql`
- **Event Bus:** `src/utils/SYSTEM-SPEC.md` - SSE events for Dashboard
- **Session Management:** `src/services/sessions.py` - SessionManager with conversation_id handling
