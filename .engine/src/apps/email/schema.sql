-- Email App Schema (Direct-Read Apple Mail + Send Safeguards)
-- Data-plane reads come from Apple Mail SQLite (read-only).
-- System DB only stores send safeguards.
--
-- NOTE: email_accounts and email_settings tables have been removed.
-- Account configuration is now in the unified 'accounts' table.
-- Safety settings are now in the unified 'settings' table.
-- See migrations 034, 035, 036 for the migration path.

CREATE TABLE IF NOT EXISTS email_send_log (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,  -- References accounts.id
    to_emails TEXT NOT NULL,  -- JSON array
    cc_emails TEXT,
    bcc_emails TEXT,
    subject TEXT,
    content_hash TEXT,
    content_preview TEXT,
    content_full TEXT,
    status TEXT DEFAULT 'queued',  -- 'queued', 'sent', 'failed', 'cancelled'
    queued_at TEXT DEFAULT (datetime('now')),
    send_at TEXT,
    sent_at TEXT,
    hour_bucket TEXT,
    requires_confirmation INTEGER DEFAULT 0,
    error_message TEXT,
    provider_message_id TEXT,
    retry_count INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_status ON email_send_log(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_send_at ON email_send_log(send_at);
CREATE INDEX IF NOT EXISTS idx_email_send_log_hour_bucket ON email_send_log(hour_bucket);
CREATE INDEX IF NOT EXISTS idx_email_send_log_requires_confirmation ON email_send_log(requires_confirmation)
    WHERE requires_confirmation = 1;

CREATE TABLE IF NOT EXISTS email_rate_limits (
    hour_bucket TEXT PRIMARY KEY,
    emails_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_known_recipients (
    email_address TEXT PRIMARY KEY,
    first_sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at TEXT,
    total_emails_sent INTEGER DEFAULT 0,
    auto_approved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
