-- Messages App Schema (Direct-Read Apple Messages)
-- Data-plane reads come from Apple Messages SQLite (read-only).
-- System DB only stores config + preferences (minimal).

-- Messages settings (optional preferences)
CREATE TABLE IF NOT EXISTS messages_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO messages_settings (key, value) VALUES
    ('default_limit', '50'),
    ('include_attachments', 'true');

-- Note: No message cache tables - we read directly from Apple Messages DB
-- ~/Library/Messages/chat.db
