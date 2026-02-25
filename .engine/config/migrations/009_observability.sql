-- Migration 009: Observability infrastructure
-- Adds tool call tracking, verification pass/fail, and specialist tasks view

-- 1. Tool calls table
CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    called_at TEXT NOT NULL,
    duration_ms INTEGER,
    success INTEGER,
    error_type TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_date ON tool_calls(called_at DESC);

-- 2. Verification passed column on sessions
ALTER TABLE sessions ADD COLUMN verification_passed INTEGER;

-- 3. Specialist tasks view
CREATE VIEW IF NOT EXISTS specialist_tasks AS
SELECT
    s.conversation_id,
    MIN(s.role) as role,
    MIN(s.spec_path) as spec_path,
    MIN(CASE WHEN s.mode = 'preparation' THEN s.started_at END) as prep_started,
    MAX(CASE WHEN s.mode = 'verification' THEN s.ended_at END) as task_ended,
    COUNT(CASE WHEN s.mode = 'implementation' THEN 1 END) as impl_iterations,
    MAX(CASE WHEN s.mode = 'verification' THEN s.verification_passed END) as passed,
    SUM(
        CASE WHEN s.ended_at IS NOT NULL
        THEN (julianday(s.ended_at) - julianday(s.started_at)) * 24 * 60
        ELSE NULL END
    ) as total_duration_min
FROM sessions s
WHERE s.conversation_id IS NOT NULL
    AND s.role NOT IN ('chief', 'system')
GROUP BY s.conversation_id;
