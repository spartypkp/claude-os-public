-- Contacts App Schema
-- Tables for contact management with multi-provider support

-- Provider configurations (CardDAV, Google, etc.)
CREATE TABLE IF NOT EXISTS contacts_providers (
    id TEXT PRIMARY KEY,
    provider_type TEXT NOT NULL,  -- 'apple', 'carddav', 'google', 'local'
    name TEXT NOT NULL,           -- Display name
    config_json TEXT,             -- Provider-specific config (encrypted in production)
    enabled INTEGER DEFAULT 1,
    last_sync_at TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Main contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    company TEXT,
    role TEXT,
    location TEXT,
    description TEXT,
    relationship TEXT,
    context_notes TEXT,
    value_exchange TEXT,
    notes TEXT,
    pinned INTEGER DEFAULT 0,
    source TEXT DEFAULT 'manual',  -- 'manual', 'apple', 'carddav', 'sync'
    external_id TEXT,              -- ID from external provider
    last_contact_date TEXT,
    imessage_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(external_id, source)
);

-- Contact tags (many-to-many)
CREATE TABLE IF NOT EXISTS contact_tags (
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (contact_id, tag)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_pinned ON contacts(pinned);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_external ON contacts(external_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);

