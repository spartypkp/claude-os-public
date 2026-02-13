---
name: cleanup
description: Clean and organize Desktop files and working/ folder. Deletes stale research, empties trash, moves misplaced files to proper domains. Use when user says "clean up desktop", "organize files", "declutter", or when Desktop/conversations/ gets cluttered.
---

# Desktop Cleanup

Aggressive but safe cleanup of Desktop and working/ folders.

---

## Protected (Never Delete)

### Always Keep
- `IDENTITY.md`, `MEMORY.md`, `TODAY.md`, `SYSTEM-INDEX.md`
- `morning-brief.md` (daily output)
- Domain folders: `career/`, `finance/`, `health/`, `learning/`, `job-search/`
- App folders: `email-triage/`, `training-will/`, any with `APP-SPEC.md`
- System folders: `logs/`, `projects/`, `diagrams/`

### In working/
- **Active specialist folders** — Check `team("list")` before deleting any `builder-*`, `researcher-*`, `writer-*`, `idea-*` folders
- **Spec files ending in `-spec.md`** — These drive specialist work
- **Files < 24 hours old** — May be in active use

---

## Cleanup Actions

### 1. Audit Desktop Root

List all files and folders:
```bash
ls -la Desktop/
```

**Move misplaced files:**
- PDFs about learning → `learning/`
- Resume/portfolio files → `career/`
- Interview prep → `job-search/` or `training-will/`

**Delete stale research:**
- Old `.md` analysis files (> 3 days, not in a domain folder)
- Temporary outputs no longer needed

**Ask before deleting:**
- Anything unclear in purpose
- Folders that might contain active work

### 2. Clean working/

```bash
ls -la Desktop/conversations/
```

**Check for active specialists first:**
```python
team("list")
```

**Safe to delete:**
- Specialist folders NOT in active list
- `.md` files that aren't specs (no `-spec.md` suffix)
- `.py`, `.txt`, `.json` temp files
- Anything > 7 days old (unless it's a spec)

**Keep:**
- Any folder matching an active specialist ID
- Files ending in `-spec.md`
- Files modified in last 24 hours

### 3. Empty Trash

```bash
rm -rf Desktop/.trash/*
```

Always safe — trash is for deleted items.

### 4. Check _paused/

If exists, audit contents. Usually safe to delete if folders are empty or contain only stale placeholders.

---

## Cleanup Conversation Flow

1. **Show current state:**
   ```
   Desktop: X items (Y folders, Z loose files)
   working/: X items (Y specialist folders, Z files)
   .trash/: X items
   ```

2. **Propose actions:**
   - "Delete these stale files: [list]"
   - "Move these to proper folders: [list]"
   - "Keep these (active/recent): [list]"

3. **Get confirmation** for anything ambiguous

4. **Execute and report:**
   ```
   Deleted: X items
   Moved: Y items
   Kept: Z items
   ```

---

## Example Session

```
User: clean up my desktop

Claude: Let me audit Desktop and working/.

**Desktop/** (25 items)
- 4 core files ✓
- 8 domain folders ✓
- 6 stale research files (> 3 days)
- 2 misplaced files
- 5 other folders to check

**working/** (45 items)
- 2 active specialists (keep)
- 12 old specialist folders (delete)
- 28 stale .md files (delete)
- 3 spec files (keep)

**Proposed:**
- Delete 6 stale Desktop files
- Move resume.docx → career/
- Move system-design.pdf → learning/
- Delete 40 items from working/
- Empty .trash/ (15 items)

Proceed?
```

---

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Delete without checking `team("list")` | May kill active specialist work |
| Delete `-spec.md` files | These drive specialist loops |
| Delete files < 24 hours old | May be in active use |
| Delete domain folders | These are permanent structure |
| Delete without showing what | User should see what's being removed |

---

## Success Criteria

- ✅ No active specialist work disrupted
- ✅ No spec files deleted
- ✅ Misplaced files moved to correct domains
- ✅ Stale research cleaned
- ✅ working/ reduced to active items only
- ✅ .trash/ emptied
- ✅ User informed of all changes
