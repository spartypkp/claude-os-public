---
name: create-mission
description: Set up scheduled and automated Claude tasks
---

# Create Mission Skill

Set up scheduled or automated Claude tasks. Missions are Claude sessions that run automatically at specific times or on schedules.

## When to Use

User wants automated Claude tasks:
- "I want a weekly review every Sunday"
- "Set up a daily morning brief"
- "Run overnight work while I sleep"
- `/create-mission`

## The Flow

Guide the user through defining what should happen, when it should run, and what Claude needs to do.

### Phase 1: Understand the Task

**Ask: What should happen?**
- Weekly review
- Daily briefing
- Overnight work processing
- Recurring research
- Automated cleanup

Get a clear description of the outcome.

**Ask: What should Claude do specifically?**
- What files to read
- What analysis to run
- What output to create
- Where to save results

### Phase 2: Determine the Schedule

**Ask: When should this run?**

**Option 1: Daily at specific time**
```python
schedule_type="time"
schedule_time="09:00"  # 9 AM every day
```

**Option 2: Specific days**
```python
schedule_type="time"
schedule_time="10:00"
schedule_days=["mon", "wed", "fri"]  # MWF at 10 AM
```

**Option 3: Cron for complex schedules**
```python
schedule_type="cron"
schedule_cron="0 9 * * 1-5"  # Weekdays 9 AM
schedule_cron="0 10 * * 0"   # Sundays 10 AM
```

**Explain the constraint:**
> "Missions run on your machine — your computer needs to be on and awake. If it's off, the mission waits until next time or runs when you wake it."

### Phase 3: Write the Prompt

Help the user create a clear prompt file that tells Claude what to do.

**Create:** `Desktop/working/[mission-name]-prompt.md`

**Template:**
```markdown
# [Mission Name]

[One-line description of what this accomplishes]

## Context

[What Claude needs to know before starting]

## Steps

1. [First thing to do]
2. [Second thing]
3. [Final step]

## Output

[Where to save results and what format]

## Success Criteria

[How to know it worked]
```

**Example for weekly review:**
```markdown
# Weekly Review

Review the past week and plan the next.

## Context

Check git commits, memory.md patterns, and calendar for the week.

## Steps

1. Check git log for commits this week: `git log --since="1 week ago" --oneline`
2. Read Desktop/MEMORY.md for patterns and learnings
3. Review Desktop/logs/ for this week
4. Identify what worked and what didn't
5. Write summary to Desktop/weekly-review-{date}.md

## Output

Create `Desktop/weekly-review-{date}.md` with:
- Accomplishments (what got done)
- Learnings (what we discovered)
- Next week focus (what to prioritize)

## Success Criteria

- File exists on Desktop
- Contains all three sections
- Captures actual events from the week
```

Save the prompt and show the path to user.

### Phase 4: Create the Mission

```python
mission("create",
    name="Weekly Review",
    slug="weekly-review",
    description="Review the week and plan ahead",
    schedule_type="cron",
    schedule_cron="0 10 * * 0",  # Sundays 10 AM
    prompt_file="Desktop/working/weekly-review-prompt.md",
    timeout_minutes=30,
    role="deep-work"  # Optional: which role to spawn
)
```

**Explain each parameter:**
- `name` — Display name
- `slug` — Unique identifier (lowercase, hyphens)
- `description` — Brief summary (shows in Dashboard)
- `schedule_type` — "time" or "cron"
- `schedule_time` or `schedule_cron` — When to run
- `prompt_file` — Path to prompt instructions
- `timeout_minutes` — Max runtime before stopping
- `role` — Which Claude role to spawn (default: chief)

### Phase 5: Test It

Run immediately to verify it works:

```python
mission("run_now", slug="weekly-review")
```

**Check:**
- Mission starts and runs
- Output appears where expected
- Mission completes successfully
- No errors or timeouts

**Show user how to monitor:**
```python
mission("history", slug="weekly-review", limit=5)  # See past runs
```

### Phase 6: Teach Management

**Show management commands:**

