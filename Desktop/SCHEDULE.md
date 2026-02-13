# Schedule

## Heartbeat
*/15 * * * * | inject chief | [WAKE]

## Daily
0 6 * * * | inject chief | /morning-reset | critical
0 20 * * * | inject chief | /evening-checkin

## Recurring
# Add recurring check-ins here:
# 0 9,12,15,18 * * * | inject chief | /money-checkup

## Specialists
# Spawn specialists on a schedule:
# 0 1 * * * | spawn curator | Desktop/scheduled/overnight-cleanup-spec.md

## System Maintenance
0 3 * * * | exec | vacuum_database
0 4 * * * | exec | rotate_logs
0 5 * * * | exec | cleanup_orphan_sessions

## One-Off
