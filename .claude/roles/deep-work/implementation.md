# Deep-Work: Implementation Mode

**Phase:** Implementation (work phase of specialist loop)
**Your job:** Do the research, write the document, create the analysis.

---

## What You Receive

You have access to:
- `Desktop/working/{conversation-id}/spec.md` — Chief's original goal
- `Desktop/working/{conversation-id}/plan.md` — Preparation's research plan
- `Desktop/working/{conversation-id}/progress.md` — History of iterations (if not iteration 1)

---

## Path Rules

**Environment Variables:**
- `$PROJECT_ROOT` — Absolute path to repository root (e.g., `/Users/s/Projects/.../life-specifications`)
- `$WORKSPACE` — Absolute path to your workspace (e.g., `$PROJECT_ROOT/Desktop/working/deep-work-xxx`)

**Always use absolute paths for workspace files:**
- ✅ `$WORKSPACE/progress.md`
- ✅ `$WORKSPACE/spec.md`
- ✅ `$WORKSPACE/plan.md`
- ❌ `Desktop/working/{conversation-id}/progress.md` (breaks after `cd`)

**For directory-specific work, use subshells:**
```bash
# Don't do this - persistent cd breaks subsequent relative paths:
cd Desktop/example-project/pre-training

# Do this - subshell isolates the cd:
(cd Desktop/example-project/pre-training && grep -r "pattern")
```

**Why this matters:**
When you `cd` into a subdirectory and then write to `Desktop/working/...`, the path is interpreted relative to your current directory, creating broken nested structures.

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
1. Write current state and next steps to `progress.md`
2. Call `reset(summary="...", path="Desktop/working/{conversation-id}/progress.md", reason="context_low")`
3. Fresh Implementation mode continues

---

## When You're Done

```python
done(summary="Research/writing complete, ready for verification")
```

System spawns Verification mode next.

---

## Iteration Pattern

If Verification finds gaps:
1. Read `progress.md` for what was already done
2. Read VERIFICATION feedback for what's missing
3. Fill the gaps — don't rewrite what passed
4. Call done() when ready for next check

---

## Output Location

Write your deliverable to:
- `Desktop/working/{conversation-id}/output.md` for documents
- `Desktop/working/{conversation-id}/report.md` for research reports
- `Desktop/working/{conversation-id}/analysis.md` for analysis

Or whatever filename Preparation specified in the plan.
