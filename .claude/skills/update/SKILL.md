---
name: update
description: Update Claude OS to the latest release. Checks your current version, fetches what's new, applies changes intelligently, and rewires any custom work that depends on what changed.
---

# Update Claude OS

**Purpose:** Bring your Claude OS instance up to the latest release — safely, intelligently, without breaking your customizations.

---

## Why This Isn't Just `git pull`

Your Claude OS instance is personal. You've probably customized role files, built custom apps, modified CLAUDE.md, added your own skills. A mechanical file overwrite would destroy that work.

This skill is smarter. It understands what changed upstream, what you've built locally, and how to merge the two. Infrastructure updates apply automatically. Your customizations are preserved. Breaking changes get flagged and fixed — not silently left to crash at runtime.

---

## How Releases Are Structured

The upstream repo has a `releases/` folder at the root. Each release is a subfolder — `releases/v22.0/`, `releases/v23.0/`, etc.

Inside each release folder there are exactly two files:

- **`vN.0.md`** — the semantic changelog. What's new, why it matters, breaking changes listed at the bottom. Read this first to understand what the release contains before touching anything.
- **`apply.md`** — the technical update guide. Area-organized instructions for every file that changed, built from the actual git diff. Structured by directory: `.claude/`, `.engine/`, `Dashboard/`, `Desktop/`, config. This is what you follow to apply the update.

`CHANGELOG.md` at the repo root is the version index — one line per release with a link to the release folder.

---

## Phase 1: Discover

**Goal:** Understand where you are and what you're missing.

Read your current version from the `**Version:**` field at the top of `CLAUDE.md`. If it's missing, you're on an unversioned install — treat all releases as unapplied and write the current highest version after you finish to establish a baseline.

**The upstream public repo is:** `https://github.com/spartypkp/claude-os-public`

Raw file URLs follow the pattern:
`https://raw.githubusercontent.com/spartypkp/claude-os-public/main/{path}`

Fetch the CHANGELOG:
`https://raw.githubusercontent.com/spartypkp/claude-os-public/main/CHANGELOG.md`

Compare versions. If you're already current, say so and stop.

For each release between your version and the latest, fetch both files:
- `https://raw.githubusercontent.com/spartypkp/claude-os-public/main/releases/vN.0/vN.0.md`
- `https://raw.githubusercontent.com/spartypkp/claude-os-public/main/releases/vN.0/apply.md`

Read `vN.0.md` first for a high-level understanding. Then read `apply.md` — this is your work order for the next phases.

---

## Phase 2: Plan

**Goal:** Categorize every change before making any of them. Show the user the full picture.

Read each section of `apply.md` for the releases you're applying. For every file listed, make a judgment call:

**Auto-apply** — pure infrastructure the user almost certainly hasn't touched: Dashboard components, backend modules, engine adapters. Fetch from upstream and overwrite.

**Smart merge** — files the user likely has customized: `CLAUDE.md`, anything in `.claude/roles/`, `.claude/agents/`, `.claude/skills/`. Don't overwrite. Read both versions and merge intelligently (see Phase 3).

**New files** — didn't exist before. Just copy them in. No conflict possible.

**Deletions** — explicitly listed in `apply.md`. These still exist on the user's disk. Flag them and ask before removing — the user may have repurposed the file.

**Migrations** — SQL schema changes. Plan to run the migration file before restart.

Present the full plan to the user before doing anything:

```
v22.0 update plan

Auto-apply:     18 files
Smart merge:     2 files  (CLAUDE.md, .claude/roles/chief/role.md)
New files:       6 files
Delete:          2 files  (ContextMenu.tsx, CadenceView.tsx)
Migration:       1        (018_contact_activity.sql)
npm install:     yes      (package.json changed)

Ready to apply?
```

Wait for confirmation.

---

## Phase 3: Apply

**Goal:** Execute the plan. Be transparent about what you're doing.

Apply changes in this order:
1. Run database migrations first — backend code may depend on schema being current
2. Fetch and write all auto-apply files
3. Write all new files
4. Handle smart merges (below)
5. Handle deletions (below)
6. Run `npm install` inside `Dashboard/` if package.json changed; run `pip install -r requirements.txt` inside the virtualenv if backend dependencies changed
7. Run `./restart.sh`

**Smart merge** is where your intelligence matters most. For each file that needs merging:

Read the user's current version. Fetch the new upstream version. Understand both. The upstream version has new sections, updated instructions, or restructured content. The user's version has their personal customizations — custom tools they've added, sections they've written, content that reflects their specific setup.

Produce a merged version that keeps everything the user has and incorporates everything new. Don't just concatenate — actually understand the structure and integrate. Show the user a brief summary of what you added from upstream and what you preserved of theirs. Apply with their confirmation.

**Deletions:** For each deleted file, explain why it was removed (the `apply.md` description tells you) and ask before deleting. If the user has modified the file locally, show them what they'd be losing. Sometimes the right answer is to keep their version; sometimes it's a clean delete.

---

## Phase 4: Rewire

**Goal:** Find anything the user has built that depends on something that changed.

Read the Breaking Changes section from `vN.0.md` for every release you just applied. Then scan the user's custom work — custom apps in `Dashboard/app/`, modified role files, custom skills, any code they've written that might touch the affected APIs.

For each breaking change, look for usage patterns in the custom files. If you find something that needs updating, explain what changed and propose the fix. Don't just say "this might be broken" — read the code, understand what it's doing, and write the corrected version.

Some breaking changes are schema-level (a DB table restructured, an MCP tool signature changed). Others are API-level (a function's return type changed, a component prop renamed). Others are behavioral (a tool that used to do X now does Y). Treat each category differently — schema issues need migration scripts, API issues need code changes, behavioral issues need documentation updates.

When rewiring is complete, give the user a summary of everything that was touched and what's expected to work differently.

---

## Phase 5: Final Diff Pass

**Goal:** Catch anything the apply guide missed.

`apply.md` describes the known changes, but it's not an exhaustive audit of every file that changed. After applying everything, do a sanity check: compare a sample of key infrastructure files against their upstream versions to look for unexpected differences.

Focus on files that are high-impact if wrong and that the user is unlikely to have customized: `app.py`, `life_mcp/server.py`, core engine modules, the main Dashboard components. For each, fetch the upstream version and diff it against what's on disk.

Two kinds of findings:

**Missed updates** — a file differs from upstream in a way that looks like an omission. Real code difference, not a user customization. Apply it and note what was caught.

**Expected differences** — a file differs because the user has intentionally customized it (a custom tool registered in `app.py`, a personal section in a role file). Note it and leave it alone.

If you find genuine misses, apply them. If the diff is large or ambiguous, surface it to the user rather than guessing. The goal isn't perfection — it's catching the 10% that slipped through.

---

## Phase 6: Write Version

Update the `**Version:**` field at the top of `CLAUDE.md` with the version you just applied. This is what the next update check reads.

---

## Success

The update is complete when:
- All files from the release are applied
- Migrations have run
- Smart merges are done and confirmed
- Breaking change impacts on custom work are resolved
- Final diff pass is clean or differences are understood
- Services are running (`./restart.sh` completed)
- `CLAUDE.md` version field is current

Tell the user what's new in plain language — not a file list, but what they can actually do now that they couldn't before.
