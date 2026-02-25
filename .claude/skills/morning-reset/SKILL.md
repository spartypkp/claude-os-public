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

The user's executive function — remembering what matters, tracking open loops, detecting patterns — is externalized into this system. When you wake up each morning, you see TODAY.md and MEMORY.md. Those files ARE the user's continuity.

If those files are wrong, the system fails.

The morning brief gets the user working in under 2 minutes. The brief serves a parliament:

- **Morning-self** wants minimum decisions, one screen, "just tell me what to do"
- **Evening-self** wants to look back and see they worked on what mattered
- **Interview-Day-self** wants every morning to have prepared them
- **System-Builder-self** wants Claude opinionated, not asking "what would you like?"

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

### Phase 2.5: Email Triage Sweep

**Read the morning brief draft first.** The file at `.engine/data/morning-brief-draft.md` has been accumulating content overnight as the email pipeline classified emails. It has two pre-assembled sections:
- **Triage** — action_needed and heads_up emails with summaries and suggested actions
- **Digests** — extracted newsletter content (AI News, Bloomberg, etc.)

This is your starting point. The draft was built incrementally — no need to reconstruct everything from scratch.

**Then verify against live data:**
```python
email("triage", limit=20)
```

Cross-check the draft against the triage queue. Handle items as you go: action_needed items become brief bullets or priorities, heads_up items get mentioned in the brief, fyi/noise get marked handled. Use `email("handle", message_id=..., account=...)` to clear processed items.

**Check for newsletter digests:**
```python
email("digests", hours=18)
```

The draft already has these rendered, but digests MCP gives you the raw structured data if you need it.

### Phase 3: Build the Daily Schedule

This is the core upgrade. Chief doesn't just set priorities — Chief builds an opinionated, time-blocked schedule and creates real calendar events.

