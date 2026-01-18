-- Missions App Schema
-- Unified mission management for Claude OS
-- This is the ONLY source of truth for missions (replaces old scheduled_missions + missions tables)

-- Mission definitions - all sources (core_protected, core_default, custom_app, user)
CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,                    -- UUID
    
    -- Identity
    name TEXT NOT NULL,                     -- "Memory Consolidation"
    slug TEXT NOT NULL UNIQUE,              -- "memory-consolidation"
    description TEXT,                       -- What this mission does
    
    -- Source tracking
    source TEXT NOT NULL                    -- 'core_protected', 'core_default', 'custom_app', 'user'
        CHECK (source IN ('core_protected', 'core_default', 'custom_app', 'user')),
    app_slug TEXT,                          -- Which app owns this (NULL for core/user)
    
    -- Prompt configuration
    prompt_type TEXT NOT NULL DEFAULT 'file'-- 'file', 'inline'
        CHECK (prompt_type IN ('file', 'inline')),
    prompt_file TEXT,                       -- Path to .md prompt file
    prompt_inline TEXT,                     -- Alternative: inline instructions
    
    -- Schedule configuration (for scheduled missions)
    schedule_type TEXT                      -- 'cron', 'time', 'relative', NULL (for triggered)
        CHECK (schedule_type IN ('cron', 'time', 'relative', NULL)),
    schedule_cron TEXT,                     -- "0 6 * * *" (6 AM daily)
    schedule_time TEXT,                     -- "06:00" (HH:MM, Pacific)
    schedule_days TEXT,                     -- JSON array: ["mon", "tue", "wed", "thu", "fri"]
    
    -- Trigger configuration (for triggered missions)
    trigger_type TEXT                       -- 'file_change', 'calendar_event', 'app_hook', NULL
        CHECK (trigger_type IN ('file_change', 'calendar_event', 'app_hook', NULL)),
    trigger_config_json TEXT,               -- Trigger-specific configuration
    
    -- Execution settings
    timeout_minutes INTEGER DEFAULT 60,     -- Max runtime before force-kill
    role TEXT DEFAULT 'chief',              -- Claude role to spawn
    mode TEXT DEFAULT 'mission',            -- Claude mode
    
    -- State
    enabled BOOLEAN NOT NULL DEFAULT 1,     -- Is this mission active?
    protected BOOLEAN NOT NULL DEFAULT 0,   -- Cannot be disabled?
    next_run TEXT,                          -- ISO8601 UTC (computed for scheduled)
    last_run TEXT,                          -- When last executed
    last_status TEXT                        -- 'completed', 'failed', 'timeout'
        CHECK (last_status IN ('completed', 'failed', 'timeout', NULL)),
    
    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_next ON missions(next_run)
    WHERE enabled = 1 AND next_run IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missions_app ON missions(app_slug);
CREATE INDEX IF NOT EXISTS idx_missions_slug ON missions(slug);
CREATE INDEX IF NOT EXISTS idx_missions_source ON missions(source);

-- Mission executions (history)
CREATE TABLE IF NOT EXISTS mission_executions (
    id TEXT PRIMARY KEY,                    -- Execution UUID
    mission_id TEXT NOT NULL,               -- FK to missions.id
    mission_slug TEXT NOT NULL,             -- Denormalized for queries
    
    -- Execution lifecycle
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'timeout', 'cancelled')),
    
    -- Session linkage
    session_id TEXT,                        -- FK to sessions.session_id
    
    -- Output
    transcript_path TEXT,
    output_summary TEXT,                    -- Brief description of what was done
    error_message TEXT,                     -- If failed
    
    -- Metrics
    duration_seconds INTEGER,
    
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_executions_mission ON mission_executions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_executions_slug ON mission_executions(mission_slug);
CREATE INDEX IF NOT EXISTS idx_mission_executions_status ON mission_executions(status);
CREATE INDEX IF NOT EXISTS idx_mission_executions_recent ON mission_executions(started_at DESC);

