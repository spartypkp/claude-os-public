CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,           -- UUID from Claude Code CLI

    -- Role + Mode taxonomy (primary classification)
    role TEXT DEFAULT 'chief',             -- 'chief', 'system', 'project', 'focus', or mission name
    mode TEXT DEFAULT 'interactive',       -- 'interactive', 'background', 'mission'

    -- Legacy type classification (kept for backward compat)
    session_type TEXT NOT NULL DEFAULT 'interactive'
        CHECK (session_type IN ('interactive', 'mission')),
    session_subtype TEXT,                  -- 'main', 'system', 'memory-claude', etc.

    -- Mission linking (for mission sessions)
    mission_execution_id TEXT,             -- FK to missions.id

    -- Lifecycle timestamps
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,            -- Heartbeat - updated on each user message
    ended_at TEXT,                         -- NULL = active
    end_reason TEXT,                       -- 'exit', 'crash', 'timeout', 'orphan_cleanup'

    -- Context
    transcript_path TEXT,
    claude_session_id TEXT,                -- Claude Code's full sessionId (UUID) for fallback path reconstruction
    cwd TEXT,
    tmux_pane TEXT,                        -- For wake-up targeting

    -- Enrichment (optional)
    description TEXT,                      -- Session purpose
    status_text TEXT,                      -- What the session is currently working on

    -- Metadata
    current_state TEXT DEFAULT 'idle'
        CHECK (current_state IN ('idle', 'active', 'tool_active', 'ended', NULL)),
    has_pinged BOOLEAN DEFAULT 0,             -- Background sessions: have they pinged?
    created_at TEXT,
    updated_at TEXT
