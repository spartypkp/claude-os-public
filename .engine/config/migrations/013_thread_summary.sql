-- Migration 013: Add thread_summary to email_classifications
-- Stores per-thread summarization when an email is part of a conversation

ALTER TABLE email_classifications ADD COLUMN thread_summary TEXT;
