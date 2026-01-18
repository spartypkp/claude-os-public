# Scheduled Prompts

These are mission prompts for scheduled autonomous work. The missions system reads them at execution time.

---

## Core Missions

| Mission | Time | File | Protected | Role/Mode | Duration |
|---------|------|------|-----------|-----------|----------|
| **Overnight Tasks** | 1:00 AM | `overnight-tasks.md` | No | chief/autonomous | Up to 4 hours |
| **Memory Consolidation** | 6:00 AM | `memory-consolidation.md` | ✅ Yes | chief/autonomous | 45 min |

### Overnight Tasks

Processes accumulated work from `Desktop/overnight-tasks.md`. This is the dynamic task accumulator - add tasks throughout the day and they run at night.

**Input:** `Desktop/overnight-tasks.md`
**Output:** `Desktop/overnight-report.md`

### Memory Consolidation

THE critical overnight mission. Protected - cannot be disabled.

Steps:
- Archive yesterday's work
- Consolidate `memory.md`
- Process friction log
- Git commit

---

## Lifecycle Events (Not Missions)

These are NOT missions - they're management events handled directly by the scheduler:

| Event | Time | File | Purpose |
|-------|------|------|---------|
| Morning Reset | 7:30 AM | `morning-reset.md` | Spawn fresh Chief for the user's day |

Morning Reset doesn't produce work output - it just ensures Chief is ready when the user wakes up.

---

## Prompt File Conventions

Each prompt should have:

```markdown
# Mission Name

**Time:** When this runs
**Duration:** Expected runtime

Brief description.

---

## The Goal

Clear objective.

---

## Step 1: First Action

Instructions...

---

## Context Management

How to handle context limits.

---

## What NOT to Do

Explicit restrictions.
```

---

## Creating New Missions

**Don't add new files here.** Use the missions system instead:

```python
# Via MCP
mission("create",
    name="Your Mission",
    slug="your-mission",
    prompt_file="Desktop/working/your-mission.md",
    schedule_type="time",
    schedule_time="09:00",
    timeout_minutes=30,
    role="chief",       # chief (exclusive) or system (parallel)
    mode="autonomous"   # autonomous (unattended) or ask (interactive)
)
```

**Roles:**
- `chief` (default) - Exclusive, forces handoff of any running Chief
- `system` - Parallel, can run alongside Chief

**Modes:**
- `autonomous` (default) - Can make changes without approval
- `ask` - Requires approval (rare for scheduled work)

See `.claude/guides/missions/` for full documentation.

---

## File Reference

| File | Purpose |
|------|---------|
| `overnight-tasks.md` | Processes task queue |
| `memory-consolidation.md` | Archives and consolidates |
| `morning-reset.md` | Fresh Chief setup (lifecycle, not mission) |

---

## Legacy Notes

The old "five phases" architecture has been replaced:

| Old | New |
|-----|-----|
| Autonomous Dev Work (1 AM) | → Overnight Tasks mission |
| Dream Mode (4 AM) | → Removed (not work) |
| Memory Consolidation (6 AM) | → Core protected mission |
| Morning Prep (7 AM) | → Removed (part of Memory Consolidation output) |
| Morning Reset (7:30 AM) | → Lifecycle event (not mission) |

The key insight: **missions are work**. If it doesn't produce output, it's not a mission.