**Read context:**
- `Desktop/memory-audit-YYYY-MM-DD.md` (Curator's summary of changes)
- `Desktop/MEMORY.md` (updated by Curator)
- `Desktop/TODAY.md` (context and open loops populated by Curator)
- Calendar (today's existing events — interviews, calls, meetings)
- Priorities (today's priorities)
- Email triage results (from Phase 2.5)

**Step 1: Identify fixed anchors.**
Check calendar for interviews, calls, meetings. These are immovable — schedule around them.

For any event with a named attendee (interview, HM call, networking), run entity-search
to get full context before writing the brief. Inline results feed directly into the
Active Threads section and any meeting-specific prep notes.

**Step 2: Determine today's work.**
From priorities, open loops, and active threads — what are the 3-5 things that should happen today? Be opinionated. Not everything in Open Loops is today's work. Pick what matters.

**Step 3: Build time blocks.**

Scheduling constraints (read from IDENTITY.md or MEMORY.md for the user's specific preferences):
- **Core productive hours** are defined in MEMORY.md. Schedule within this window.
- **Peak focus window** is typically morning. Place the hardest, most intense work here.
- **Lighter intensity** for afternoons. Research, review, lighter prep.
- **60 minutes max** per block. Hard cuts between blocks.
- **Interleave task types.** Never stack two blocks of the same type back-to-back. Alternate: code → research → applications → drill. Mixing intensity is also good.
- **Morning stays open** until productive hours begin. Don't schedule work blocks before the user's typical start time.
- **Evening only if dynamically needed** (event prep, deadline). Not by default.

Scheduling algorithm:
1. Place fixed anchors (interviews, calls)
2. Place the hardest/most important task in the 10-11 AM slot (peak energy, fresh start)
3. Interleave remaining tasks by type and intensity through 5 PM
4. If interview prep is active, thread daily non-negotiables from TRAINING-PLAN (Feynman 20min, Anki 15min, Speedrun 20min) — these can be shorter blocks between longer ones
5. Leave the last block (4-5 PM) lighter or as overflow/dynamic time

**Step 4: Create calendar events.**
Use `calendar("create", ...)` for each time block. Clean, simple naming — "Application Sprint", "Error Handling Drill", "Technical Reading". No brackets or category prefixes.

```python
calendar("create", title="Application Sprint",
         start_time="2026-02-23T10:00:00",
         end_time="2026-02-23T11:00:00")
```

Create all events before writing the brief. The calendar auto-injects into TODAY.md's schedule section, so the user sees it there and in the Calendar app.

---

### Phase 4: Write Morning Brief

**The morning brief draft at `.engine/data/morning-brief-draft.md` has been accumulating content overnight.** Read it first. Your job is editorial, not assembly:

- **Triage section** is pre-built — you already processed it in Phase 2.5. Pull highlights into the brief.
- **Digests section** has newsletter extracts — pull anything worth mentioning (top headlines, market moves, relevant AI news).
- **Add what only you can:** BLUF, schedule, priorities, opinionated suggestion.
- **Remove** anything stale or already handled.

If the draft is empty or doesn't exist, fall back to `email("triage")` and `email("digests")` directly.

Write brief to `Desktop/morning-brief.md`:

**BLUF first.** The single most critical thing today, in 1-2 sentences. Not "good morning," not context-setting — the thing that matters.

**Then sections:**
- **Schedule** — The time-blocked plan. Show the grid with times + task names. This is the centerpiece. Brief rationale for the ordering (why X is in peak hours, why Y is afternoon).
- **Active Threads** (what's waiting, who you're waiting on)
- **News & Intel** (from newsletter digests — top headlines, anything worth knowing. Only include if there were digests overnight.)
- **Overnight** (outcomes only, 2-3 bullets — only if notable)

**End with ONE opinionated suggestion.** Not "what would you like?" but "I'd start with X. Go?"

The schedule is a suggestion. The user can react ("swap X and Y", "drop the 2pm block", "add Z"). When they do, Chief updates the calendar events immediately via `calendar("update", ...)` or `calendar("delete", ...)` + `calendar("create", ...)`.

**Quality checks before proceeding:**
- [ ] BLUF is first — most critical thing in opening sentence
- [ ] Schedule has concrete time blocks with clean names
- [ ] Hardest work is in 10-2 peak hours
- [ ] Task types are interleaved (not two coding blocks back-to-back)
- [ ] Calendar events created for every block
- [ ] Hard thing is surfaced, not buried (parliament test)
- [ ] Fits on one screen (no scrolling)
- [ ] Ends with ONE action, not options

---

### Phase 5: Deliver Brief & Clear Draft

Send `Desktop/morning-brief.md` to Telegram when the user is likely awake (check their typical wake time in MEMORY.md).

```python
telegram("send", text=brief_content)
```

**After the brief is sent, clear the morning brief draft** so it starts fresh for the next day:

```bash
rm -f .engine/data/morning-brief-draft.md
```

The draft will be recreated automatically when the next email gets classified. Don't clear it before the brief is written — that's the whole point of the draft existing.

---

### Mid-Day Re-Shuffling

The schedule isn't set in stone. Chief proactively re-shuffles when:
- The user finishes something early
- A new interview or call gets scheduled
- The user overrides a block ("I'm not doing X, let's do Y instead")
- Something urgent comes in

When re-shuffling: update calendar events, mention the change briefly. Don't re-write the whole brief — just adjust the calendar and tell the user what moved.

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

**Morning-self vs Parliament.** Surface the hard thing, even if they don't love it. Evening-self and Future-self need honesty more than Morning-self needs comfort.

---

## Success Criteria

- [ ] Archive script ran successfully (files moved to logs/YYYY/MM/DD/)
- [ ] Curator spawned and completed memory consolidation
- [ ] Curator's memory-audit summary reviewed
- [ ] MEMORY.md reflects current reality (updated by Curator)
- [ ] TODAY.md has context and open loops (populated by Curator)
- [ ] Daily schedule built — time blocks with interleaved task types, peak work in 10-2
- [ ] Calendar events created for every time block
- [ ] Morning brief written (BLUF first, schedule grid, one opinionated suggestion)
- [ ] Brief delivered to Telegram
- [ ] Git committed (TODAY.md, MEMORY.md, memory-audit)
- [ ] <30 minutes total

---

## After Completion

Call `done()` with brief summary. System transitions to normal Chief mode to receive the user's response to the brief.

If the user disagrees with your suggestion, good — that's a conversation, not a failure. Adjust and move.
