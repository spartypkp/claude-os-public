# Life System Engine - Specification

**Version:** 4.2
**Status:** Current state as of 2026-01-12

---

## Philosophy

This is the **automation layer** that makes the life management system work invisibly. While the user and Claude interact through markdown files (Desktop/, Workspace/), the backend keeps everything synchronized, runs background work, and provides programmatic interfaces.

**The core promise:** When something changes anywhere in the system, derived views update automatically. When Claude needs to delegate work, it happens in the background. When the system needs attention, it surfaces proactively.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LIFE SYSTEM                                      │
│                                                                          │
│   ┌─────────────┐  ┌─────────────────────────────┐  ┌─────────────┐   │
│   │  Desktop/   │  │ Workspace/                  │  │   Logs/     │   │
│   │  (active)   │  │  (specs + working docs)     │  │ (history)   │   │
│   └──────┬──────┘  └──────────────┬──────────────┘  └─────────────┘   │
│          │                        │                                    │
│          └────────────────────────┘                                    │
│                           │                                              │
│                           ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    .engine/ (this layer)                         │   │
│   │                                                                  │   │
│   │   ┌──────────────────────────────────────────┐                  │   │
│   │   │              Core OS                      │                  │   │
│   │   │    (App Plugin Architecture)              │                  │   │
│   │   └─────────────────┬────────────────────────┘                  │   │
│   │                     │                                            │   │
│   │   ┌─────────────────┼─────────────────┐                         │   │
│   │   │                 │                 │                         │   │
│   │   ▼                 ▼                 ▼                         │   │
│   │ ┌─────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│   │ │  Apps   │  │   Custom    │  │ Background  │                  │   │
│   │ │contacts │  │  job_search │  │   Loops     │                  │   │
│   │ │priority │  │             │  │watcher/exec │                  │   │
│   │ └─────────┘  └─────────────┘  └─────────────┘                  │   │
│   │                     │                                            │   │
│   │          ┌──────────┼──────────┐                                │   │
│   │          │          │          │                                │   │
│   │          ▼          ▼          ▼                                │   │
│   │   ┌───────────┐ ┌───────────┐ ┌───────────┐                    │   │
│   │   │MCP Server │ │  SQLite   │ │  Apple    │                    │   │
│   │   │ (Claude)  │ │ Database  │ │ Calendar  │                    │   │
│   │   └───────────┘ └───────────┘ └───────────┘                    │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
.engine/                      # Automation infrastructure
├── SYSTEM-SPEC.md           # This file (overview)
├── src/                      
│   ├── core/                 # THE OS CORE
│   │   ├── __init__.py       # Core class, AppPlugin, AppManifest
│   │   ├── api.py            # Stable helpers (get_db, log_to_day_arc)
│   │   └── loader.py         # App discovery & loading
│   │
│   ├── apps/                 # CORE APPLICATIONS
│   │   ├── contacts/         # Contact management app
│   │   │   ├── __init__.py   # ContactsApp(AppPlugin)
│   │   │   ├── schema.sql    # Database tables
│   │   │   ├── api.py        # HTTP routes
│   │   │   ├── mcp.py        # MCP tool
│   │   │   └── service.py    # Business logic
│   │   └── priorities/       # Priority management app (same structure)
│   │
│   ├── custom/               # CUSTOM APPLICATIONS
│   │   └── job_search/       # Job search app
│   │       ├── __init__.py   # JobSearchApp(AppPlugin)
│   │       └── tools.py      # MCP tools (mock, dsa, leetcode)
│   │
│   ├── api/                  # Legacy API routes (being migrated to apps/)
│   ├── life_mcp/             # MCP server → see life_mcp/SYSTEM-SPEC.md
│   ├── loops/                # Background async (watcher, executor, scheduler)
│   ├── services/             # Business logic services
│   ├── utils/                # Shared utilities (events, tmux, sse)
│   ├── watcher/              # Filesystem watcher → see watcher/SYSTEM-SPEC.md
│   ├── cli/                  # CLI tools (new_day, services, recover)
│   ├── integrations/         # Apple Calendar adapters
│   ├── app.py                # FastAPI app composition
│   ├── main.py               # Entry point
│   ├── config.py             # Settings
│   └── db.py                 # Database utilities
│
├── config/                   # Configuration → see config/SYSTEM-SPEC.md
│   ├── schema.sql            # Database schema (source of truth)
│   ├── config.yaml           # Feature configuration
│   └── migrations/           # Schema evolution
│
├── data/                     # ALL persistent state
│   ├── db/                   # system.db + WAL files
│   ├── outputs/              # Active worker workspaces
│   └── archives/             # Completed worker deliverables
│
└── state/                    # Runtime state files
```

---

## App Plugin Architecture

**The core insight:** Apps (both Core and Custom) are structurally identical. They all plug into the same Core using the `AppPlugin` interface.

### The Core (`core/__init__.py`)

The Core is the OS. It provides everything an app needs:

```python
class Core:
    """The OS core. Apps plug into this."""
    
    def load_app(self, plugin: AppPlugin) -> None
    def install_app(self, plugin: AppPlugin) -> None
    
    # API mounting
    def mount_api(self, prefix: str, router: APIRouter) -> None
    
    # MCP registration (for Dashboard/API access)
    def register_tool(self, tool_fn: Callable) -> None
    
    # Service registry (cross-app communication)
    def register_service(self, name: str, service: Any) -> None
    def get_service(self, name: str) -> Any
    
    # Database
    def run_schema(self, schema_path: Path) -> None
    @property
    def db(self) -> SystemStorage
