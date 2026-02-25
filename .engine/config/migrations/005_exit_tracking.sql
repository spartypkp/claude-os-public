-- =====================================================================
-- Migration 005: Exit Tracking + Stage Refinement
-- =====================================================================
-- Adds exit_reason, exit_stage to opportunities.
-- Renames stages: reaching_out→applied, in_contact→screening, rejected→closed
-- Simplifies sources: abhi_referral→referral, direct_apply→direct, recruiter_inbound→recruiter
-- Removes CHECK constraints from stage/source/event_type (validated in code).
-- =====================================================================

PRAGMA foreign_keys = OFF;

-- 1. Recreate opportunities with new schema
CREATE TABLE IF NOT EXISTS opportunities_v3 (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    slug TEXT UNIQUE,
    stage TEXT NOT NULL,
    tier TEXT,
    fit_score INTEGER,
    source TEXT,
    job_url TEXT,
    opportunity_path TEXT,
    next_action TEXT,
    next_action_by TEXT,
    exit_reason TEXT,
    exit_stage TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. Copy with stage/source transformations
INSERT OR IGNORE INTO opportunities_v3
SELECT
    id, company, role, slug,
    CASE stage
        WHEN 'reaching_out' THEN 'applied'
        WHEN 'in_contact' THEN 'screening'
        WHEN 'rejected' THEN 'closed'
        WHEN 'paused' THEN 'closed'
        ELSE stage
    END,
    tier, fit_score,
    CASE source
        WHEN 'abhi_referral' THEN 'referral'
        WHEN 'direct_apply' THEN 'direct'
        WHEN 'recruiter_inbound' THEN 'recruiter'
        WHEN 'other' THEN NULL
        ELSE source
    END,
    job_url, opportunity_path, next_action, next_action_by,
    CASE stage
        WHEN 'rejected' THEN 'rejected'
        WHEN 'paused' THEN 'paused'
        ELSE NULL
    END,
    NULL,
    created_at, updated_at
FROM opportunities;

-- 3. Drop old, rename new
DROP TABLE IF EXISTS opportunities;
ALTER TABLE opportunities_v3 RENAME TO opportunities;

-- 4. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_company ON opportunities(company);
CREATE INDEX IF NOT EXISTS idx_opportunities_slug ON opportunities(slug);
CREATE INDEX IF NOT EXISTS idx_opportunities_tier ON opportunities(tier);
CREATE INDEX IF NOT EXISTS idx_opportunities_exit ON opportunities(exit_reason);

-- 5. Recreate opportunity_events without CHECK constraint
CREATE TABLE IF NOT EXISTS opportunity_events_v3 (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
);

INSERT OR IGNORE INTO opportunity_events_v3 SELECT * FROM opportunity_events;
DROP TABLE IF EXISTS opportunity_events;
ALTER TABLE opportunity_events_v3 RENAME TO opportunity_events;

CREATE INDEX IF NOT EXISTS idx_opportunity_events_opp ON opportunity_events(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_type ON opportunity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_created ON opportunity_events(created_at);

-- 6. Update old stage names in event old_value/new_value
UPDATE opportunity_events SET old_value = 'applied' WHERE old_value = 'reaching_out';
UPDATE opportunity_events SET new_value = 'applied' WHERE new_value = 'reaching_out';
UPDATE opportunity_events SET old_value = 'screening' WHERE old_value = 'in_contact';
UPDATE opportunity_events SET new_value = 'screening' WHERE new_value = 'in_contact';
UPDATE opportunity_events SET old_value = 'closed' WHERE old_value = 'rejected';
UPDATE opportunity_events SET new_value = 'closed' WHERE new_value = 'rejected';

PRAGMA foreign_keys = ON;
