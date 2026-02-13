-- =============================================================================
-- Claude OS Database Schema
-- =============================================================================
-- Generated: 2026-01-18
-- Source: .engine/data/db/system.db
--
-- This is the authoritative schema dump from the live database.
-- To regenerate: sqlite3 .engine/data/db/system.db ".schema" > .engine/config/schema.sql
--
-- Table count: 35 (after audit cleanup)
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
, conversation_id TEXT, parent_session_id TEXT, context_warning_level INTEGER DEFAULT 0, subscribed_by TEXT, spec_path TEXT);
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
CREATE TABLE IF NOT EXISTS job_pipeline (
    id TEXT PRIMARY KEY,                   -- UUID
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    stage TEXT NOT NULL                    -- 'research' | 'applied' | 'screen' | 'interview' | 'offer' | 'rejected'
        CHECK (stage IN ('research', 'applied', 'screen', 'interview', 'offer', 'rejected')),
    fit_score INTEGER,                     -- 0-100
    referrer TEXT,
    key_contact TEXT,
    notes TEXT,
    opportunity_path TEXT,                 -- Path to Documents/job-search/opportunities/[company]/
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
, tier TEXT CHECK (tier IN ('S', 'S-', 'A', 'B', 'B-', 'C', NULL)), slug TEXT, job_url TEXT);
CREATE TABLE IF NOT EXISTS mock_interviews (
    id TEXT PRIMARY KEY,                    -- 8-char UUID
    partner TEXT NOT NULL,                  -- Who gave the mock
    type TEXT,                              -- "behavioral", "DSA", "system design" (free text)
    scheduled_date TEXT,                    -- ISO datetime (when scheduled for)
    completed_date TEXT,                    -- NULL = not yet done
    calendar_event_id TEXT,                 -- Optional link to Apple Calendar
    content TEXT,                           -- What we went over (problem, questions asked)
    feedback TEXT,                          -- From interviewer
    analysis TEXT,                          -- Will/Claude takeaways after debrief
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leetcode_problems (
    problem_number INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT,
    leetcode_url TEXT,
    neetcode_url TEXT,
    -- Flashcard fields (nullable until populated)
    pattern TEXT,                           -- "Hash Map", "Two Pointers", etc.
    front_text TEXT,                        -- Condensed prompt for speedrun
    back_text TEXT,                         -- Pattern + why + approach
    signals TEXT,                           -- JSON array: ["target sum", "indices"]
    domain TEXT DEFAULT 'leetcode'          -- Domain: 'leetcode', 'concurrency', etc.
);
CREATE INDEX IF NOT EXISTS idx_leetcode_problems_domain ON leetcode_problems(domain);
CREATE TABLE IF NOT EXISTS leetcode_impl_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_number INTEGER NOT NULL REFERENCES leetcode_problems,
    attempt_date TEXT NOT NULL,             -- YYYY-MM-DD (one per day max)
    outcome TEXT NOT NULL,                  -- 'solved', 'revisit', 'gave_up'
    time_minutes INTEGER,
    notes TEXT,                             -- Learning notes, approach used
    UNIQUE(problem_number, attempt_date)
);
CREATE TABLE IF NOT EXISTS leetcode_speedrun_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_number INTEGER NOT NULL REFERENCES leetcode_problems,
    attempted_at TEXT NOT NULL,             -- Full datetime (many per day OK)
    outcome TEXT NOT NULL,                  -- 'correct', 'partial', 'missed'
    response_seconds INTEGER,               -- How fast answered
    -- SRS scheduling fields
    interval_days INTEGER DEFAULT 1,
    ease_factor REAL DEFAULT 2.5,
    next_review TEXT                        -- YYYY-MM-DD
);
CREATE TABLE IF NOT EXISTS dsa_topics (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier INTEGER NOT NULL,                  -- 1, 2, or 3
    tier_name TEXT NOT NULL,                -- "Must Be Automatic", "High Priority", "Solid Foundation"
    implementations TEXT,                   -- JSON array
    patterns TEXT,                          -- JSON array
    related_leetcode TEXT,                  -- JSON array of category names
    -- Dynamic state
    confidence INTEGER DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
    first_full_impl TEXT,                   -- Date of first from-scratch implementation
    last_practiced TEXT,                    -- Most recent practice date
    notes TEXT
);
CREATE TABLE IF NOT EXISTS dsa_practice_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_slug TEXT NOT NULL REFERENCES dsa_topics(slug),
    practiced_at TEXT NOT NULL,
    practice_type TEXT NOT NULL,            -- 'full', 'refresh', 'speedrun'
    confidence_before INTEGER,
    confidence_after INTEGER,
    notes TEXT,
    session_id TEXT                         -- Groups speedrun attempts together (optional)
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
    first_seen_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,

    PRIMARY KEY (email_message_id, account_id)
);
CREATE TABLE IF NOT EXISTS email_classifications (
    id TEXT PRIMARY KEY,
    email_message_id TEXT NOT NULL,
    account_id TEXT NOT NULL,

    -- Classification
    category TEXT NOT NULL
        CHECK (category IN ('spam', 'low', 'important', 'error')),
    reason TEXT,
    matched_rules TEXT,
    confidence TEXT,

    -- Action
    action_taken TEXT
        CHECK (action_taken IN ('archived', 'marked_read', 'escalated', 'error', NULL)),
    escalated_to_chief BOOLEAN DEFAULT 0,

    -- Context snapshot
    sender TEXT,
    subject TEXT,
    preview TEXT,

    -- Performance
    processing_time_ms INTEGER,
    classified_at TEXT NOT NULL,

    FOREIGN KEY (email_message_id, account_id)
        REFERENCES email_metadata(email_message_id, account_id)
);
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
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_session ON handoffs(session_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_pending ON handoffs(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, date);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_job_pipeline_stage ON job_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_job_pipeline_company ON job_pipeline(company);
CREATE INDEX IF NOT EXISTS idx_mock_partner ON mock_interviews(partner);
CREATE INDEX IF NOT EXISTS idx_mock_type ON mock_interviews(type);
CREATE INDEX IF NOT EXISTS idx_mock_completed ON mock_interviews(completed_date);
CREATE INDEX IF NOT EXISTS idx_lc_category ON leetcode_problems(category);
CREATE INDEX IF NOT EXISTS idx_lc_pattern ON leetcode_problems(pattern);
CREATE INDEX IF NOT EXISTS idx_impl_date ON leetcode_impl_attempts(attempt_date);
CREATE INDEX IF NOT EXISTS idx_impl_outcome ON leetcode_impl_attempts(outcome);
CREATE INDEX IF NOT EXISTS idx_speedrun_next ON leetcode_speedrun_attempts(next_review);
CREATE INDEX IF NOT EXISTS idx_dsa_tier ON dsa_topics(tier);
CREATE INDEX IF NOT EXISTS idx_dsa_confidence ON dsa_topics(confidence);
CREATE INDEX IF NOT EXISTS idx_dsa_log_topic ON dsa_practice_log(topic_slug);
CREATE INDEX IF NOT EXISTS idx_dsa_log_date ON dsa_practice_log(practiced_at);
CREATE INDEX IF NOT EXISTS idx_dsa_log_session ON dsa_practice_log(session_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at);
CREATE INDEX IF NOT EXISTS idx_priorities_date_level ON priorities(date, level);
CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_status ON email_send_log(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_send_at ON email_send_log(send_at);
CREATE INDEX IF NOT EXISTS idx_email_send_log_hour_bucket ON email_send_log(hour_bucket);
CREATE INDEX IF NOT EXISTS idx_email_send_log_requires_confirmation ON email_send_log(requires_confirmation) WHERE requires_confirmation = 1;
CREATE INDEX IF NOT EXISTS idx_job_pipeline_tier ON job_pipeline(tier);
CREATE INDEX IF NOT EXISTS idx_job_pipeline_slug ON job_pipeline(slug);
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
-- Reading List
-- =============================================================================

CREATE TABLE IF NOT EXISTS reading_list_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    type TEXT NOT NULL DEFAULT 'book',
    status TEXT NOT NULL DEFAULT 'want-to-read',
    rating INTEGER,
    notes TEXT,
    tags TEXT,                -- JSON array
    added_date TEXT NOT NULL,
    started_date TEXT,
    finished_date TEXT
);

-- Seed data for Reading List example app
INSERT OR IGNORE INTO reading_list_items (id, title, author, type, status, rating, notes, tags, added_date, started_date, finished_date) VALUES
    -- Currently reading (3)
    ('seed-01', 'Thinking, Fast and Slow', 'Daniel Kahneman', 'book', 'reading', NULL, NULL, '["psychology","decision-making"]', '2025-12-15', '2026-01-10', NULL),
    ('seed-02', 'The Pragmatic Programmer', 'David Thomas & Andrew Hunt', 'book', 'reading', NULL, NULL, '["engineering","craft"]', '2026-01-05', '2026-01-20', NULL),
    ('seed-03', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 'book', 'reading', NULL, NULL, '["systems","databases"]', '2025-11-20', '2026-02-01', NULL),
    -- Want to read (4)
    ('seed-04', 'The Design of Everyday Things', 'Don Norman', 'book', 'want-to-read', NULL, NULL, '["design","ux"]', '2026-02-01', NULL, NULL),
    ('seed-05', 'Structure and Interpretation of Computer Programs', 'Harold Abelson & Gerald Jay Sussman', 'book', 'want-to-read', NULL, NULL, '["cs","fundamentals"]', '2026-01-28', NULL, NULL),
    ('seed-06', 'Meditations on First Philosophy', 'Rene Descartes', 'book', 'want-to-read', NULL, NULL, '["philosophy"]', '2026-02-05', NULL, NULL),
    ('seed-07', 'How to Build a Car', 'Adrian Newey', 'book', 'want-to-read', NULL, NULL, '["engineering","design"]', '2026-02-10', NULL, NULL),
    -- Finished (3)
    ('seed-08', 'Attention Is All You Need', 'Vaswani et al.', 'paper', 'finished', 5, 'The transformer paper that changed everything. Dense but essential reading for anyone in ML.', '["ml","transformers"]', '2025-09-01', '2025-09-05', '2025-09-15'),
    ('seed-09', 'The Mythical Man-Month', 'Frederick P. Brooks Jr.', 'book', 'finished', 4, 'Timeless insights on software project management. "Adding manpower to a late project makes it later" still holds.', '["engineering","management"]', '2025-10-10', '2025-10-15', '2025-11-20'),
    ('seed-10', 'A Few Useful Things to Know About Machine Learning', 'Pedro Domingos', 'article', 'finished', 4, 'Great overview of practical ML wisdom. Good for building intuition.', '["ml","overview"]', '2025-11-01', '2025-11-01', '2025-11-03'),
    -- Abandoned (1)
    ('seed-11', 'Godel, Escher, Bach', 'Douglas Hofstadter', 'book', 'abandoned', NULL, 'Fascinating but too dense for right now. Will revisit when I have more bandwidth.', '["math","philosophy"]', '2025-08-15', '2025-08-20', NULL);

-- =============================================================================
-- Ember - Claude's Pet
-- =============================================================================

CREATE TABLE IF NOT EXISTS pet_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'Ember',
    trace_count INTEGER DEFAULT 0,
    stage TEXT DEFAULT 'spark',
    mood TEXT DEFAULT 'resting',
    mood_color TEXT DEFAULT '#FFB347',
    last_fed TIMESTAMP,
    last_interaction TIMESTAMP,
    last_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pet_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK (direction IN ('to_ember', 'from_ember')),
    message TEXT NOT NULL,
    session_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pet_mood_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mood TEXT NOT NULL,
    color TEXT NOT NULL,
    trigger TEXT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Team Messaging - Reply Injection Tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS reply_injections (
    specialist_session_id TEXT NOT NULL,
    chief_session_id TEXT NOT NULL,
    message_position INTEGER NOT NULL,
    injected_at TEXT NOT NULL,
    PRIMARY KEY (specialist_session_id, message_position)
);

CREATE INDEX IF NOT EXISTS idx_reply_injections_specialist
    ON reply_injections(specialist_session_id);

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