```

### App Discovery (`core/loader.py`)

The loader auto-discovers apps from:
- `apps/*/` — Core Apps (ship with Claude OS)
- `custom/*/` — Custom Apps (generated from APP-SPEC.md)

Custom Apps only load if matching `Desktop/*/APP-SPEC.md` exists.

### Currently Loaded Apps

| App | Type | Location | Provides |
|-----|------|----------|----------|
| **contacts** | Core | `apps/contacts/` | HTTP API, MCP tool, service |
| **priorities** | Core | `apps/priorities/` | HTTP API, MCP tool, service |
| **settings** | Core | `apps/settings/` | HTTP API (system config, model config) |
| **job-search** | Custom | `custom/job_search/` | MCP tools only |

---

## Subsystem Specs

Detailed specs live with their code:

| Subsystem | Spec Location | Purpose |
|-----------|---------------|---------|
| **MCP Server** | `src/life_mcp/SYSTEM-SPEC.md` | Claude's interface to the system |
| **Event Bus** | `src/utils/SYSTEM-SPEC.md` | SSE events for Dashboard real-time updates |
| **Watcher** | `src/watcher/SYSTEM-SPEC.md` | Filesystem monitoring |
| **Database** | `config/SYSTEM-SPEC.md` | Schema, tables, migrations |
| **Hooks** | `.claude/hooks/SYSTEM-SPEC.md` | Session lifecycle management |

---

## Core Components

### Unified Backend

**Entry point:** `main.py`
**Port:** 5001

Runs as single FastAPI process with:
- Dashboard API (all `/api/*` routes)
- Watcher (filesystem monitoring loop)
- Executor (background worker loop)
- Scheduler (mission scheduling loop)
- Context Monitor (proactive context warning loop)
- SSE Event Bus (real-time events to Dashboard via `/api/events`)

### SSE Event Bus

The Dashboard connects to `/api/events` for real-time updates instead of polling. When state changes (sessions, workers, priorities), the backend publishes events that trigger React Query cache invalidation.

**Events:** `session.*`, `worker.*`, `priority.*`
**Details:** See `src/utils/SYSTEM-SPEC.md`

### Messaging Service

**Location:** `src/services/messaging.py`

Unified TMUX message injection system. All system messages to Claude sessions flow through this service, which:
- Sends TMUX escape sequences to inject messages into Claude Code sessions
- Handles formatting with unified bracket format: `[CLAUDE OS SYS: CATEGORY]: Message`
- Tracks notification delivery in `conversation_notifications` table
- Supports conversation-scoped notifications (survive session resets)

**Message Format Standard:**
```
[CLAUDE OS SYS: CATEGORY]: Title or brief description

Body paragraphs explaining what's happening and why.

**Action required:**

1. Step one
2. Step two

Closing reassurance or context.
```

**Categories:**
- `WARNING` - Context warnings, reset warnings (urgent attention needed)
- `NOTIFICATION` - Worker completions, status updates (informational)
- `ACTION` - Mission resets, forced actions (system will act)
- `INFO` - Memory checks, reminders (guidance, not urgent)

**Key methods:**
- `wake_conversation(conversation_id, summary)` - Worker completion notification
- `warn_reset(session_id, minutes)` - Context reset countdown warning
- `warn_mission_reset(minutes)` - Mission reset warning to Chief
- `notify_specialist_complete(session_id, role, summary)` - Background specialist done() notification to Chief

**Architecture change:** Replaces direct `inject_message()` calls scattered across codebase. Now hooks and loops call MessagingService for all TMUX injection.

**Notification persistence:** Uses `conversation_notifications` table (not `session_notifications`) so workers spawned in session A can notify session B after context reset.

### Context Monitor

**Location:** `src/loops/context_monitor.py`

Proactive context warning system that monitors Claude sessions and warns before context becomes critical.

**How it works:**
- Runs every 60 seconds
- Scrapes each active session's tmux pane for Claude Code context warnings
- Tracks highest warning level seen per session in `sessions.context_warning_level`
- When level increases (60% → 80% → 90% → 95%), sends TMUX warning via MessagingService
- Warnings appear in unified format: `[CLAUDE OS SYS: WARNING]: Context at XX%`

**Warning Levels:**
- **60%** - `INFO`: Memory check (externalize context reminder)
- **80%** - `WARNING`: Suggest reset (initiate protocol now)
- **90%** - `WARNING`: Urgent (stop task, write minimal state)
- **95%** - `WARNING`: Critical (emergency reset immediately)

**Autonomous Mode:** Warnings include additional context: "No human backup. Reset early or risk getting stuck."

**Resilience:** Stop hook also checks context on session end as backup. Monitor loop is primary; hook is safety net.

**Database:** Persists `context_warning_level` in sessions table, preventing duplicate warnings.

### MCP Server

Claude's primary interface. Two servers available:

| Server | Purpose |
|--------|---------|
| `life` | Workers, sessions, contacts, priorities, timers, job search tools |
| `apple` | Calendar, Messages, Mail (pyapple-mcp) |

The MCP server (`life_mcp/server.py`) composes tools from:
- `tools/core.py` — Session/worker management
- `tools/life.py` — Contact, priority, timer, log, remind
- `tools/system.py` — Service management, night mode
- `custom/job_search/tools.py` — Mock, DSA, LeetCode tracking

See `src/life_mcp/SYSTEM-SPEC.md` for tool details.

### Filesystem Watcher

Monitors Desktop/ and Workspace/ for changes. See `src/watcher/SYSTEM-SPEC.md` for details.

### Hooks System

Session lifecycle management in `.claude/hooks/`. See `.claude/hooks/SYSTEM-SPEC.md` for details.

### Database

SQLite at `.engine/data/db/system.db`. See `config/SYSTEM-SPEC.md` for schema.

### Session Lifecycle (Jan 2026)

This section documents the complete session lifecycle - from creation to termination, including all the background processes that interact with sessions.

#### Core Concepts

**Session vs Conversation:**
- **session_id**: Ephemeral UUID for each Claude Code invocation (8 chars, truncated from full UUID)
- **conversation_id**: Stable identity that persists across context resets
  - Chief: `"chief"` (eternal, never changes)
  - Specialists: `{role}-{uuid8}` (task-scoped, until window closed)

```
Conversation (stable)
├── Session 1 (session_id: abc..., conversation_id: chief)
│   └── reset() called → ends session
├── Session 2 (session_id: def..., conversation_id: chief)
│   └── parent_session_id: abc...
│   └── Inherits workers from conversation
└── Session 3 (session_id: ghi..., conversation_id: chief)
    └── parent_session_id: def...
```

**Why this matters:** Workers belong to conversations, not sessions. UI shows conversation history across resets. Wake notifications find the current session in a conversation.

#### Session Creation

**Single entry point:** `.claude/hooks/session_lifecycle/start.py`

When Claude Code starts, the `SessionStart` hook fires and:
1. Extracts session_id from `CLAUDE_SESSION_ID` env var
2. Checks if window should skip registration (e.g., `usage-check-*` windows)
3. Cleans up any stale sessions claiming the same tmux pane
4. Registers session in `sessions` table with role, mode, conversation_id
5. Loads context files (TODAY.md, MEMORY.md, SYSTEM-INDEX.md, role extras)

**Key environment variables:**
- `CLAUDE_SESSION_ID` - Full UUID from Claude Code
- `CLAUDE_SESSION_ROLE` - Role (chief, builder, deep-work, etc.)
- `CLAUDE_SESSION_MODE` - Mode (interactive, background, mission)
- `CLAUDE_CONVERSATION_ID` - Conversation to join (or generated)
- `CLAUDE_PARENT_SESSION_ID` - Previous session after reset
- `TMUX_PANE` - Pane ID for targeting

**Skip patterns:** Windows named `usage-check-*` skip registration entirely (used by UsageTracker for polling `/usage`).

#### Session State Tracking

**Heartbeat:** `.claude/hooks/session_lifecycle/prompt.py`

On every user prompt (UserPromptSubmit hook):
- Updates `last_seen_at` timestamp
- Sets `current_state = 'active'`
- Checks context % and injects warnings if high
- Handles worker wake-up triggers

**State values:**
- `idle` - Session registered, waiting for input
- `active` - Recently received a prompt
- `tool_active` - Currently executing a tool
- `ended` - Session terminated

**Context warning levels:** Stored in `context_warning_level` column
- 0 = Normal
- 60 = INFO warning sent
- 80 = WARNING sent
- 90 = Urgent warning sent
- 95 = Critical warning sent

#### Session Termination

Sessions end through multiple paths:

| Path | Trigger | `end_reason` | What happens |
|------|---------|--------------|--------------|
| **Normal exit** | User quits Claude | `exit` | `stop.py` hook fires |
| **MCP reset()** | Claude calls reset() | `reset` | Handoff created, new session spawns |
| **MCP done()** | Claude calls done() | `done` | Session marked complete |
| **Pane reused** | New session claims pane | `pane_reused` | Old session auto-ended by start.py |
| **Mission reset** | Mission forces Chief reset | `mission_reset` | Scheduler ends session |
| **Duty reset** | Duty forces Chief reset | `duty_reset` | DutyScheduler ends session |
| **Manual cleanup** | Admin intervention | `manual_cleanup` | Direct DB update |
| **Ghost cleanup** | Orphan detection | `ghost_cleanup` | Cleanup script |

**Stop hook:** `.claude/hooks/session_lifecycle/stop.py`
- Fires on normal Claude exit
- Marks session as ended
- Updates final context warning level
- Handles background session completion notifications

#### Background Processes

Several background loops interact with sessions:

| Loop | Interval | Purpose | Session Impact |
|------|----------|---------|----------------|
| **Context Monitor** | 60s | Scrape tmux for context % | Updates `context_warning_level`, sends warnings |
| **Usage Tracker** | 10min | Poll `/usage` command | Creates temp windows (skips registration) |
| **Mission Scheduler** | 30s | Run scheduled missions | May spawn/reset Chief for missions |
| **Duty Scheduler** | 30s | Run Chief duties | May force-reset Chief |
| **Executor** | continuous | Run background workers | Workers belong to conversations |

**Orphan Cleanup:** DISABLED (Jan 2026)

Previously, a cleanup loop marked "stale" sessions as orphans. This fought against the eternal conversation model and was disabled. Sessions now persist until explicitly ended.

#### Database Schema

```sql
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,           -- 8-char truncated UUID

    -- Classification
    role TEXT DEFAULT 'chief',             -- chief, builder, deep-work, etc.
    mode TEXT DEFAULT 'interactive',       -- interactive, background, mission

    -- Conversation tracking
    conversation_id TEXT,                  -- Stable identity across resets
    parent_session_id TEXT,                -- Previous session after reset

    -- Lifecycle
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,            -- Heartbeat timestamp
    ended_at TEXT,                         -- NULL = active
    end_reason TEXT,                       -- How session ended

    -- Context
    transcript_path TEXT,                  -- Path to .jsonl transcript
    tmux_pane TEXT,                        -- For message targeting

    -- State
    current_state TEXT DEFAULT 'idle',     -- idle, active, tool_active, ended
    context_warning_level INTEGER DEFAULT 0,
    status_text TEXT,                      -- What session is working on
    ...
);
```

#### UI Consumption

**Transcript history:** `/api/system/sessions/conversation/{id}/transcript/history`
- Queries all sessions with matching `conversation_id`
- Merges transcript events from each session's `.jsonl` file
- Inserts `session_boundary` events between sessions (shows as "Context Reset" in UI)

**Activity view:** `/api/system/sessions/activity`
- Lists active sessions (ended_at IS NULL)
- Groups by conversation_id
- Shows status_text, last_seen_at, role

**Chief status:** `/api/chief/status`
- Checks if Chief window exists in tmux
- Checks if Claude process is running
- Returns session info if found

#### Common Issues

**Ghost sessions (FIXED Jan 2026):**
- Cause: UsageTracker spawned temp Claude, registered sessions
- Fix: `start.py` now skips registration for `usage-check-*` windows

**Spurious "Context Reset" markers (FIXED Jan 2026):**
- Cause: Multiple session records for same conversation
- Fix: Disabled orphan cleanup, cleaned up ghost sessions

**Session not found after reset:**
- Cause: Querying by old session_id instead of conversation_id
- Fix: Use conversation_id for persistent queries

---

## CLI Tools

Scripts in `.engine/src/cli/`:

| Tool | Purpose |
|------|---------|
| `new_day.py` | Day turnover + Chief spawn |
| `services.py` | Status check |
| `recover.py` | Health check, orphan cleanup |
| `wake_claude.py` | Send wake-up messages |
| `handoff.py` | Session handoff utilities |

---

## Service Management

### tmux Window Layout

Services run as foreground processes in tmux:

```
tmux session: "life"
├── Window 0: backend   ← ./venv/bin/python .engine/src/main.py
├── Window 1: dashboard ← cd Dashboard && npm run dev
├── Window 2: chief     ← Chief of Staff Claude
└── Window 3+: Claude sessions (system-xxx, focus-xxx, etc.)
```

### Claude Model Configuration

Each role can have a different Claude model configured via Settings → Models. Model selection is stored in the `settings` database table (`{role}_model` keys) and applied when spawning:

| Role | Setting Key | Default |
|------|-------------|---------|
| Chief | `chief_model` | opus |
| System | `system_model` | opus |
| Focus | `focus_model` | opus |
| Project | `project_model` | opus |
| Idea | `idea_model` | opus |
| Worker | `worker_model` | sonnet |

The `--model` flag is passed to `claude` CLI when sessions start or resume (see `services/sessions.py` and `cli/tmux_reset.py`).

### Restarting Services

Use `respawn-pane` for atomic kill + restart:

```bash
# Backend
tmux respawn-pane -k -t life:backend './venv/bin/python .engine/src/main.py'

# Dashboard
tmux respawn-pane -k -t life:dashboard 'cd Dashboard && npm run dev'
```

The `-k` flag kills the existing process before restarting. This is more reliable than `send-keys` (which can have timing issues).

### NEVER Use Kill Commands

All pattern-based kill commands are unsafe:
- ❌ `pkill node` — kills Cursor, Chrome, everything
- ❌ `killall node` — same problem
- ❌ `lsof -ti :PORT | xargs kill` — can kill Chrome

The hook system blocks these commands.

---

## Cold Start / Recovery

**Hot restart (Cursor quit):** Everything survives in tmux. Just `tmux attach -t life`.

**Cold start (computer restart):**
```bash
cd ~/Projects/Active-Work/specifications-suite/life-specifications

# Create session with backend
tmux new -s life -n backend -d
tmux send-keys -t life:backend './venv/bin/python .engine/src/main.py' C-m

# Create dashboard window
tmux new-window -t life -n dashboard
tmux send-keys -t life:dashboard 'cd Dashboard && npm run dev' C-m

# Create chief window  
tmux new-window -t life -n chief
tmux send-keys -t life:chief 'claude --dangerously-skip-permissions' C-m

# Attach
tmux attach -t life
```

**Recovery tool:** `python .engine/src/cli/recover.py`

---

## Source of Truth Matrix

| Data | Source of Truth | Generated Views |
|------|-----------------|-----------------|
| Calendar events | Apple Calendar.app | Dashboard calendar view |
| Task state | Database | Task board, notifications |
| Contacts | Database (via contacts app) | Dashboard contacts view |
| Priorities | Database (via priorities app) | Dashboard, today.md injection |
| Email messages | Local SQLite cache (email_messages) | Dashboard email view |
| SPECs | Markdown files | SYSTEM-INDEX.md domain list |
| Daily work | Desktop/today.md | None (primary doc) |
| History | Workspace/logs/ | None (archive) |

---

## Integration Points

**macOS Native Apps (via pyapple-mcp):**
- Calendar.app - PRIMARY calendar interface
- Messages.app - Send and read iMessages
- Mail.app - Sync source only (SQLite). AppleScript used for writes only.

**Dashboard:** HTTP API at `http://localhost:5001`

---

## Creating New Apps

### Minimal App (MCP tool only)

```python
# apps/timer/__init__.py
from core import AppPlugin, AppManifest, Core

manifest = AppManifest(
    name="Timer",
    slug="timer", 
    description="Simple timer tool",
    icon="clock",
)

def timer(operation: str, name: str = None, duration: int = None) -> dict:
    """Start, check, or stop timers."""
    # Implementation...
    pass

class TimerApp(AppPlugin):
    manifest = manifest
    
    def register(self, core: Core):
        core.register_tool(timer)

plugin = TimerApp()
```

### Standard App (API + MCP + Database)

1. Create `apps/{name}/`
2. Write `__init__.py` with AppPlugin
3. Write `schema.sql` for tables
4. Write `api.py` for HTTP routes
5. Write `mcp.py` for MCP tools
6. Write `service.py` for business logic
7. Create `Dashboard/app/{name}/page.tsx` for UI (optional)

See `Workspace/specs/app-architecture.md` for detailed patterns.

---

## Historical Changes

<details>
<summary>Click to expand full removal history</summary>

### Removed Components
- **calendar.md** - Replaced by Apple Calendar (2025-12-18)
- **Life MCP calendar tools** - Use Apple MCP instead (2025-12-18)
- **CalendarModule/CalendarService** - Calendar now external (2025-12-18)
- **Improvements system** - Just edit SPEC files directly
- **CLI tools for Claude actions** - Use MCP tools instead
- **Separate watcher/executor daemons** - Unified into single backend
- **Old runtime/ directory** - Code moved to src/backend/
- **TaskBoardModule** - Removed (2025-12-23), hook-based notifications replaced it
- **`tasks` table** - Renamed to `workers` (2025-12-23)
- **Deprecated tables** - Dropped calendar_*, google_sync_*, improvements tables (2025-12-23)
- **`task_*` MCP tools** - Renamed to `worker_*` (aliases still work) (2025-12-23)
- **`session_identify` MCP tool** - Renamed to `session_describe` (2025-12-24)
- **`missions/` directory** - Moved to `.claude/missions/` (2025-12-24)
- **Manual session spawning** - Dashboard now spawns sessions directly via backend API (2025-12-24)
- **`session_describe` MCP tool** - Removed entirely (2025-12-26)
- **`stage_*` MCP tools** - Removed (2025-12-26)
- **`context_*` MCP tools** - Removed (2025-12-26)
- **`contact_view`, `contact_update`, `contact_tag` MCP tools** - Removed (2025-12-26)
- **`priority_update`, `priority_complete`, `priority_list` MCP tools** - Removed (2025-12-26)
- **`mission_enable`, `mission_disable` MCP tools** - Removed (2025-12-26)
- **`spawn_session.py`** - Replaced by SessionManager class (2025-12-27)
- **Individual hook files** - Consolidated into `session_lifecycle/` package (2025-12-27)
- **Monolithic MCP server.py** - Split into modular tools/ package (2026-01-04)
- **Several watcher modules** - Removed (2026-01-04)
- **CLI tools relocated** (2026-01-04): session_manager.py, chief.py, email_cli.py, etc.
- **`blueprints/` directory** - Renamed to `custom/` (2026-01-06)

### SSE Event Bus (2026-01-07)
- **Unified event bus** - `utils/event_bus.py` for real-time Dashboard updates
- **No more polling** - Dashboard connects to `/api/events` SSE endpoint
- **Event coverage** - All session, worker, and priority mutations emit events
- **MCP tool integration** - Tools emit events using `asyncio.run_coroutine_threadsafe`
- **React Query invalidation** - Frontend auto-refreshes affected queries on events

### Session Continuity (2026-01-07)
- **`conversation_id`** - Stable identity across session resets
- **Migration 015** - Added conversation_id to sessions, workers, handoffs tables
- **Worker ownership** - Workers now belong to conversations, survive resets
- **Reset unblocked** - `reset()` no longer blocks on running workers
- **Wake notifications** - Find current session in conversation (not dead session)
- **UI history** - Claude Panel shows full conversation transcript across resets
- **Session boundaries** - "Context Reset" markers in transcript viewer

### Architecture Changes (2026-01-06)
- **App Plugin Architecture** - Core, AppPlugin, AppManifest classes added
- **apps/ directory** - Core applications moved here (contacts, priorities)
- **custom/ directory** - Custom applications (job_search)
- **Auto-discovery** - `core/loader.py` discovers and loads all apps

### Settings & Model Configuration (2026-01-06)
- **Settings Core App** - Full settings UI with system config, models, appearance, shortcuts, about
- **Model Configuration API** - `/api/settings/models` endpoints for per-role model selection
- **Session Spawning** - `--model` flag now passed to Claude CLI based on role config
- **tmux Reset** - Model flag applied when resuming sessions after system restart

### Session Lifecycle Fixes (2026-01-12)
- **Orphan cleanup disabled** - Was fighting eternal conversation model, marking active sessions as orphans
- **UsageTracker skip pattern** - Temp `usage-check-*` windows now skip session registration
- **Pattern matching fix** - Removed `'> '` from shell patterns (matched Claude Code's prompt)
- **Chief eternal conversation** - conversation_id is now just `"chief"` (not daily)
- **Comprehensive documentation** - Full session lifecycle documented in SYSTEM-SPEC

</details>
