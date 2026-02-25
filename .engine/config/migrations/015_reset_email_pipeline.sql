-- Migration 015: Email pipeline redesign
-- Add received_at column to track actual email date (not sync date).
-- Mark all existing emails as classified — initialization phase
-- will handle the baseline going forward.

ALTER TABLE email_metadata ADD COLUMN received_at TEXT;

-- Mark everything as classified so the new pipeline starts clean.
-- The _ensure_initialized() method handles the proper baseline.
UPDATE email_metadata SET classified = 1;
