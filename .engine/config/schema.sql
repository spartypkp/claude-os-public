-- =============================================================================
-- Claude OS Database Schema
-- =============================================================================
-- Generated: 2026-01-18
-- Source: .engine/data/db/system.db
--
-- This is the authoritative schema dump from the live database.
-- To regenerate: sqlite3 .engine/data/db/system.db ".schema" > .engine/config/schema.sql
--
-- Table count: 46 (after Feb 25 cleanup — dropped 10 deprecated tables)
-- =============================================================================

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
    mission_execution_id TEXT,             -- DEPRECATED: was FK to missions table (dropped Feb 25)

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
, conversation_id TEXT, parent_session_id TEXT, context_warning_level INTEGER DEFAULT 0, subscribed_by TEXT, spec_path TEXT, notified_chief_at TEXT, verification_passed INTEGER);
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

    -- Enrichment
    current_state TEXT,
    linkedin_url TEXT,
    contact_cadence INTEGER,

    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_history (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL
        REFERENCES contacts(id) ON DELETE CASCADE,
    entry TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'chief'
        CHECK (source IN ('chief', 'email', 'imessage', 'calendar', 'manual')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_history_contact
    ON contact_history(contact_id, entry_date DESC);
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
, conversation_id TEXT, content TEXT, spec_path TEXT);
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,               -- ISO8601 when sampled
    frontmost_app TEXT,                    -- Active application name
    window_title TEXT,                     -- Active window title
    idle_seconds REAL,                     -- Seconds since last input
    created_at TEXT DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS installed_apps (
                slug TEXT PRIMARY KEY,
                installed_at TEXT NOT NULL
            );
CREATE TABLE IF NOT EXISTS email_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
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
CREATE TABLE IF NOT EXISTS email_metadata (
    email_message_id TEXT NOT NULL,
    account_id TEXT NOT NULL,

    -- Processing flags
    processed BOOLEAN DEFAULT 0,
    classified BOOLEAN DEFAULT 0,
    analyzed BOOLEAN DEFAULT 0,

    -- Enrichment (JSON blob for flexibility)
    metadata_json TEXT,

    -- Timestamps
    received_at TEXT,            -- Actual email date (from Apple Mail)
    first_seen_at TEXT NOT NULL,  -- When pipeline first discovered this email
    last_updated_at TEXT NOT NULL,

    PRIMARY KEY (email_message_id, account_id)
);
CREATE TABLE IF NOT EXISTS email_classifications (
    id TEXT PRIMARY KEY,
    email_message_id TEXT NOT NULL,
    account_id TEXT NOT NULL,

    -- Classification (the 3 fields that matter)
    category TEXT NOT NULL
        CHECK (category IN ('action_needed', 'heads_up', 'fyi', 'noise')),
    summary TEXT,          -- Personalized one-liner for Will
    briefing TEXT,         -- Rich intel for Chief

    -- Legacy
    reasoning TEXT,        -- Why this classification

    -- Context snapshot (pipeline backfills after agent runs)
    display_name TEXT,     -- Human-friendly sender identity (e.g. "Modal (via Ashby)")
    sender TEXT,
    subject TEXT,
    preview TEXT,

    -- Triage
    suggested_actions TEXT,     -- Newline-separated action suggestions for Chief
    handled BOOLEAN DEFAULT 0, -- Whether this has been triaged/processed

    -- Content extraction (newsletters/digests)
    extracted_content TEXT,     -- Structured content extracted from newsletters
    rule_id TEXT,               -- Which sender rule was applied (if any)

    -- Timestamps
    received_at TEXT,           -- When email was actually received
    processing_time_ms INTEGER,
    classified_at TEXT NOT NULL,

    FOREIGN KEY (email_message_id, account_id)
        REFERENCES email_metadata(email_message_id, account_id)
);
CREATE TABLE IF NOT EXISTS email_sender_rules (
    id TEXT PRIMARY KEY,
    match_type TEXT NOT NULL CHECK (match_type IN ('domain', 'sender')),
    match_value TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('always', 'never', 'suggest')),
    category TEXT NOT NULL CHECK (category IN ('action_needed', 'heads_up', 'fyi', 'noise')),
    instructions TEXT,
    extract_content BOOLEAN DEFAULT 0,
    enabled BOOLEAN DEFAULT 1,
    created_from TEXT DEFAULT 'manual',
    times_applied INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_classification_feedback (
    id TEXT PRIMARY KEY,
    classification_id TEXT NOT NULL,
    email_message_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    original_category TEXT NOT NULL,
    corrected_category TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    notes TEXT,
    rule_created BOOLEAN DEFAULT 0,
    prompt_version TEXT,
    created_at TEXT NOT NULL,
    reviewed BOOLEAN DEFAULT 0,
    promoted_to_eval BOOLEAN DEFAULT 0,
    FOREIGN KEY (classification_id) REFERENCES email_classifications(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_role ON sessions(role);
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(mode);
CREATE INDEX IF NOT EXISTS idx_sessions_heartbeat ON sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_pinned ON contacts(pinned) WHERE pinned = 1;
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(last_contact_date);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);
CREATE INDEX IF NOT EXISTS idx_priorities_date ON priorities(date);
CREATE INDEX IF NOT EXISTS idx_priorities_level ON priorities(level);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_session ON handoffs(session_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_pending ON handoffs(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, date);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at);
CREATE INDEX IF NOT EXISTS idx_priorities_date_level ON priorities(date, level);
CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
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
CREATE INDEX IF NOT EXISTS idx_email_meta_processed
ON email_metadata(processed, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_meta_classified
ON email_metadata(classified) WHERE classified = 0;
CREATE INDEX IF NOT EXISTS idx_classifications_email
ON email_classifications(email_message_id, account_id);
CREATE INDEX IF NOT EXISTS idx_classifications_category
ON email_classifications(category, classified_at DESC);
CREATE INDEX IF NOT EXISTS idx_classifications_recent
ON email_classifications(classified_at DESC);
CREATE INDEX IF NOT EXISTS idx_classifications_unhandled
ON email_classifications(handled, category, classified_at DESC) WHERE handled = 0;
CREATE VIEW IF NOT EXISTS leetcode_impl_status AS
SELECT
    p.*,
    COALESCE(a.outcome, 'not_started') as current_status,
    a.attempt_date as last_attempt,
    a.notes as last_notes,
    a.time_minutes as last_time
FROM leetcode_problems p
LEFT JOIN (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY problem_number ORDER BY attempt_date DESC) as rn
    FROM leetcode_impl_attempts
) a ON p.problem_number = a.problem_number AND a.rn = 1
/* leetcode_impl_status(problem_number,name,slug,category,difficulty,leetcode_url,neetcode_url,pattern,front_text,back_text,signals,current_status,last_attempt,last_notes,last_time) */;
CREATE VIEW IF NOT EXISTS leetcode_speedrun_status AS
SELECT
    p.problem_number,
    p.name,
    p.pattern,
    s.next_review,
    s.interval_days,
    s.ease_factor,
    CASE
        WHEN s.next_review IS NULL THEN 'new'
        WHEN s.next_review <= date('now') THEN 'due'
        ELSE 'scheduled'
    END as review_status
FROM leetcode_problems p
LEFT JOIN (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY problem_number ORDER BY attempted_at DESC) as rn
    FROM leetcode_speedrun_attempts
) s ON p.problem_number = s.problem_number AND s.rn = 1
WHERE p.front_text IS NOT NULL
/* leetcode_speedrun_status(problem_number,name,pattern,next_review,interval_days,ease_factor,review_status) */;

-- =============================================================================
-- Ember - Claude's Pet
-- =============================================================================

-- =============================================================================
-- Cron Scheduler
-- =============================================================================

CREATE TABLE IF NOT EXISTS cron_entries (
    id TEXT PRIMARY KEY,
    expression TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    critical INTEGER DEFAULT 0,
    one_off INTEGER DEFAULT 0,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cron_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL,
    fired_at TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cron_log_entry ON cron_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_cron_log_fired ON cron_log(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_entries_next ON cron_entries(next_run)
    WHERE enabled = 1;

-- Telegram message log (for context recovery)
CREATE TABLE IF NOT EXISTS telegram_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    chat_type TEXT NOT NULL,          -- 'private', 'group', 'supergroup'
    chat_title TEXT,                  -- group name (null for DMs)
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    message_text TEXT NOT NULL,
    direction TEXT NOT NULL,          -- 'inbound' or 'outbound'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat ON telegram_messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_created ON telegram_messages(created_at DESC);

-- =============================================================================
-- Service Access & Defaults
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_access (
    service TEXT PRIMARY KEY
        CHECK (service IN ('email', 'calendar', 'contacts', 'messages')),
    tier TEXT NOT NULL DEFAULT 'assist'
        CHECK (tier IN ('read', 'assist', 'autonomous')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed with sane defaults
INSERT OR IGNORE INTO service_access (service, tier) VALUES
    ('email', 'assist'),
    ('calendar', 'assist'),
    ('contacts', 'assist'),
    ('messages', 'read');

-- =============================================================================
-- Tool Calls Tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    called_at TEXT NOT NULL,
    duration_ms INTEGER,
    success INTEGER,
    error_type TEXT,
    detail TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_date ON tool_calls(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_detail ON tool_calls(tool_name, detail) WHERE detail IS NOT NULL;

-- =============================================================================
-- Specialist Tasks View
-- =============================================================================

CREATE VIEW IF NOT EXISTS specialist_tasks AS
SELECT
    s.conversation_id,
    MIN(s.role) as role,
    MIN(s.spec_path) as spec_path,
    MIN(CASE WHEN s.mode = 'preparation' THEN s.started_at END) as prep_started,
    MAX(CASE WHEN s.mode = 'verification' THEN s.ended_at END) as task_ended,
    COUNT(CASE WHEN s.mode = 'implementation' THEN 1 END) as impl_iterations,
    MAX(CASE WHEN s.mode = 'verification' THEN s.verification_passed END) as passed,
    SUM(
        CASE WHEN s.ended_at IS NOT NULL
        THEN (julianday(s.ended_at) - julianday(s.started_at)) * 24 * 60
        ELSE NULL END
    ) as total_duration_min
FROM sessions s
WHERE s.conversation_id IS NOT NULL
    AND s.role NOT IN ('chief', 'system')
GROUP BY s.conversation_id;

CREATE TABLE IF NOT EXISTS service_defaults (
    service TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (service, key)
);

-- =============================================================================
-- Contact Activity Feed
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_activity (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'signal_touch', 'created', 'updated', 'enriched', 'history_added'
    )),
    description TEXT NOT NULL,
    source TEXT,  -- email, calendar, imessage, chief, manual
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_activity_time
ON contact_activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_activity_contact
ON contact_activity(contact_id, created_at DESC);
