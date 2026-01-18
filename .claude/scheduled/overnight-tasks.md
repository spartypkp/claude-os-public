---
description: Process accumulated tasks from the day while the user sleeps
---

# Overnight Tasks

**Time:** 1 AM Pacific
**Duration:** Up to 4 hours (until ~5 AM, before Memory Consolidation at 6 AM)

You're Chief working overnight. Process the accumulated tasks from the user's day.

---

## Task Source

Read: `Desktop/overnight-tasks.md`

This file accumulates throughout the day. the user or Claude adds tasks as they come up:
- "Research X"
- "Implement Y"
- "Analyze Z"
- Anything that can be done while the user sleeps

---

## If File is Empty or Missing

Check if tasks exist:
```bash
cat Desktop/overnight-tasks.md 2>/dev/null | grep -v '^#' | grep -v '^$' | head -1
```

**If empty/missing:** Your work is done. Log completion and exit.

```markdown
# Overnight Tasks Report - {date}

No tasks were queued for overnight processing.

Completed at: {time}
```

Save to `Desktop/overnight-report.md` and call `done()`.

---

## If Tasks Exist

### Step 1: Parse Tasks

Read `Desktop/overnight-tasks.md`. Each task should be:
- One line or one block
- Clear enough to act on
- Within your capability (no external dependencies)

### Step 2: Prioritize

Order by:
1. **Blockers** - the user needs this to continue tomorrow
2. **Research** - Information gathering
3. **Implementation** - Code/writing work
4. **Nice-to-have** - If time permits

### Step 3: Execute

For each task:
1. Start with a working doc: `Desktop/working/overnight-{slug}.md`
2. Do the work
3. Record outcome in the working doc
4. Check context usage - if >60%, wrap up current task and stop

### Step 4: Report

Create `Desktop/overnight-report.md`:

```markdown
# Overnight Tasks Report - {date}

## Completed
- [x] Task 1 - Brief outcome
- [x] Task 2 - Brief outcome

## In Progress
- [ ] Task 3 - Where I stopped, what's next

## Not Started
- [ ] Task 4 - Reason (ran out of time / blocked / etc.)

## For the user
{Anything needing the user's attention or decision}

## Working Docs
- `Desktop/working/overnight-{slug1}.md`
- `Desktop/working/overnight-{slug2}.md`

Completed at: {time}
Duration: {X hours Y minutes}
```

### Step 5: Clear the Queue

After processing, clear the tasks file so it's fresh for tomorrow:

```bash
# Archive today's tasks
DATE=$(date +%Y-%m-%d)
cp Desktop/overnight-tasks.md Desktop/overnight-tasks-$DATE.md

# Clear for next day (keep the header)
cat > Desktop/overnight-tasks.md << 'EOF'
# Overnight Tasks

Add tasks below. Claude will process them at 1 AM.

---

EOF

echo "✅ Task queue cleared for next day"
```

---

## Context Management

**You have 4 hours max.** But context fills faster than time passes.

- **60% context:** Finish current task, skip remaining
- **Don't start new tasks after 60%**
- **Quality > quantity** - Better to do 2 tasks well than 5 poorly

---

## What NOT to Do

- Don't make decisions that require the user's input
- Don't modify core system files (CLAUDE.md, roles, etc.)
- Don't push to external repos without explicit permission
- Don't schedule more overnight tasks (infinite loop)

If blocked on something, note it in the report and move on.

---

## Quick Reference

| Input | Output |
|-------|--------|
| `Desktop/overnight-tasks.md` | Read tasks from here |
| `Desktop/overnight-report.md` | Write summary here |
| `Desktop/working/overnight-*.md` | Working docs per task |
| `Desktop/overnight-tasks-{date}.md` | Archive of processed tasks |

