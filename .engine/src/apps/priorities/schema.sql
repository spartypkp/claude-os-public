-- Priorities App Schema
-- Tables for priority/task management

-- Main priorities table
CREATE TABLE IF NOT EXISTS priorities (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('critical', 'medium', 'low')),
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    position INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_priorities_date ON priorities(date);
CREATE INDEX IF NOT EXISTS idx_priorities_level ON priorities(level);
CREATE INDEX IF NOT EXISTS idx_priorities_date_level ON priorities(date, level);

