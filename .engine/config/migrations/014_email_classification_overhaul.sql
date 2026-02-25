-- Migration 014: Email classification overhaul
-- Redesign from rigid category labels to intelligence briefings
-- New categories: action_needed, heads_up, fyi, noise (replacing spam/low/important/urgent/error)
-- New field: briefing (Chief-facing intel). Drop rigid metadata fields.

-- SQLite can't ALTER CHECK constraints or DROP columns easily.
-- Strategy: create new table, migrate data, swap.

CREATE TABLE IF NOT EXISTS email_classifications_new (
    id TEXT PRIMARY KEY,
    email_message_id TEXT NOT NULL,
    account_id TEXT NOT NULL,

    -- Classification (the 3 fields that matter)
    category TEXT NOT NULL
        CHECK (category IN ('action_needed', 'heads_up', 'fyi', 'noise')),
    summary TEXT,          -- Personalized one-liner for Will
    briefing TEXT,         -- Rich intel for Chief

    -- Legacy (keeping for backwards compat during transition)
    reasoning TEXT,        -- Why this classification (renamed from 'reason')

    -- Context snapshot (pipeline backfills after agent runs)
    sender TEXT,
    subject TEXT,
    preview TEXT,

    -- Performance
    processing_time_ms INTEGER,
    classified_at TEXT NOT NULL,

    FOREIGN KEY (email_message_id, account_id)
        REFERENCES email_metadata(email_message_id, account_id)
);

-- Migrate existing data with category mapping
INSERT OR IGNORE INTO email_classifications_new
    (id, email_message_id, account_id, category, summary, briefing, reasoning,
     sender, subject, preview, processing_time_ms, classified_at)
SELECT
    id, email_message_id, account_id,
    CASE category
        WHEN 'urgent' THEN 'action_needed'
        WHEN 'important' THEN 'heads_up'
        WHEN 'low' THEN 'fyi'
        WHEN 'spam' THEN 'noise'
        WHEN 'error' THEN 'noise'
        ELSE 'fyi'
    END,
    summary,
    NULL,  -- no briefing for old classifications
    reason,
    sender, subject, preview,
    processing_time_ms, classified_at
FROM email_classifications;

-- Swap tables
DROP TABLE IF EXISTS email_classifications;
ALTER TABLE email_classifications_new RENAME TO email_classifications;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_classifications_message
ON email_classifications(email_message_id, account_id);
CREATE INDEX IF NOT EXISTS idx_classifications_category
ON email_classifications(category, classified_at DESC);
CREATE INDEX IF NOT EXISTS idx_classifications_recent
ON email_classifications(classified_at DESC);
