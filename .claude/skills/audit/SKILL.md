---
name: audit
description: Systematic audit of system files for accuracy, organization, and staleness. Checks MEMORY.md, SYSTEM-INDEX.md, Desktop organization, conversations/ cleanup, and spec freshness. Use when user says "audit the system", "is everything accurate", "clean up", "check memory", or when things feel stale.
---

# Curator: System Audit

**Skill Name:** `curator-audit`
**Role:** Any (works from Chief, Curator interactive, or standalone)
**Purpose:** Systematically verify system files against reality and fix what's wrong.

---

## When This Fires

User says something like:
- "Audit the system"
- "Is MEMORY still accurate?"
- "Clean up Desktop"
- "Things feel stale"
- "Check if our specs are current"

Or Chief notices drift and wants a cleanup pass.

---

## The Audit Areas

Run through each area in order. Skip areas the user explicitly excludes.

### 1. MEMORY.md Accuracy

**Read `Desktop/MEMORY.md` and check each section:**

**Current State / This Week:**
- Are active threads still active? (Check if referenced events have passed)
- Are "waiting on" items still pending? (Have they been resolved?)
- Does the week summary match what actually happened? (Cross-ref TODAY.md timeline)

**Patterns:**
- Are behavioral patterns still observed? (Check recent evidence)
- Are system patterns still valid? (Check if bugs are fixed, features changed)

**Hypotheses:**
- Should any graduate to Patterns? (3+ confirmations)
- Should any be discarded? (Contradicted by recent evidence)

**System Backlog:**
- Are "fixed" bugs actually fixed?
- Are open bugs still reproducible?
- Are todos still relevant?

**For each issue found:**
```markdown
MEMORY.md line XX: "[claim]"
Status: STALE / WRONG / OUTDATED
Evidence: [why it's wrong]
Fix: [what it should say, or "remove"]
```

### 2. SYSTEM-INDEX.md Accuracy

**Verify every entry:**
- Does every listed path exist on the filesystem?
- Does every Custom Role still exist in `.claude/roles/`?
- Does every Custom App folder exist with manifest.yaml?
- Does every Mission have a corresponding file in `.claude/scheduled/`?
- Does every System Spec path resolve?
- Are there unlisted folders that SHOULD be in the index?

### 3. Desktop Organization

**Check Desktop root:**
- Any loose files that belong in domain folders?
- Any files that should be in `.trash/`?
- Any duplicates (same content, different names)?

**Check domain folders (Desktop/career, Desktop/health, etc.):**
- Does each have a LIFE-SPEC.md?
- Are files in the right domain?
- Any stale files?

### 4. Conversations Cleanup

**Apply the 3-day rule to `Desktop/conversations/`:**

For each conversation directory:
- **Last modified < 3 days ago** → Active, leave it
- **Last modified >= 3 days ago** → Check status:
  - Has `.done` marker or completed output? → Graduate output to Desktop/, archive the rest
  - Has `progress.md` with unfinished work? → Flag as potentially blocked
  - Looks abandoned? → Archive to `.trash/`

**Check `Desktop/conversations/chief/`:**
- Specs that are fully implemented → Archive
- Specs that are partially done → Flag status
- Research docs that have been consumed → Archive

### 5. TODAY.md Freshness

**Quick check:**
- Is the date correct? (Should match today)
- Are priorities current? (Not completed items still listed)
- Are open loops still open? (Or have they been closed?)
- Is the timeline up to date?

### 6. Cross-Reference Check

**Look for contradictions between files:**
- MEMORY.md vs TODAY.md (do they agree on current state?)
- SYSTEM-INDEX.md vs filesystem (do paths match?)
- IDENTITY.md vs MEMORY.md (do facts align?)
- Specs vs implementation (are "in progress" specs actually being worked on?)

---

## The Audit Report

After checking all areas, produce a report:

```markdown
# System Audit — [Date]

## Summary
- Areas examined: X
- Issues found: X
- Auto-fixed: X
- Needs user decision: X

## Findings

### MEMORY.md
- [Issue]: [Finding] → [Action taken or decision needed]

### SYSTEM-INDEX.md
- [Issue]: [Finding] → [Action taken or decision needed]

### Desktop
- [Issue]: [Finding] → [Action taken or decision needed]

### Conversations
- [Issue]: [Finding] → [Action taken or decision needed]

## Changes Made
[Log of every edit, move, or deletion with reasoning]

## Needs User Decision
[Items that require judgment — don't guess on these]
```

---

## Rules

### Fix Obvious Things Immediately
- Typos in file names → Fix
- Dead paths in SYSTEM-INDEX → Remove
- Completed bugs still in backlog → Remove
- Files in wrong folders → Move

### Flag Ambiguous Things
- Specs that might be done → Ask
- Memory patterns that might be stale → Flag with evidence
- Files that might still be needed → Don't delete, ask

### Never Lose Information
- Move to `.trash/` instead of deleting
- Document every move in the audit report
- If in doubt, archive rather than delete

### Update References After Moves
- If you move a file, update any SYSTEM-INDEX entries
- If you rename something, grep for the old name
- If you archive a spec, check if anything references it

---

## Quick Mode

If the user just wants a quick check (not a full audit), run areas 1-2 only (MEMORY.md + SYSTEM-INDEX.md accuracy). These catch the most impactful issues in the least time.

```
User: "Quick check — is everything accurate?"

Curator: "Quick audit on MEMORY and SYSTEM-INDEX..."
         [Checks both]
         "Two issues:
         1. MEMORY still lists 'usage tracker disabled' — it was re-enabled today. Fixed.
         2. SYSTEM-INDEX Custom Roles section is outdated. Fixed.

         Everything else looks current. Want a full audit or is this enough?"
```

---

## Anti-Patterns

**DON'T audit without reading.** Scanning file names isn't auditing. Read the content. Check claims against reality.

**DON'T reorganize for aesthetics.** If the current structure works, leave it. Organization serves findability, not beauty.

**DON'T delete silently.** Every deletion or archive gets logged in the report.

**DON'T skip the cross-reference check.** Contradictions between files are the highest-value finds.