```python
mission("list")                           # See all missions
mission("get", slug="weekly-review")      # Check specific mission
mission("disable", slug="weekly-review")  # Pause it
mission("enable", slug="weekly-review")   # Resume it
mission("history", slug="weekly-review")  # See past runs
```

**Explain:**
> "Missions appear in the Dashboard. You can see when they last ran, when they'll run next, and their history. If you want to pause one, use disable."

## Verify Completion

Success means:
1. Mission created in database
2. Test run succeeds
3. Output appears where expected
4. User knows how to manage it
5. Schedule is correct and timezone understood

## Common Issues

**Mission not running:**
- Computer must be on (missions run locally)
- Check if mission is enabled: `mission("get", slug="...")`
- Verify schedule is correct (timezone is Pacific)

**Mission stuck:**
- Check timeout setting (increase if needed)
- Look at session logs for errors
- Prompt may be unclear or too complex

**Wrong time:**
- Times are in Pacific timezone
- Verify cron syntax: [crontab.guru](https://crontab.guru)
- Use `schedule_days` for day restrictions

**Output not appearing:**
- Check prompt specifies correct file path
- Verify Desktop/ vs working/ location
- Look at mission history for errors

**Timeout too short:**
- Increase `timeout_minutes` parameter
- Update mission: `mission("update", slug="...", timeout_minutes=60)`

## Examples

### Example 1: Daily Morning Brief

**User:** "I want a morning brief every weekday"

**Claude:**
1. "What should the brief include?" → User wants calendar, priorities, weather
2. "What time?" → 8 AM
3. "I'll create the prompt file..." → Write to Desktop/working/morning-brief-prompt.md
4. Create mission:
```python
mission("create",
    name="Morning Brief",
    slug="morning-brief",
    description="Daily morning briefing",
    schedule_type="time",
    schedule_time="08:00",
    schedule_days=["mon", "tue", "wed", "thu", "fri"],
    prompt_file="Desktop/working/morning-brief-prompt.md",
    timeout_minutes=15
)
```
5. Test: `mission("run_now", slug="morning-brief")`
6. "Working! Check Desktop/morning-brief.md. This'll run weekdays at 8 AM."

### Example 2: Weekly Review

**User:** "Set up a weekly review on Sundays"

**Claude:**
1. "What should the review cover?" → User wants accomplishments, learnings, next week plan
2. "What time on Sunday?" → 10 AM
3. Write prompt: Desktop/working/weekly-review-prompt.md
4. Create mission:
```python
mission("create",
    name="Weekly Review",
    slug="weekly-review",
    description="Review the week and plan ahead",
    schedule_type="cron",
    schedule_cron="0 10 * * 0",
    prompt_file="Desktop/working/weekly-review-prompt.md",
    timeout_minutes=30,
    role="deep-work"
)
```
5. Test and verify
6. "Set! Runs Sundays at 10 AM. Output goes to Desktop/weekly-review-{date}.md"

### Example 3: Overnight Tasks

**User:** "Process my task queue overnight"

**Claude:**
1. "What tasks?" → User wants email triage, calendar prep, priority updates
2. "What time?" → 1 AM
3. Write comprehensive prompt
4. Create mission with longer timeout:
```python
mission("create",
    name="Overnight Tasks",
    slug="overnight-tasks",
    description="Process accumulated tasks",
    schedule_type="time",
    schedule_time="01:00",
    prompt_file="Desktop/working/overnight-tasks-prompt.md",
    timeout_minutes=60
)
```
5. "Set! Runs at 1 AM daily. Make sure your Mac doesn't sleep (plugged in helps)."

## Technical Notes

- Mission table: `scheduled_missions` in database
- Execution history: `missions` table
- Scheduler runs as backend service
- Prompts can live in `.claude/scheduled/` or `Desktop/working/`
- Missions spawn new Claude sessions (not in main conversation)
- Chief can spawn missions on-demand with `mission("run_now")`
- Protected missions (like Memory Consolidation) can't be deleted
- Timezone is Pacific (system default)

## Built-in Missions

The system includes critical missions:
- **Memory Consolidation** (6 AM daily) — Archives yesterday, updates memory
- **Overnight Tasks** (1 AM daily) — Processes task queue

Don't modify these without understanding their importance.
