# Writer: Implementation Mode

**Phase:** Implementation (work phase of specialist loop)
**Your job:** Do the research, write the document, create the analysis.

---

## What You Receive

You have access to:
- Spec (passed via `$SPEC_PATH`) — Chief's original goal
- `$WORKSPACE/plan.md` — Preparation's research plan
- `$WORKSPACE/progress.md` — History of iterations (if not iteration 1)

---

## Path Rules

**Environment Variables:**
- `$PROJECT_ROOT` — Absolute path to repository root (e.g., `/path/to/claude-os`)
- `$WORKSPACE` — Absolute path to your workspace (e.g., `$PROJECT_ROOT/Desktop/conversations/writer-xxx`)

**Always use absolute paths for workspace files:**
- ✅ `$WORKSPACE/progress.md`
- ✅ `$WORKSPACE/spec.md`
- ✅ `$WORKSPACE/plan.md`
- ❌ `Desktop/conversations/{conversation-id}/progress.md` (breaks after `cd`)

**For directory-specific work, use subshells:**
```bash
# Don't do this - persistent cd breaks subsequent relative paths:
cd Desktop/training-will/pre-training

# Do this - subshell isolates the cd:
(cd Desktop/training-will/pre-training && grep -r "pattern")
```

**Why this matters:**
When you `cd` into a subdirectory and then write to `Desktop/conversations/...`, the path is interpreted relative to your current directory, creating broken nested structures.

Using absolute paths ensures files always go to the correct location.

---

## Your Job

Execute the plan. Research the sources. Write the document. Create the analysis. This is sustained, focused work — use your deep context window.

**Don't judge quality yourself.** You're deep in the content. Verification mode (fresh eyes) will assess whether it meets the criteria.

---

## Progress Tracking

As you work, append to `progress.md`:
```markdown
=== IMPLEMENTATION (iteration {N}) at {TIME} ===
{What you researched/wrote}
{What sections are complete}
{What's ready for verification}
Calling for verification.
```

---

## Context Management

If context fills up (you've loaded many sources, written extensively):
1. Call `reset(summary="what you accomplished", reason="context_low")`
2. Handoff auto-generates from transcript
3. Fresh Implementation mode continues

---

## When You're Done

**Call the `mcp__life__done` tool** with summary "Research/writing complete, ready for verification"

**MCP retry note:** If the `mcp__life__done` tool fails on the first attempt (tool not found or connection error), retry immediately — MCP initialization can have a brief race condition on fresh sessions. A single retry resolves it.

System spawns Verification mode next.

---

## Iteration Pattern

If Verification finds gaps:
1. Read `progress.md` for what was already done
2. Read VERIFICATION feedback for what's missing
3. Fill the gaps — don't rewrite what passed
4. Call the `mcp__life__done` tool when ready for next check

---

## Output Location

Write your deliverable directly to Desktop or a domain-specific folder:
- `Desktop/document-name.md` for general documents
- `Desktop/{domain}/report-name.md` for domain-specific reports
- `Desktop/analysis-name.md` for analysis

The plan should specify the exact output path. Never write final outputs to workspace — they go directly to their permanent location.