, conversation_id TEXT, parent_session_id TEXT, context_warning_level INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,                   -- UUID
    name TEXT NOT NULL,
    phone TEXT UNIQUE,                     -- E.164 format
    email TEXT,
    company TEXT,
    role TEXT,
    location TEXT,

    -- Relationship context
    description TEXT,                      -- One-liner for LIFE.md
    relationship TEXT,
    context_notes TEXT,
    value_exchange TEXT,
    notes TEXT,

    -- Communication history
    last_contact_date TEXT,
    imessage_count INTEGER DEFAULT 0,

    -- Sync metadata
    macos_contact_id TEXT,
    source TEXT NOT NULL CHECK (
        source IN ('macos_sync', 'imessage_sync', 'manual', 'imported')
    ),

    -- Display control
    pinned INTEGER DEFAULT 0,

    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_tags (
    contact_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (contact_id, tag),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS priorities (
    id TEXT PRIMARY KEY,                   -- 8-char UUID prefix
    content TEXT NOT NULL,                 -- Priority text
    level TEXT NOT NULL DEFAULT 'medium'
        CHECK (level IN ('critical', 'medium', 'low')),
    completed BOOLEAN NOT NULL DEFAULT 0,
    date TEXT,                             -- ISO date (YYYY-MM-DD), NULL for pool items
    position INTEGER DEFAULT 0,            -- Order within date+level group
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
, completed_at TEXT);
CREATE TABLE IF NOT EXISTS pings (
    id TEXT PRIMARY KEY,                   -- 8-char UUID prefix
    session_id TEXT NOT NULL,              -- Which Claude session sent this
    message TEXT NOT NULL,                 -- What they need
    created_at TEXT NOT NULL,
    acknowledged_at TEXT,                  -- When user saw/dismissed it (NULL = unread)
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
CREATE TABLE IF NOT EXISTS handoffs (
    id TEXT PRIMARY KEY,                   -- UUID
    session_id TEXT NOT NULL,              -- Session that initiated handoff
    role TEXT NOT NULL,                    -- Role to spawn (chief, system, etc.)
    mode TEXT NOT NULL,                    -- Mode to spawn (interactive, background, mission)
    tmux_pane TEXT,                        -- Pane to kill
    handoff_path TEXT NOT NULL,            -- Path to handoff document
    reason TEXT NOT NULL,                  -- Why (context_low, chief_cycle, work_continues)

    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'executing', 'complete', 'failed')),
    requested_at TEXT NOT NULL,            -- When MCP tool was called
    executed_at TEXT,                      -- When handoff.py started
    completed_at TEXT,                     -- When new session spawned

    -- Result
    new_session_id TEXT,                   -- Session ID of replacement
    error TEXT,                            -- Error message if failed

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
, conversation_id TEXT, content TEXT);
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,               -- ISO8601 when sampled
    frontmost_app TEXT,                    -- Active application name
    window_title TEXT,                     -- Active window title
    idle_seconds REAL,                     -- Seconds since last input
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,                   -- 8-char UUID prefix
    text TEXT NOT NULL,                    -- The observation text
    needs_exploration BOOLEAN DEFAULT 0,   -- True = queue for Interviewer/Biographer
    source_session TEXT,                   -- Session that captured this
    source_role TEXT,                      -- Role that captured (chief, system, etc.)

    -- Processing lifecycle
    processed_at TEXT,                     -- When Memory Claude handled it
    routed_to TEXT,                        -- Where it ended up (context/identity.md, etc.)

    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,      -- 'session', 'priority', 'calendar', 'worker', 'marker'
    event_action TEXT NOT NULL,    -- 'started', 'ended', 'created', 'completed', etc.
    actor TEXT,                    -- session_id, worker_id, or 'will'
    data JSON,                     -- event-specific payload
    date DATE NOT NULL             -- Pacific date, set explicitly on insert
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timers (
    id TEXT PRIMARY KEY,                   -- 8-char UUID
    label TEXT,                            -- Optional description
    minutes INTEGER NOT NULL,              -- Duration in minutes
    started_at TEXT NOT NULL,              -- When timer started (ISO)
    ends_at TEXT NOT NULL,                 -- When timer ends (ISO)
    session_id TEXT,                       -- Session that created it
    notified INTEGER DEFAULT 0             -- Whether expiration was notified
);
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,                   -- 8-char UUID
    message TEXT NOT NULL,                 -- What to remind about
    remind_at TEXT NOT NULL,               -- When to remind (ISO datetime)
    session_id TEXT,                       -- Session that created it
    acknowledged_at TEXT,                  -- When dismissed (NULL = pending)
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS installed_apps (
                slug TEXT PRIMARY KEY,
                installed_at TEXT NOT NULL
            );
