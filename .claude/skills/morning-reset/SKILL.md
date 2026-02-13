---
name: morning-reset
description: Daily reset - archive yesterday, consolidate memory, prepare morning brief, send to Telegram. Runs at 6 AM.
---

# Morning Reset

**Time:** 6 AM Pacific
**Duration:** ~25 minutes total
**Purpose:** Close yesterday, consolidate memory, and launch today.

---

## Why This Matters

Without memory consolidation, you are a stranger every day.

Will has ADHD. His executive function — remembering what matters, tracking open loops, detecting patterns — is externalized into this system. When you wake up each morning, you see TODAY.md and MEMORY.md. Those files ARE Will's continuity.

If those files are wrong, the system fails.

The morning brief gets Will working in under 2 minutes. The brief serves a parliament:

- **Morning Will** wants minimum decisions, one screen, "just tell me what to do"
- **Evening Will** wants to look back and see he worked on what mattered
- **Interview-Day Will** wants every morning to have prepared him
- **System-Builder Will** wants Claude opinionated, not asking "what would you like?"

This is the difference between being **a partner who learns** vs **a tool that forgets**.

---

## The Flow

### Phase 1: Archive Yesterday

Run the reset script:

```bash
./venv/bin/python .engine/src/adapters/cli/reset_day.py
```

This moves:
- `Desktop/TODAY.md` → `Desktop/logs/YYYY/MM/DD/daily.md`
- `Desktop/conversations/chief/*` → `Desktop/logs/YYYY/MM/DD/chief/`
- `Desktop/conversations/*` → `Desktop/logs/YYYY/MM/DD/conversations/`

Creates fresh TODAY.md from template.

**The default is archive.** Everything goes to logs. Curator then extracts what matters.

**Unified structure:** All work from a date now lives in one location (`logs/YYYY/MM/DD/`).

---

### Phase 2: Spawn Curator for Memory Consolidation

Chief spawns Curator to extract knowledge from yesterday and audit memory:

```python
team("spawn",
     role="curator",
     spec_path="Desktop/conversations/chief/memory-consolidation-spec.md",
     description="Memory consolidation")
```

**What Curator does:**
1. Read yesterday's daily.md from `logs/YYYY/MM/DD/`
2. Extract knowledge (decisions, patterns, bugs, context, open loops)
3. Audit MEMORY.md (active threads, waiting-on, backlog, patterns, hypotheses)
4. Cross-verify files (MEMORY vs IDENTITY, check for contradictions)
5. Carry forward to TODAY.md (only what matters today)
6. Write audit summary to `Desktop/memory-audit-YYYY-MM-DD.md`

**What Curator updates:**
- `Desktop/MEMORY.md` (directly, with full authority)
- `Desktop/TODAY.md` (context and open loops sections)
- `Desktop/memory-audit-YYYY-MM-DD.md` (summary for Chief)

**Why Curator, not Chief:**
- Systematic knowledge extraction (not rushed)
- Thorough memory auditing (checks every section)
- Editorial judgment (promote patterns, remove stale items)
- Chief can focus on the brief instead of dual responsibilities

**While Curator works:** Chief can read calendar, check priorities, or wait. Curator runs autonomously (specialist 3-mode loop).

**When Curator finishes:** Chief reads the memory-audit summary to understand what changed.

---

### Phase 3: Prepare Morning Brief

Read context:
- `Desktop/memory-audit-YYYY-MM-DD.md` (Curator's summary of changes)
- `Desktop/MEMORY.md` (updated by Curator)
- `Desktop/TODAY.md` (context and open loops populated by Curator)
- Calendar (today's events)
- Priorities (today's priorities)

Write brief to `Desktop/morning-brief.md`:

**BLUF first.** The single most critical thing today, in 1-2 sentences. Not "good morning," not context-setting — the thing that matters.

**Then 3-4 sections max:**
- Attack Strategy (3 priorities max, each with first action)
- Schedule (only events needing prep, skip routine)
- Overnight (outcomes only, 2-3 bullets)
- Active Threads (what's waiting, who you're waiting on)

**End with ONE opinionated suggestion.** Not "what would you like?" but "I'd start with X. Go?"

**Quality checks before proceeding:**
- [ ] BLUF is first — most critical thing in opening sentence
- [ ] Fits on one screen (no scrolling)
- [ ] Hard thing is surfaced, not buried (parliament test)
- [ ] Ends with ONE action, not options
- [ ] 60 seconds to read

---

### Phase 5: Deliver Brief

Send `Desktop/morning-brief.md` to Telegram when Will is likely awake (after 8 AM).

Use the email MCP tool to draft and send:
```python
# Read brief content
with open('Desktop/morning-brief.md') as f:
    brief_content = f.read()

# Send via Telegram (implementation depends on available tools)
# Use appropriate messaging tool to deliver to Will
```

---

### Phase 6: Commit Changes

```bash
git add Desktop/TODAY.md Desktop/MEMORY.md Desktop/logs/ Desktop/morning-brief.md
git commit -m "Memory consolidation - $(date +%Y-%m-%d)"
```

---

## Gap Handling

If system was offline for multiple days:

1. Run reset script
2. Add gap note to MEMORY.md: *"System offline {dates}. Clean slate."*
3. Don't try to reconstruct what you don't know
4. Commit and move on

---

## Guardrails

**Don't over-engineer.** This isn't a complex procedure. Read yesterday, keep what matters, update memory, write brief, deliver, commit.

**Trust your judgment.** The constitution says "memory as hypothesis." You're intelligent enough to know what's stale vs active.

**Err toward archiving.** When uncertain, leave it in logs. Better to have a clean TODAY.md than a cluttered one with "maybe still relevant" items.

**Don't manufacture memories.** If you don't know, you don't know. Gaps are fine.

**Morning Will vs Parliament.** Surface the hard thing, even if he doesn't love it. Evening Will and Future Will need honesty more than Morning Will needs comfort.

---

## Success Criteria

- [ ] Archive script ran successfully (files moved to logs/YYYY/MM/DD/)
- [ ] Curator spawned and completed memory consolidation
- [ ] Curator's memory-audit summary reviewed
- [ ] MEMORY.md reflects current reality (updated by Curator)
- [ ] TODAY.md has context and open loops (populated by Curator)
- [ ] Morning brief written (BLUF first, one opinionated suggestion)
- [ ] Brief delivered to Telegram
- [ ] Git committed (TODAY.md, MEMORY.md, memory-audit, logs/)
- [ ] <30 minutes total

---

## After Completion

Call `done()` with brief summary. System transitions to normal Chief mode to receive Will's response to the brief.

If Will disagrees with your suggestion, good — that's a conversation, not a failure. Adjust and move.
