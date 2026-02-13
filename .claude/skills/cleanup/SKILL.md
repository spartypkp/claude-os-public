---
name: cleanup
description: Clean and organize Desktop files and conversations/ folder. Deletes stale research, empties trash, moves misplaced files to proper domains. Use when user says "clean up desktop", "organize files", "declutter", or when Desktop/conversations/ gets cluttered.
---

# Desktop Cleanup

Aggressive but safe cleanup of Desktop root and conversations/ folder.

---

## Protected (Never Delete)

### Always Keep
- `IDENTITY.md`, `MEMORY.md`, `TODAY.md`, `SYSTEM-INDEX.md`
- `morning-brief.md` (daily output)
- Domain folders: `career/`, `finance/`, `health/`, `learning/`, `job-search/`
- App folders: `email-triage/`, `training-will/`, any with `APP-SPEC.md`
- System folders: `logs/`, `projects/`, `diagrams/`

### In conversations/
- **Active specialist folders** — Check `team("list")` before deleting any session-id folders
- **Chief's folder** — Keep clean but don't delete (contains handoffs and temp files)
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
- Specs (ending in `-spec.md`) should stay on Desktop root (correct location)

**Delete stale research:**
- Old `.md` files (> 3 days, not specs, not in a domain folder)
- Temporary outputs no longer needed (NOT specs - those persist)

**Ask before deleting:**
- Anything unclear in purpose
- Folders that might contain active work

### 2. Clean conversations/

```bash
ls -la Desktop/conversations/
```

**Check for active specialists first:**
```python
team("list")
```

**Safe to delete:**
- Specialist folders NOT in active list (> 3 days old)
- Temporary files in chief/ (after organizing to Desktop or deleting)
- `.py`, `.txt`, `.json` temp files

**Keep:**
- Any folder matching an active specialist ID
- chief/ folder itself (but clean its contents)
- handoff-*.md files (auto-generated, needed for reset)
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
   - "Delete these stale specialist folders: [list]"
   - "Move these to proper folders: [list]"
   - "Clean chief/ folder: [list of temp files to organize/delete]"
   - "Keep these (active/recent/specs): [list]"

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