CREATE TABLE IF NOT EXISTS email_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS calendar_accounts (
    id TEXT PRIMARY KEY,
    provider_type TEXT NOT NULL,  -- 'apple', 'google', 'caldav', 'local'
    name TEXT NOT NULL,           -- Display name
    email TEXT,                   -- Account email if applicable
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Provider-specific configuration (JSON)
    -- Google: {"client_id": "...", "client_secret": "...", "refresh_token": "..."}
    -- CalDAV: {"url": "...", "username": "...", "password": "..."}
    config_json TEXT,
    
    -- Sync state
    sync_interval_minutes INTEGER DEFAULT 5,
    last_sync_at TEXT,
    sync_error TEXT,
    
    -- Timestamps
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS email_send_log (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES email_accounts(id),

    -- Recipients
    to_emails TEXT NOT NULL,  -- JSON array
    cc_emails TEXT,  -- JSON array
    bcc_emails TEXT,  -- JSON array

    -- Content
    subject TEXT NOT NULL,
    content_hash TEXT NOT NULL,  -- SHA256 hash of content for verification
    content_preview TEXT,  -- First 200 chars for display

    -- Tracking
    status TEXT NOT NULL DEFAULT 'queued',  -- queued, sent, failed, cancelled
    queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    send_at TEXT NOT NULL,  -- When to actually send (queued_at + delay)
    sent_at TEXT,

    -- Rate limiting
    hour_bucket TEXT,  -- YYYY-MM-DD-HH for rate limit tracking

    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Confirmation (for new recipients)
    requires_confirmation INTEGER DEFAULT 0,
    confirmed_at TEXT,
    confirmed_by TEXT,  -- session_id that confirmed

    -- Provider tracking
    provider_message_id TEXT,  -- Gmail message ID after send

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, content_full TEXT);
CREATE TABLE IF NOT EXISTS email_known_recipients (
    email_address TEXT PRIMARY KEY,
    first_sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at TEXT,
    total_emails_sent INTEGER DEFAULT 0,
    auto_approved INTEGER DEFAULT 0,  -- 1 if in whitelist
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS email_rate_limits (
    hour_bucket TEXT PRIMARY KEY,  -- YYYY-MM-DD-HH
    emails_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS email_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    display_name TEXT NOT NULL,
    primary_email TEXT,
    enabled INTEGER DEFAULT 1,
    config_json TEXT,
    can_read INTEGER DEFAULT 1,
    can_send INTEGER DEFAULT 0,
    can_draft INTEGER DEFAULT 1,
    is_claude_account INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contacts_extensions (
    apple_contact_id TEXT PRIMARY KEY,  -- Links to Apple ZUNIQUEID (e.g., "UUID:ABPerson")
    description TEXT,                    -- One-liner for LIFE.md
    relationship TEXT,                   -- friend, colleague, recruiter, etc.
    context_notes TEXT,                  -- How we know them, context
    value_exchange TEXT,                 -- What value we exchange
    notes TEXT,                          -- General notes
    pinned INTEGER DEFAULT 0,            -- Display control
    last_contact_date TEXT,              -- Last interaction date
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contacts_extension_tags (
    apple_contact_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (apple_contact_id, tag),
    FOREIGN KEY (apple_contact_id) REFERENCES contacts_extensions(apple_contact_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS accounts (
    -- Identity
    id TEXT PRIMARY KEY,                      -- UUID (for internal refs)
    email TEXT NOT NULL UNIQUE,               -- Primary identifier
    display_name TEXT,                        -- Human-friendly name

    -- Account type classification
    account_type TEXT NOT NULL                -- 'icloud', 'google', 'exchange', 'imap', 'local'
        CHECK (account_type IN ('icloud', 'google', 'exchange', 'imap', 'local')),

    -- Discovery source (where we found this account)
    discovered_via TEXT NOT NULL              -- 'mail_app', 'calendar', 'accounts4', 'manual'
        CHECK (discovered_via IN ('mail_app', 'calendar', 'accounts4', 'manual')),

    -- Email capabilities
    can_read_email INTEGER DEFAULT 1,         -- Can read inbox
    can_send_email INTEGER DEFAULT 0,         -- Can send (only Claude's account = 1)
    can_draft_email INTEGER DEFAULT 1,        -- Can create drafts

    -- Calendar capabilities
    can_read_calendar INTEGER DEFAULT 1,      -- Can read events
    can_create_calendar INTEGER DEFAULT 1,    -- Can create events
    can_delete_calendar INTEGER DEFAULT 0,    -- Can delete events (conservative default)

    -- Contacts capabilities
    can_read_contacts INTEGER DEFAULT 1,      -- Can read contacts from this account
    can_modify_contacts INTEGER DEFAULT 0,    -- Can create/update contacts

    -- Messages capabilities (mostly N/A - single Apple ID)
    can_read_messages INTEGER DEFAULT 1,
    can_send_messages INTEGER DEFAULT 0,

    -- Special flags
    is_claude_account INTEGER DEFAULT 0,      -- Claude's autonomous account (1 max)
    is_primary INTEGER DEFAULT 0,             -- User's primary account (1 max)
    is_enabled INTEGER DEFAULT 1,             -- Active/inactive toggle

    -- Provider-specific configuration (JSON)
    -- For Email: {apple_account_guid, mailboxes_url_prefix}
    -- For Gmail: {client_id, client_secret, refresh_token}
    -- For Calendar: {preferred_calendars: [...], aliases: {...}}
    config_json TEXT,

    -- System identifiers (for cross-reference)
    apple_account_guid TEXT,                  -- GUID from ~/Library/Accounts/Accounts4.sqlite
    mail_account_name TEXT,                   -- Display name in Mail.app
    calendar_owner_email TEXT,                -- owner_identity_email from Calendar.sqlitedb
    addressbook_source_id TEXT,               -- Source UUID from AddressBook/Sources/

    -- Timestamps
    discovered_at TEXT DEFAULT (datetime('now')),
    last_verified_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS conversation_notifications (
    conversation_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    notified_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (conversation_id, worker_id)
);
CREATE TABLE IF NOT EXISTS claude_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Session (5-hour cycle)
    session_tokens_used INTEGER,
    session_tokens_total INTEGER,
    session_percentage REAL,
    session_reset_at DATETIME,

    -- Weekly limit
    weekly_tokens_used INTEGER,
    weekly_tokens_total INTEGER,
    weekly_percentage REAL,
    weekly_reset_at DATETIME,

    -- Metadata
    current_model TEXT,
    plan_tier TEXT,

    -- Raw data for debugging
    raw_output TEXT,

    -- Status
    fetch_status TEXT CHECK(fetch_status IN ('success', 'error', 'parsing_failed')),
    error_message TEXT
);
CREATE TABLE IF NOT EXISTS chief_duties (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,           -- 'memory-consolidation'
    name TEXT NOT NULL,                  -- 'Memory Consolidation'
    description TEXT,

    -- Schedule (daily time only - keep it simple)
    schedule_time TEXT NOT NULL,         -- '06:00' (HH:MM, Pacific)

    -- Prompt
    prompt_file TEXT NOT NULL,           -- '.claude/scheduled/memory-consolidation.md'

    -- Execution config
    timeout_minutes INTEGER DEFAULT 45,

    -- State (minimal - NO next_run!)
    enabled INTEGER DEFAULT 1,
    last_run TEXT,                       -- ISO timestamp of last execution
    last_status TEXT,                    -- 'completed', 'failed', 'timeout'

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chief_duty_executions (
    id TEXT PRIMARY KEY,
    duty_id TEXT NOT NULL REFERENCES chief_duties(id),
    duty_slug TEXT NOT NULL,             -- Denormalized for queries

    -- Lifecycle
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'timeout')),

    -- Session linkage
    session_id TEXT,                     -- Chief session during execution

    -- Output
    error_message TEXT,
    duration_seconds INTEGER
);
CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,

    -- Identity
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'user'
        CHECK (source IN ('core_default', 'custom_app', 'user')),
    app_slug TEXT,

    -- Prompt configuration
    prompt_type TEXT NOT NULL DEFAULT 'file'
        CHECK (prompt_type IN ('file', 'inline')),
    prompt_file TEXT,
    prompt_inline TEXT,

    -- Schedule configuration
    schedule_type TEXT
        CHECK (schedule_type IN ('cron', 'time', 'relative', NULL)),
    schedule_cron TEXT,
    schedule_time TEXT,
    schedule_days TEXT,

    -- Trigger configuration
    trigger_type TEXT
        CHECK (trigger_type IN ('file_change', 'calendar_event', 'app_hook', NULL)),
    trigger_config_json TEXT,

    -- Execution settings
    timeout_minutes INTEGER DEFAULT 60,
    role TEXT NOT NULL DEFAULT 'builder'
        CHECK (role != 'chief'),  -- Chief work is handled by duties
    mode TEXT DEFAULT 'mission',

    -- State (NO protected column!)
    enabled BOOLEAN NOT NULL DEFAULT 1,
    next_run TEXT,
    last_run TEXT,
    last_status TEXT
        CHECK (last_status IN ('completed', 'failed', 'timeout', NULL)),

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mission_executions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    mission_slug TEXT NOT NULL,

    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'timeout', 'cancelled')),

    session_id TEXT,
    transcript_path TEXT,
    output_summary TEXT,
    error_message TEXT,
    duration_seconds INTEGER,

    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_role ON sessions(role);
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(mode);
CREATE INDEX IF NOT EXISTS idx_sessions_heartbeat ON sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_sessions_mission ON sessions(mission_execution_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_pinned ON contacts(pinned) WHERE pinned = 1;
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(last_contact_date);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);
CREATE INDEX IF NOT EXISTS idx_priorities_date ON priorities(date);
CREATE INDEX IF NOT EXISTS idx_priorities_level ON priorities(level);
CREATE INDEX IF NOT EXISTS idx_pings_unread ON pings(acknowledged_at) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pings_session ON pings(session_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_session ON handoffs(session_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_pending ON handoffs(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_observations_unprocessed ON observations(processed_at)
    WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observations_explore ON observations(needs_exploration)
    WHERE needs_exploration = 1 AND processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(source_session);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, date);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_timers_active ON timers(ends_at);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(remind_at)
    WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at);
CREATE INDEX IF NOT EXISTS idx_priorities_date_level ON priorities(date, level);
CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_calendar_accounts_provider ON calendar_accounts(provider_type);
CREATE INDEX IF NOT EXISTS idx_email_send_log_status ON email_send_log(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_send_at ON email_send_log(send_at);
CREATE INDEX IF NOT EXISTS idx_email_send_log_hour_bucket ON email_send_log(hour_bucket);
CREATE INDEX IF NOT EXISTS idx_email_send_log_requires_confirmation ON email_send_log(requires_confirmation) WHERE requires_confirmation = 1;
CREATE INDEX IF NOT EXISTS idx_contacts_extension_tags ON contacts_extension_tags(tag);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_enabled ON accounts(is_enabled) WHERE is_enabled = 1;
CREATE INDEX IF NOT EXISTS idx_accounts_claude ON accounts(is_claude_account) WHERE is_claude_account = 1;
CREATE INDEX IF NOT EXISTS idx_accounts_apple_guid ON accounts(apple_account_guid);
CREATE INDEX IF NOT EXISTS idx_sessions_active_context
ON sessions(ended_at, context_warning_level)
WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON claude_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chief_duties_slug ON chief_duties(slug);
CREATE INDEX IF NOT EXISTS idx_chief_duties_enabled ON chief_duties(enabled);
CREATE INDEX IF NOT EXISTS idx_chief_duty_executions_duty ON chief_duty_executions(duty_id);
CREATE INDEX IF NOT EXISTS idx_chief_duty_executions_status ON chief_duty_executions(status);
CREATE INDEX IF NOT EXISTS idx_chief_duty_executions_started ON chief_duty_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_missions_next ON missions(next_run)
    WHERE enabled = 1 AND next_run IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missions_app ON missions(app_slug);
CREATE INDEX IF NOT EXISTS idx_missions_slug ON missions(slug);
CREATE INDEX IF NOT EXISTS idx_missions_source ON missions(source);
CREATE INDEX IF NOT EXISTS idx_mission_executions_mission ON mission_executions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_executions_slug ON mission_executions(mission_slug);
CREATE INDEX IF NOT EXISTS idx_mission_executions_status ON mission_executions(status);
CREATE INDEX IF NOT EXISTS idx_mission_executions_recent ON mission_executions(started_at DESC);
CREATE TABLE IF NOT EXISTS workers_archive(
  id TEXT,
  task_type TEXT,
  params_json TEXT,
  depends_on_json TEXT,
  has_dependent_children INT,
  execute_at TEXT,
  priority INT,
  retry_count INT,
  retry_at TEXT,
  dedupe_hash TEXT,
  status TEXT,
  last_error TEXT,
  system_log_path TEXT,
  report_md TEXT,
  report_summary TEXT,
  live_output TEXT,
  attention_title TEXT,
  attention_kind TEXT,
  attention_severity TEXT,
  attention_domain TEXT,
  attention_data_json TEXT,
  notify_after TEXT,
  clarification_session_id TEXT,
  clarification_answer TEXT,
  clarification_answered_at TEXT,
  spawned_by_session TEXT,
  conversation_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS workers (
    -- Core identity
    id TEXT PRIMARY KEY,                   -- UUID
    task_type TEXT NOT NULL,               -- 'research', 'analyze', 'organize', etc.
    params_json TEXT NOT NULL,             -- Task parameters as JSON
    depends_on_json TEXT,                  -- JSON array of worker IDs this depends on
    has_dependent_children INTEGER DEFAULT 0,  -- Boolean: other workers depend on this one

    -- Execution scheduling
    execute_at TEXT,                       -- ISO8601 timestamp (NULL = immediate)
    priority INTEGER NOT NULL DEFAULT 0,   -- Higher = more urgent
    retry_count INTEGER NOT NULL DEFAULT 0,
    retry_at TEXT,                         -- ISO8601 timestamp for retry
    dedupe_hash TEXT UNIQUE,               -- Hash to prevent duplicate workers

    -- Execution lifecycle
    status TEXT NOT NULL                   -- Worker execution status
        CHECK (status IN (
            'pending',
            'running',
            'awaiting_clarification',
            'complete',
            'failed',
            'clarification_answered',
            'snoozed',
            'cancelled'
        )),
    last_error TEXT,                       -- Error message if failed

    -- Output
    system_log_path TEXT,                  -- Path to execution log
    report_md TEXT,                        -- Full report.md content
    report_summary TEXT,                   -- Quick summary from report frontmatter
    live_output TEXT,                      -- Streaming output during execution

    -- Attention lifecycle
    attention_title TEXT,                  -- Display title
    attention_kind TEXT                    -- result, clarification, alert, followup
        CHECK (attention_kind IN ('result', 'clarification', 'alert', 'followup', NULL)),
    attention_severity TEXT DEFAULT 'normal'
        CHECK (attention_severity IN ('urgent', 'high', 'normal', 'low')),
    attention_domain TEXT,                 -- Life domain (Career, Health, etc)
    attention_data_json TEXT,              -- Flexible metadata

    -- Attention scheduling
    notify_after TEXT,                     -- NULL = ready now, future = snoozed

    -- Clarification support
    clarification_session_id TEXT,         -- Claude session ID for resume
    clarification_answer TEXT,             -- User's answer
    clarification_answered_at TEXT,        -- When answered

    -- Session ownership
    spawned_by_session TEXT,               -- Session that created this worker (for history)
    conversation_id TEXT,                  -- Conversation that owns this worker (primary ownership, Jan 2026)

    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_workers_ready ON workers(status, execute_at);
CREATE INDEX IF NOT EXISTS idx_workers_type ON workers(task_type);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_attention_pending ON workers(status)
    WHERE status IN ('complete', 'failed', 'clarification_answered', 'snoozed');
CREATE INDEX IF NOT EXISTS idx_workers_notify ON workers(notify_after);
CREATE INDEX IF NOT EXISTS idx_workers_kind ON workers(attention_kind);
CREATE INDEX IF NOT EXISTS idx_workers_domain ON workers(attention_domain);
CREATE INDEX IF NOT EXISTS idx_workers_clarification_answered ON workers(clarification_answered_at)
    WHERE clarification_answered_at IS NOT NULL AND status = 'clarification_answered';
CREATE INDEX IF NOT EXISTS idx_workers_session ON workers(spawned_by_session);
CREATE INDEX IF NOT EXISTS idx_workers_conversation ON workers(conversation_id);
CREATE TABLE IF NOT EXISTS triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL                      -- 'scheduled' or 'calendar'
        CHECK (type IN ('scheduled', 'calendar')),
    time_spec TEXT NOT NULL,                -- HH:MM for scheduled, minutes for calendar (e.g., '15')
    enabled INTEGER NOT NULL DEFAULT 1,     -- Boolean: is this trigger active
    last_run TEXT,                          -- ISO8601 timestamp of last execution
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(type, time_spec)                 -- Prevent duplicate triggers
);
