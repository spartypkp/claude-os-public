-- Email Classifier Overhaul
-- Adds: sender rules, classification feedback, extracted content

-- Sender rules: three-tier system (always/never/suggest)
-- Rules have implicit priority: always > never > suggest > LLM
CREATE TABLE IF NOT EXISTS email_sender_rules (
    id TEXT PRIMARY KEY,
    match_type TEXT NOT NULL CHECK (match_type IN ('domain', 'sender')),
    match_value TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('always', 'never', 'suggest')),
    category TEXT NOT NULL CHECK (category IN ('action_needed', 'heads_up', 'fyi', 'noise')),
    instructions TEXT,
    extract_content BOOLEAN DEFAULT 0,
    enabled BOOLEAN DEFAULT 1,
    created_from TEXT DEFAULT 'manual',
    times_applied INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sender_rules_domain
ON email_sender_rules(match_type, match_value) WHERE enabled = 1;

-- Classification feedback: corrections logged for batch review
CREATE TABLE IF NOT EXISTS email_classification_feedback (
    id TEXT PRIMARY KEY,
    classification_id TEXT NOT NULL,
    email_message_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    original_category TEXT NOT NULL,
    corrected_category TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    notes TEXT,
    rule_created BOOLEAN DEFAULT 0,
    prompt_version TEXT,
    created_at TEXT NOT NULL,
    reviewed BOOLEAN DEFAULT 0,
    promoted_to_eval BOOLEAN DEFAULT 0,
    FOREIGN KEY (classification_id) REFERENCES email_classifications(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_unreviewed
ON email_classification_feedback(reviewed, created_at DESC) WHERE reviewed = 0;

-- Extracted content column for newsletter digests
ALTER TABLE email_classifications ADD COLUMN extracted_content TEXT;

-- Track which rule (if any) was applied to this classification
ALTER TABLE email_classifications ADD COLUMN rule_id TEXT;
