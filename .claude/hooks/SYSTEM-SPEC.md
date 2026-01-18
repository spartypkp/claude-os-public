# Hooks System - Specification

**Location:** `.claude/hooks/`
**Purpose:** Python scripts that run at Claude session lifecycle points. Enable automatic context loading, session tracking, tool validation, and background task notifications.

---

## Architecture

```
Claude Code Session
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ SessionStart  │──▶ session_lifecycle.py ──▶ start.py            │
├───────────────┼─────────────────────────────────────────────────┤
│ UserPrompt    │──▶ session_lifecycle.py ──▶ prompt.py           │
├───────────────┼─────────────────────────────────────────────────┤
│ PreToolUse    │──▶ tool_tracking.py (security + state)          │
├───────────────┼─────────────────────────────────────────────────┤
│ PostToolUse   │──▶ tool_tracking.py (state)                     │
├───────────────┼─────────────────────────────────────────────────┤
│ Stop          │──▶ session_lifecycle.py ──▶ stop.py             │
├───────────────┼─────────────────────────────────────────────────┤
│ SessionEnd    │──▶ session_lifecycle.py ──▶ end.py              │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
.claude/hooks/
├── session_lifecycle.py      # Dispatcher → routes to package
├── session_lifecycle/        # Package with shared utilities
│   ├── __init__.py          # get_db(), get_session_id(), format_age()
│   ├── start.py             # SessionStart handler
│   ├── prompt.py            # UserPromptSubmit handler
│   ├── stop.py              # Stop handler
│   └── end.py               # SessionEnd handler
└── tool_tracking.py         # Pre/PostToolUse (standalone)
```

**Why a dispatcher?** Single entry point per event type simplifies settings.json, shared utilities in `__init__.py`, and cleaner separation of concerns.

---

## Hook Reference

| Event | Entry Point | Handler | Purpose |
|-------|-------------|---------|---------|
| **SessionStart** | `session_lifecycle.py` | `start.py` | Register session + load context |
| **UserPromptSubmit** | `session_lifecycle.py` | `prompt.py` | Heartbeat + context warnings + wakeup handler |
| **PreToolUse** | `tool_tracking.py` | (self) | Security + set state=tool_active |
| **PostToolUse** | `tool_tracking.py` | (self) | Set state=active |
| **Stop** | `session_lifecycle.py` | `stop.py` | Set state=idle + session reminders + context warnings (backup) |
| **SessionEnd** | `session_lifecycle.py` | `end.py` | Mark session ended |

---

## Handler Details

### start.py (SessionStart)

- Reads env vars: `CLAUDE_SESSION_ID`, `CLAUDE_SESSION_ROLE`, `CLAUDE_SESSION_MODE`
- Creates/updates session record in `sessions` table
- Captures `tmux_pane` for wake-up targeting
- Loads context files: **core files** + **role-specific extras**
- For missions, links to `missions` table via `MISSION_EXECUTION_ID`

**Core files (everyone gets):**
- `Desktop/TODAY.md`
- `Desktop/MEMORY.md`
- `Desktop/SYSTEM-INDEX.md`

**Context loading format:**
```
[CLAUDE OS SYS: INFO]: Session context loaded

Core memory files loaded automatically:
- TODAY.MD (daily memory)
- MEMORY.MD (weekly/medium-term)
- SYSTEM-INDEX.MD (complete file)
[+ any role-specific extras]

Full content follows:

## TODAY.MD (daily memory)
[content]

## MEMORY.MD (weekly/medium-term)
[content]
...
```

**Role-specific extras (via frontmatter):**

Each role file can declare additional files to auto-load via YAML frontmatter:

```markdown
---
auto_include:
  - Desktop/identity.md
  - .engine/SYSTEM-SPEC.md
---

<session-role>
# Role Name
...
```

**Features:**
- `${PROJECT_PATH}` variable substitution (for Project role)
- Glob pattern support (`**/*.md`)
- Graceful fallback if frontmatter missing (just loads core files)
- User-defined roles work automatically

**Examples:**
- Chief: `Desktop/identity.md` (life decisions need identity context)
- System: `.engine/SYSTEM-SPEC.md`, `Dashboard/SYSTEM-SPEC.md` (architecture docs)
- Project: `${PROJECT_PATH}/CLAUDE.md`, `${PROJECT_PATH}/**/SYSTEM-SPEC.md` (dynamic project docs)

### prompt.py (UserPromptSubmit)

