-- =====================================================================
-- Migration 006: Service Access Tiers & Defaults
-- =====================================================================
-- Replaces 11 per-account boolean capability flags with 4 service-level
-- access tiers (read / assist / autonomous). Adds service_defaults for
-- smart routing configuration.
-- =====================================================================

-- Step 1: Create new tables
CREATE TABLE IF NOT EXISTS service_access (
    service TEXT PRIMARY KEY
        CHECK (service IN ('email', 'calendar', 'contacts', 'messages')),
    tier TEXT NOT NULL DEFAULT 'assist'
        CHECK (tier IN ('read', 'assist', 'autonomous')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_defaults (
    service TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (service, key)
);

-- Step 2: Populate service_access from current account capabilities
-- Logic: if ANY enabled account has the capability, the service tier reflects it
INSERT OR IGNORE INTO service_access (service, tier, updated_at) VALUES
    ('email',
     CASE
         WHEN EXISTS (SELECT 1 FROM accounts WHERE can_send_email = 1 AND is_enabled = 1) THEN 'autonomous'
         WHEN EXISTS (SELECT 1 FROM accounts WHERE can_draft_email = 1 AND is_enabled = 1) THEN 'assist'
         WHEN EXISTS (SELECT 1 FROM accounts WHERE can_read_email = 1 AND is_enabled = 1) THEN 'read'
         ELSE 'read'
     END,
     datetime('now')),
    ('calendar',
     CASE
         WHEN EXISTS (SELECT 1 FROM accounts WHERE can_delete_calendar = 1 AND is_enabled = 1) THEN 'autonomous'
         WHEN EXISTS (SELECT 1 FROM accounts WHERE can_create_calendar = 1 AND is_enabled = 1) THEN 'assist'
         ELSE 'read'
     END,
     datetime('now')),
    ('contacts', 'assist', datetime('now')),
    ('messages',
     CASE
         WHEN EXISTS (SELECT 1 FROM accounts WHERE can_send_messages = 1 AND is_enabled = 1) THEN 'assist'
         ELSE 'read'
     END,
     datetime('now'));

-- Step 3: Populate service_defaults from current state
INSERT OR IGNORE INTO service_defaults (service, key, value) VALUES
    ('email', 'draft_account',
     COALESCE(
         (SELECT id FROM accounts WHERE is_primary = 1 AND is_enabled = 1 LIMIT 1),
         ''
     )),
    ('email', 'send_account',
     COALESCE(
         (SELECT id FROM accounts WHERE is_claude_account = 1 AND is_enabled = 1 LIMIT 1),
         ''
     )),
    ('email', 'read_account',
     COALESCE(
         (SELECT id FROM accounts WHERE is_primary = 1 AND is_enabled = 1 LIMIT 1),
         ''
     )),
    ('email', 'send_delay_seconds',
     COALESCE(
         (SELECT value FROM settings WHERE key = 'email_send_delay'),
         '15'
     )),
    ('email', 'rate_limit_per_hour',
     COALESCE(
         (SELECT value FROM settings WHERE key = 'email_rate_limit'),
         '50'
     ));

-- Step 4: Migrate calendar defaults
INSERT OR IGNORE INTO service_defaults (service, key, value) VALUES
    ('calendar', 'default_calendar',
     COALESCE(
         (SELECT json_extract(config_json, '$.preferred_calendars[0]')
          FROM accounts WHERE calendar_owner_email IS NOT NULL AND is_enabled = 1 LIMIT 1),
         'Calendar'
     ));
