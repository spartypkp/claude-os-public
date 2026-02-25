-- =====================================================================
-- Migration 004: Job Search Overhaul
-- =====================================================================
-- Replace flat job_pipeline with 3-table opportunity system:
--   opportunities (core), opportunity_events (timeline), opportunity_contacts (people)
-- Migrate existing data, dedup, reject old pipeline (except Juicebox).
-- =====================================================================

-- 1. Create new tables
CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    slug TEXT UNIQUE,
    stage TEXT NOT NULL CHECK (stage IN ('researching', 'reaching_out', 'in_contact', 'interviewing', 'offer', 'rejected', 'paused')),
    tier TEXT CHECK (tier IN ('S', 'S-', 'A', 'B', 'B-', 'C', NULL)),
    fit_score INTEGER,
    source TEXT CHECK (source IN ('abhi_referral', 'network', 'direct_apply', 'recruiter_inbound', 'other', NULL)),
    job_url TEXT,
    opportunity_path TEXT,
    next_action TEXT,
    next_action_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_events (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'stage_change', 'tier_change', 'note', 'interaction', 'file_added', 'application', 'follow_up', 'next_action_set', 'contact_added')),
    description TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_contacts (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    contact_id TEXT,
    name TEXT NOT NULL,
    role TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

-- 2. Indexes on new tables
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_company ON opportunities(company);
CREATE INDEX IF NOT EXISTS idx_opportunities_slug ON opportunities(slug);
CREATE INDEX IF NOT EXISTS idx_opportunities_tier ON opportunities(tier);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_opp ON opportunity_events(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_type ON opportunity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_created ON opportunity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_opportunity_contacts_opp ON opportunity_contacts(opportunity_id);

-- 3. Rename old table as backup
ALTER TABLE job_pipeline RENAME TO job_pipeline_v2_backup;

-- 4. Drop old indexes that reference the renamed table
DROP INDEX IF EXISTS idx_job_pipeline_stage;
DROP INDEX IF EXISTS idx_job_pipeline_company;
DROP INDEX IF EXISTS idx_job_pipeline_tier;
DROP INDEX IF EXISTS idx_job_pipeline_slug;