- Updates `last_seen_at` timestamp (heartbeat)
- Shows context % warnings (60%, 80%) if needed - backup to Context Monitor
- Shows session status reminder after 2 minutes
- **Handles TMUX wakeup trigger** - When MessagingService sends a wakeup message, this hook detects it and injects worker completion summary using conversation-scoped queries

**Messages injected:**
- `[CLAUDE OS SYS: INFO]: Context at 60% - Consider writing reset notes soon`
- `[CLAUDE OS SYS: WARNING]: Context at 80% - Write reset notes and prepare to transition`
- `[CLAUDE OS SYS: INFO]: Consider setting a session status with status("what you're working on")`

**Worker notifications:** Now handled via TMUX wakeup (not hook injection). When workers complete, MessagingService sends a wakeup message to the conversation. This hook detects the trigger and provides the detailed summary.

### tool_tracking.py (PreToolUse + PostToolUse)

**Security layer:**
- Blocks dangerous commands: `pkill`, `killall`, `lsof | xargs kill`
- Blocks destructive bash: `rm -rf /`, `sudo`, fork bombs
- Blocks writes to protected paths: `/etc`, SSH keys, `.env` files

**State tracking:**
- PreToolUse: Sets `sessions.current_state = 'tool_active'`
- PostToolUse: Sets `sessions.current_state = 'active'`

### stop.py (Stop)

- Sets `sessions.current_state = 'idle'`
- Shows session-specific reminders (background mode: ping before ending)
- **Context warnings (backup)** - Progressive warnings (60% → 80% → 90% → 95%) tracked in `sessions.context_warning_level`. Primary warnings come from context monitor loop; this is backup when loop is down.
- Prevents infinite loops via `stop_hook_active` flag

**Messages injected (backup to Context Monitor):**
- `[CLAUDE OS SYS: INFO]: Memory check (60% context used)` - Externalize context reminder
- `[CLAUDE OS SYS: WARNING]: Context at 80%` - Initiate reset protocol
- `[CLAUDE OS SYS: WARNING]: Context at 90% - URGENT` - Stop task, write minimal state
- `[CLAUDE OS SYS: WARNING]: Context at 95% - CRITICAL` - Emergency reset immediately
- `[CLAUDE OS SYS: INFO]: Reminder - Ping before ending` - Background mode only

**Worker notifications:** No longer handled in stop hook. Workers now wake via TMUX message injection (MessagingService), not by blocking stop.

### end.py (SessionEnd)

- Marks session as ended: sets `ended_at`, `end_reason`
- Does NOT run on "clear" reason (context reset, not session end)

---

## Session ID: Critical Detail

**Use `CLAUDE_SESSION_ID` env var, NOT stdin session_id:**

```python
# CORRECT - use env var
session_id = os.environ.get('CLAUDE_SESSION_ID')

# WRONG - this is Claude's internal ID
session_id = input_data.get('session_id')
```

The stdin `session_id` is Claude Code's internal ID. Our system uses `CLAUDE_SESSION_ID` set by the spawn wrapper.

---

## Error Handling Pattern

All hooks follow:

1. **Never block on failure** - Exit 0 even on error
2. **Log to stderr** - Errors go to stderr (not shown to Claude)
3. **Graceful degradation** - Print fallback message to stdout if appropriate
4. **Non-critical** - Session continues even if hooks fail

```python
try:
    # Hook logic
    sys.exit(0)
except Exception as e:
    print(f"Hook error: {e}", file=sys.stderr)
    sys.exit(0)  # Don't block session
```

---

## Mode-Specific Behavior

| Hook | Interactive | Mission | Background |
|------|-------------|---------|------------|
| Context Loader | Full | Full | Full |
| Tool Validator | Comms allowed with tags | Comms blocked | Comms blocked |
| Task Notifications | Active | Active | N/A |
| Tool Tracker | Active | Active | N/A |

**Security:** Only interactive sessions can send messages/emails, and only to contacts with `claude_direct` or `claude_draft` tags.

---

## Configuration

Registered in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [".claude/hooks/session_lifecycle.py"],
    "UserPromptSubmit": [".claude/hooks/session_lifecycle.py"],
    "Stop": [".claude/hooks/session_lifecycle.py"],
    "SessionEnd": [".claude/hooks/session_lifecycle.py"],
    "PreToolUse": [".claude/hooks/tool_tracking.py"],
    "PostToolUse": [".claude/hooks/tool_tracking.py"]
  }
}
```

---

## Related

- **Sessions table:** `.engine/config/schema.sql`
- **Session Manager:** `.engine/src/services/sessions.py`
- **Roles/Modes:** `.claude/roles/`, `.claude/modes/`

