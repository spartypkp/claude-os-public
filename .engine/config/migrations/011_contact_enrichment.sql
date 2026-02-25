-- Contact History (append-only interaction log)
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

-- New columns on contacts table
ALTER TABLE contacts ADD COLUMN current_state TEXT;
ALTER TABLE contacts ADD COLUMN linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN contact_cadence INTEGER;
