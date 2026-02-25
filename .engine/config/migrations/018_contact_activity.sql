-- Contact Activity Feed
-- Tracks relationship intelligence events for the Contacts activity feed.
-- Each row is one meaningful event: signal touch, enrichment, history added, etc.

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
