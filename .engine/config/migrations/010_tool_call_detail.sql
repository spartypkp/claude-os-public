-- Migration 010: Add detail column to tool_calls for parameter capture
-- Captures structural metadata (file paths, operations, patterns) per tool type

ALTER TABLE tool_calls ADD COLUMN detail TEXT;

-- Index for file path queries (Read/Write/Edit detail lookups)
CREATE INDEX IF NOT EXISTS idx_tool_calls_detail ON tool_calls(tool_name, detail)
WHERE detail IS NOT NULL;
