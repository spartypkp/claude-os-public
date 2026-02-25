-- Add notified_chief_at column to sessions for notification deduplication.
-- Prevents duplicate completion notifications when done() is retried.
ALTER TABLE sessions ADD COLUMN notified_chief_at TEXT;
