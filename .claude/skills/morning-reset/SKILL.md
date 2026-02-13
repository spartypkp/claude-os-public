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

The user has ADHD. Their executive function — remembering what matters, tracking open loops, detecting patterns — is externalized into this system. When you wake up each morning, you see TODAY.md and MEMORY.md. Those files ARE the user's continuity.

If those files are wrong, the system fails.

The morning brief gets the user working in under 2 minutes. The brief serves a parliament:

- **Morning Self** wants minimum decisions, one screen, "just tell me what to do"
- **Evening Self** wants to look back and see they worked on what mattered
- **Interview-Day Self** wants every morning to have prepared them
- **System-Builder Self** wants Claude opinionated, not asking "what would you like?"

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
- `Desktop/conversations/*` → `Desktop/logs/YYYY/MM/DD/conversations/`

Creates fresh TODAY.md from template.

**The default is archive.** Everything goes to logs. You restore exceptions.

---

### Phase 2: Carry Forward

Read yesterday's daily.md. Ask: **What's genuinely still active?**

Restore to `Desktop/TODAY.md → Unstructured`:
- Action items that aren't done
- Follow-ups still pending
- Observations worth tracking longer

Leave in logs:
- Completed items
- One-time events (they're history, not active)
- Things that resolved themselves

Restore conversation files only if work is genuinely in-progress. Completed work stays in logs.

**The bar:** If the user woke up and this wasn't in TODAY.md, would it matter? If no, leave it archived.

---

### Phase 3: Update MEMORY.md

Open MEMORY.md alongside yesterday's daily.md.

**This Week section:**
This clears weekly, not daily. Update if:
- Active threads changed (new info, resolved, stale)
- Waiting-on items resolved or need updating
- System backlog items fixed or new ones appeared

**Patterns section:**
Promote from observations to Patterns only when **truly proven**:
- Appeared across multiple days/contexts
- Describes behavior, not status
- Would survive a complete memory reset
- Provides actionable guidance

Most observations don't become patterns. That's fine.

**Other sections:**
- **Hypotheses** — Move observations here if noticed but not validated
- **Recent Corrections** — Add explicit feedback from yesterday, clear items >1 week old
- **Collaboration Experiments** — Update based on what we learned

**Clear stale entries:**
Remove anything that's:
- No longer true
- Resolved
- Superseded by newer information

**Reality > files.** If an entry contradicts current reality, delete or update it.

---

### Phase 4: Prepare Morning Brief

Read context:
- MEMORY.md
- Calendar (today's events)
- Priorities (today's priorities)
- TODAY.md (fresh file with carried-forward items)

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

Send `Desktop/morning-brief.md` to Telegram when the user is likely awake (after 8 AM).

Use the email MCP tool to draft and send:
```python
# Read brief content
with open('Desktop/morning-brief.md') as f:
    brief_content = f.read()

# Send via Telegram (implementation depends on available tools)
# Use appropriate messaging tool to deliver to the user
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

**Morning Self vs Parliament.** Surface the hard thing, even if they don't love it. Evening Self and Future Self need honesty more than Morning Self needs comfort.

---

## Success Criteria

- [ ] Desktop/conversations/ contains only genuinely active work
- [ ] TODAY.md has only items that matter today
- [ ] MEMORY.md reflects current reality
- [ ] Morning brief written (BLUF first, one opinionated suggestion)
- [ ] Brief delivered to Telegram
- [ ] Git committed
- [ ] <30 minutes total

---

## After Completion

Call `done()` with brief summary. System transitions to normal Chief mode to receive the user's response to the brief.

If the user disagrees with your suggestion, good — that's a conversation, not a failure. Adjust and move.
