# Database & Schema - Specification

**Location:** `.engine/config/`
**Database:** `.engine/data/db/system.db`

---

## Schema Source of Truth

**File:** `schema.sql`

All table definitions live here. When modifying the database:
1. Update `schema.sql` first
2. Create migration in `migrations/` if needed
3. Apply migration or rebuild from scratch

---

## Core Tables

| Table | Purpose |
|-------|---------|
| `workers` | Background worker state |
| `sessions` | Claude session tracking |
| `scheduled_missions` | Mission definitions and schedules |
| `missions` | Mission execution history |
| `contacts`, `contact_tags` | People with metadata |
| `priorities` | Daily priority items |
| `staged_content` | Portal display items |
| `conversation_notifications` | Notification tracking (conversation-scoped) |
| `pings` | Claude → user attention requests |

### Deprecated Tables

| Table | Replaced By | Status |
|-------|-------------|--------|
| `session_notifications` | `conversation_notifications` | Deprecated (migration 027), pending drop |

---

## Key Tables Detail

### sessions

Tracks all Claude sessions (Chief, System, Focus, etc.)

| Column | Purpose |
|--------|---------|
| `id` | Our session ID (8-char UUID) |
| `claude_session_id` | Claude Code's internal ID (for transcript) |
| `conversation_id` | Stable ID across context resets |
| `role` | chief, builder, deep-work, project, idea |
| `mode` | interactive, background, autonomous |
| `current_state` | active, tool_active, idle |
| `status_text` | What Claude is working on |
| `context_warning_level` | Highest context % seen (50, 70, 90) |
| `tmux_window` | tmux window name |
| `tmux_pane` | tmux pane ID |
| `started_at` | Session start time |
| `ended_at` | Session end time (null if active) |
| `end_reason` | How session ended |

**Conversation Architecture:** `conversation_id` provides stable identity across session resets. Chief gets `chief-YYYY-MM-DD` (daily), specialists get `{role}-{uuid8}` (task-scoped).

**Context Tracking:** `context_warning_level` prevents duplicate warnings. Context monitor updates this when scraping panes for context warnings.

### workers

Background workers spawned by Claude

| Column | Purpose |
|--------|---------|
| `id` | Worker ID (8-char UUID) |
| `session_id` | Parent session that spawned this |
| `primitive` | research, analyze, organize, etc. |
| `status` | pending, running, complete, failed |
| `instructions` | What to do |
| `workspace_path` | Output directory |

### priorities

Daily priority items shown in Dashboard

| Column | Purpose |
|--------|---------|
| `id` | Priority ID |
| `content` | What the priority is |
| `level` | critical, high, medium, low |
| `pool` | Which pool (default: main) |
| `completed_at` | When completed (null if active) |

### contacts

People in the user's network

| Column | Purpose |
|--------|---------|
| `id` | Contact ID |
| `name` | Full name |
| `email` | Email address |
| `phone` | Phone number |
| `notes` | Freeform notes |
| `created_at` | When added |

### contact_tags

Tags attached to contacts (many-to-many)

| Column | Purpose |
|--------|---------|
| `contact_id` | Reference to contact |
| `tag` | Tag name (claude_direct, client, etc.) |

### conversation_notifications

Notification delivery tracking (conversation-scoped)

| Column | Purpose |
|--------|---------|
| `id` | Notification ID |
| `conversation_id` | Target conversation (stable across resets) |
| `notification_type` | worker_complete, context_warning, etc. |
| `entity_id` | Worker ID or other entity reference |
| `notified_at` | When notification was sent |
| `session_id` | Specific session that received the notification |

**Why conversation-scoped?** Workers spawned in session A must be able to notify session B after context reset. The `conversation_id` provides stable targeting across session boundaries.

---

## Migrations

**Location:** `migrations/`

Naming convention: `NNN_description.sql`

Recent migrations (2026-01):
- `025_unified_accounts.sql` - Unified account management
- `026_migrate_email_accounts.sql` - Email account migration
- `027_conversation_notifications.sql` - Conversation-scoped notifications
- `028_context_warning_tracking.sql` - Context warning level tracking
- `029_drop_session_notifications.sql` - (Pending) Drop deprecated table

See `migrations/` directory for complete history (001-029).

---

## WAL Mode

Database uses WAL (Write-Ahead Logging) for better concurrency:
- `system.db` - main database
- `system.db-shm` - shared memory
- `system.db-wal` - write-ahead log

**Do not delete** the -shm and -wal files while the database is in use.

---

## Access Patterns

| Component | Access |
|-----------|--------|
| Hooks | Direct SQLite (via `get_db()`) |
| API routes | Via services layer |
| MCP tools | Via services layer |
| Dashboard | Via API endpoints |

---

## Backup Strategy

Pre-refactor backups in `data/db/`:
- `system_backup_pre_refactor.db`
- `system_pre_refactor.db`

---

## Related

- **Services:** `.engine/src/services/` - business logic layer
- **API:** `.engine/src/api/` - HTTP endpoints
- **Hooks:** `.claude/hooks/` - direct DB access

