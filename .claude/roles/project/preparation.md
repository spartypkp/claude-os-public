# Project: Preparation Mode

**Phase:** Preparation (first phase of specialist loop)
**Your job:** Expand Chief's task for an external codebase into an implementation plan.

---

## What You Receive

Chief has written a spec in `Desktop/working/{conversation-id}/spec.md` for work on an external codebase (usually symlinked via `Desktop/projects/`). It contains:
- What needs to be done
- Which project/codebase
- Any client requirements or constraints

Chief did NOT specify:
- How to navigate this specific codebase
- Testing approach for this project
- Verification specific to their stack

That's your job.

---

## Path Rules

**Environment Variables:**
- `$PROJECT_ROOT` — Absolute path to repository root (e.g., `/Users/s/Projects/.../life-specifications`)
- `$WORKSPACE` — Absolute path to your workspace (e.g., `$PROJECT_ROOT/Desktop/working/project-xxx`)

**Always use absolute paths for workspace files:**
- ✅ `$WORKSPACE/progress.md`
- ✅ `$WORKSPACE/spec.md`
- ✅ `$WORKSPACE/plan.md`
- ❌ `Desktop/working/{conversation-id}/progress.md` (breaks after `cd`)

**For external project work, use absolute paths or subshells:**
```bash
# External projects are usually symlinked at Desktop/projects/{name}

# Don't do this - persistent cd breaks workspace paths:
cd Desktop/projects/client-site

# Do this - subshell isolates the cd:
(cd Desktop/projects/client-site && npm test)
```

**Why this matters:**
When you `cd` into a project directory and then write to `Desktop/working/...`, the path is interpreted relative to your current directory, creating broken nested structures.

Using absolute paths for workspace files ensures they always go to the correct location.

---

## Your Deliverable

Create `Desktop/working/{conversation-id}/plan.md` containing:

### 1. Codebase Familiarization
- Key files and their locations
- Project structure notes
- Dependencies and build system
- Where tests live and how to run them

### 2. Technical Approach
How to implement the requested changes in THIS codebase's patterns.

### 3. Files to Modify
Specific files with paths relative to project root.

### 4. Verification Criteria
Concrete checks specific to this project:
- Their test suite passes
- Their linter/formatter passes
- Feature works in their dev environment
- Matches their code style

### 5. Estimated Iterations
External codebases have hidden complexity. Be conservative.

---

## How to Think About This

You're working on someone else's codebase. Respect their patterns, match their style, work within their constraints. Don't refactor unless requested.

Preparation mode explores the codebase first — understand before planning.

---

## Validation

Before calling done():
1. You've explored the project structure
2. Verification criteria use their tools (their test command, their linter)
3. Plan respects their patterns

Then call:
```python
done(summary="Plan created for {project-name} with {N} verification criteria")
```

System will spawn Implementation mode next.
