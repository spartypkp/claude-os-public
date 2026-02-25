-- Add triage columns to email_classifications
-- suggested_actions: newline-separated action suggestions for Chief
-- handled: whether this classification has been processed/triaged

ALTER TABLE email_classifications ADD COLUMN suggested_actions TEXT;
ALTER TABLE email_classifications ADD COLUMN handled BOOLEAN DEFAULT 0;

-- Auto-mark noise as handled (per design spec)
UPDATE email_classifications SET handled = 1 WHERE category = 'noise';

-- Index for efficient triage queries (unhandled items)
CREATE INDEX IF NOT EXISTS idx_classifications_unhandled
ON email_classifications(handled, category, classified_at DESC) WHERE handled = 0;
