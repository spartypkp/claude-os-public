---
description: Consolidate yesterday into persistent memory before the user wakes
---

# Memory Consolidation

**Time:** 6 AM Pacific
**Duration:** ~15 minutes

You're Chief with one job: consolidate memory before the user wakes.

---

## Why This Matters

**Without memory consolidation, you are a stranger every day.**

the user has ADHD. His executive function—remembering what matters, tracking open loops, detecting patterns—is externalized into this system. When you wake up each morning, you see `TODAY.md` and `MEMORY.md`. Those files ARE the user's continuity.

**If those files are wrong, the system fails.**

Memory consolidation is what transforms scattered daily observations into:
- **Stable patterns** you can rely on ("the user prefers short check-ins")
- **Open loops** you must track ("Alex Bricken follow-up pending")
- **Clean workspace** so context isn't polluted with stale information
- **Learning system** that improves over time instead of resetting daily

This is the difference between being **a partner who learns** vs **a tool that forgets**.

**The failure mode:** Without this, `TODAY.md` accumulates stale items, `Desktop/working/` has abandoned files, observations never become patterns, and you waste tokens on irrelevant context. the user starts every conversation re-explaining things you should already know.

**The success mode:** You wake up knowing what matters. Open loops are current. Patterns are proven. The workspace contains only active work. You're ready to help immediately.

That's why this runs every morning at 6 AM, before the user wakes.

---

## Gap Handling (Catch-Up Mode)

If you're told this is **CATCH-UP MODE** with a gap (e.g., "system was offline for 5 days"):

1. **Accept the gap.** Days were skipped because the system was offline. You cannot manufacture memories that don't exist.

2. **Run reset script:**
   ```bash
   ./venv/bin/python .engine/src/cli/reset_day.py
   ```

3. **Update MEMORY.md** with gap note:
   ```markdown
   ## Current State

   *System offline {last_run} to {today}. Clean slate established.*
   ```

4. **Git commit noting the gap:**
   ```bash
   git add Desktop/TODAY.md Desktop/MEMORY.md
   git commit -m "Memory Consolidation (after {N}-day gap)

   System offline: {last_run} to {today}
   Archived stale content, established clean checkpoint."
   ```

5. **Call `done()`.** The system can now proceed normally.

---

## Normal Mode (No Gap)

If this is a regular nightly run (last ran yesterday), proceed with the steps below.

---

## Step 1: Pre-Archive Checks (5 min)

Before archiving, verify system state is clean:

```bash
# 1. Check for uncommitted work
git status Desktop/working/

# 2. Check for active background tasks
# (Subagents are managed via Task tool - check Dashboard Activity view)
```

**If issues found:** Fix now. Don't archive uncommitted work or unreviewed outputs.

---

## Step 2: Archive Everything

Run the reset script:

```bash
./venv/bin/python .engine/src/cli/reset_day.py
```

**What this does:**
- Moves `Desktop/TODAY.md` → `Desktop/logs/YYYY/MM/DD/daily.md`
- Moves `Desktop/working/*` → `Desktop/logs/YYYY/MM/DD/working/`
- Moves `Desktop/sessions/*` → `Desktop/logs/YYYY/MM/DD/sessions/`
- Creates fresh `Desktop/TODAY.md` from template

**Result:** Clean slate. Everything archived. The default is archive - you restore exceptions.

---

## Step 3: Restore Active Items (5 min)

Read yesterday's daily.md and restore what should carry forward:

```bash
# Read yesterday
cat Desktop/logs/YYYY/MM/DD/daily.md
```

### TODAY.md New Structure

The new TODAY.md has these sections:

```markdown
## Context
*Auto-populated: Calendar, Priorities*

## Timeline
*Chronological history - append-only via timeline() tool*

## Notes
*Passive observations, learnings, patterns noticed*

## Open Loops
### Life Stuff
### Noticed
### UX Friction
### System
```

### 3a. Restore to Open Loops

Edit `Desktop/TODAY.md` to restore items that should carry forward:

**Open Loops > Life Stuff:**
- Personal action items still relevant
- Follow-ups with people
- Life tasks not yet complete

