-- Drop dead tables from legacy duty scheduler and triggers systems
-- These have been replaced by the cron scheduler (SCHEDULE.md)

DROP TABLE IF EXISTS chief_duty_executions;
DROP TABLE IF EXISTS chief_duties;
DROP TABLE IF EXISTS triggers;