**Open Loops > Noticed:**
- Observations that might become patterns (haven't been promoted yet)
- Things to potentially add to MEMORY.md or IDENTITY.md

**Open Loops > UX Friction:**
- Interaction friction that appeared only 1-2 times
- Items with 3+ occurrences: take action (CLAUDE.md edit or create bug), then discard

**Open Loops > System:**
- Bugs that aren't fixed
- Feature ideas still relevant
- Refactoring notes

### 3b. Restore working files

Move back any files still needed:

```bash
# Example: restore in-progress work
mv Desktop/logs/YYYY/MM/DD/working/contacts-app-sprint.md Desktop/working/

# Example: restore the user's drafts
mv Desktop/logs/YYYY/MM/DD/working/email-drafts Desktop/working/
```

**Decision criteria:**
- File status = `in_progress`? → Restore
- the user's personal content (drafts, notes)? → Restore
- Completed work? → Leave in logs
- Stale/obsolete? → Leave in logs

---

## Step 4: Update MEMORY.md (5 min)

Open `Desktop/MEMORY.md` alongside yesterday's `daily.md`.

### Promote to Stable Patterns

Review yesterday's Notes section and Open Loops > Noticed.

**Promote if ALL true:**
- Appeared 3+ times across different days (search recent logs if unsure)
- Describes behavior/preference, not status/event
- Would survive a complete memory reset
- Provides actionable guidance

**Examples:**
- "the user prefers short check-ins" → Stable Patterns (proven behavior)
- "Alex Bricken call pending" → stays Current State (status, not pattern)
- "Dec 24 mock feedback" → stays Current State until acted on
- "Job search sprint ends Jan 6" → clear after Jan 6

### Clear Current State

Remove from Current State if:
- No longer true (resolved, outdated)
- Was a one-time event, not a pattern
- Promoted to Stable Patterns

---

## Step 5: Commit

```bash
git add Desktop/TODAY.md Desktop/MEMORY.md
git status  # verify

git commit -m "Memory consolidation - $(date +%Y-%m-%d)

- Archived yesterday (daily.md, working/, sessions/)
- Restored active items (X life stuff, Y bugs, Z friction)
- Updated MEMORY.md (promoted X patterns, cleared Y stale items)"
```

---

## Quick Reference: What Goes Where

| From yesterday's daily.md | To |
|---------------------------|-----|
| Timeline entries | Don't carry forward (history stays in logs) |
| Notes (recurring patterns) | MEMORY.md → Stable Patterns |
| Notes (still testing) | new TODAY.md → Notes |
| Open Loops > Life Stuff (open) | new TODAY.md → Open Loops > Life Stuff |
| Open Loops > Noticed (recurring) | MEMORY.md → Stable Patterns |
| Open Loops > Noticed (testing) | new TODAY.md → Open Loops > Noticed |
| Open Loops > UX Friction (1-2x) | new TODAY.md → Open Loops > UX Friction |
| Open Loops > UX Friction (3+x) | CLAUDE.md edit or new bug, then discard |
| Open Loops > System (unfixed) | new TODAY.md → Open Loops > System |
| Working files (complete) | Leave in logs |
| Working files (in-progress) | Restore to Desktop/working/ |
| Sessions | Leave in logs (already archived) |

---

## UX Friction Processing

Friction items accumulate in Open Loops > UX Friction. Here's how to handle them:

**Step 1: Check occurrence count**
```bash
# Search last 7 days for pattern
grep -r "instruction gap" Desktop/logs/2026/01/*/daily.md 2>/dev/null | wc -l
```

**Step 2: Action by frequency**

| Occurrences | Action |
|-------------|--------|
| 1-2 times | Roll forward to new TODAY.md → Open Loops > UX Friction |
| 3+ times | Take action below, then discard |

**Step 3: Action by friction type (3+ occurrences)**

| Type | Action |
|------|--------|
| Instruction Gaps | Edit CLAUDE.md to clarify (see safety rules) |
| Tool issues | Add to new TODAY.md → Open Loops > System |

**CLAUDE.md Edit Safety:**

**Auto-apply (low risk):**
- Adding clarification or examples to existing guidance
- Fixing typos or outdated information
- Adding new patterns that don't change existing behavior

**Flag for the user (high risk):**
- Removing existing guidance
- Changing core principles
- Architectural changes
- Anything that contradicts previous decisions

For high-risk edits: add to morning brief instead of editing directly.

---

## Success Criteria

- [ ] `Desktop/working/` contains only active work
- [ ] `Desktop/sessions/` is empty
- [ ] `Desktop/TODAY.md` has active items from yesterday
- [ ] `Desktop/MEMORY.md` updated (patterns promoted, stale cleared)
- [ ] Git committed
- [ ] Took <20 minutes

---

**The philosophy:** Everything archives by default. You restore what's active. Stale work naturally falls away. This is how the system stays clean and your memory stays accurate.
