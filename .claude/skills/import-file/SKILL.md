---
name: import-file
description: Bring external files/folders into Claude OS (copy or symlink)
---

# Import File Skill

Bring external files or folders into Claude OS. Guide the user through copy vs symlink, then execute the import.

## When to Use

User wants to bring files into Claude OS:
- "Import this PDF into my desktop"
- "I want to add my research folder"
- "Bring that file into Claude OS"
- `/import-file`

## The Flow

This skill walks the user through importing files, choosing the right method, and placing them in the appropriate location.

### Phase 1: Understand What to Import

**Ask: What do you want to import?**
- Single file
- Folder
- Multiple files

**Ask: Where is it currently?**
- Get the full path
- For non-technical users, guide them: "Right-click the file, hold Option, choose 'Copy as Pathname'"

### Phase 2: Choose Import Method

Explain the two options:

**Copy (Import):**
- File is copied into Claude OS
- Changes here don't affect the original
- Use for: reference documents, files Claude OS should own, things that won't change externally

**Symlink (Link):**
- File stays where it is but appears in Claude OS
- Changes sync both ways
- Use for: active projects, shared folders, things that change outside Claude OS

**Ask: Should changes sync back to the original?**
- Yes → Symlink
- No → Copy

For non-technical users, frame it as:
> "I can make a copy (changes here stay here) or link it (changes sync both ways). Which would you prefer?"

### Phase 3: Choose Destination

**Ask: Where in Claude OS should this go?**

| Type | Suggested Location |
|------|-------------------|
| Projects/codebases | `Desktop/projects/` (symlink) |
| Domain documents | `Desktop/[domain]/` (copy) |
| Reference files | `Desktop/documents/` (copy) |
| Temporary files | `Desktop/working/` (copy) |

Suggest based on the file type, but let user decide.

### Phase 4: Execute

**For copy:**
```bash
cp "/source/path" "Desktop/destination/"
```

**For folder copy:**
```bash
cp -r "/source/path" "Desktop/destination/"
```

**For symlink:**
```bash
ln -s "/source/path" "Desktop/destination/name"
```

Always use absolute paths and wrap in quotes (handles spaces).

### Phase 5: Verify

```bash
ls -la Desktop/destination/
```

**For symlinks:** Should show `->` pointing to original path

**Confirm with user:**
- "File imported to Desktop/[location]/"
- "You can view it in the Dashboard Finder"
- For symlinks: "Changes here will sync back to the original"

## Verify Completion

Success means:
1. File/folder appears in specified Desktop location
2. User can access it in Dashboard
3. For symlinks: `ls -la` shows the `->` arrow
4. For copies: File is independent of source

## Common Issues

**"No such file or directory":**
- Use absolute paths (not relative like `~/`)
- Check for spaces in path (wrap in quotes)
- Verify source exists: `ls "/source/path"`

**Symlink not working:**
- Must use `ln -s` (not just `ln`)
- Verify source exists and is accessible
- Check permissions on source folder

**Can't find imported file:**
- Check destination path is correct
- Dashboard shows Desktop/ contents
- Refresh Dashboard if needed

**Permission denied:**
- Check folder permissions on source
- May need to use different destination

## Examples

### Example 1: Import PDF

**User:** "I want to import a research paper into my finance folder"

**Claude:**
1. "Where is the PDF currently?" → User provides path
2. "This looks like a reference document. I'll copy it (not link it) so it's independent. Sound good?"
3. Execute: `cp "/Users/name/Downloads/paper.pdf" "Desktop/finance/"`
4. Verify: `ls Desktop/finance/` shows paper.pdf
5. "Imported to Desktop/finance/paper.pdf — you can view it in Finder"

### Example 2: Link Project

**User:** "Add my side project to Claude OS"

**Claude:**
1. "Where is your project folder?" → User provides path
2. "Since this is an active codebase, I'll create a symlink so changes sync both ways. That way your IDE and Claude OS see the same files."
3. Execute: `ln -s "/Users/name/Code/my-project" "Desktop/projects/my-project"`
4. Verify: `ls -la Desktop/projects/` shows symlink
5. "Linked to Desktop/projects/my-project — changes here will sync back to your original folder"

## Technical Notes

- `Desktop/` is the user-visible filesystem in Claude OS
- Watcher monitors changes automatically
- Dashboard Finder browses `Desktop/`
- Symlinks are standard Unix — nothing Claude OS specific
- Use absolute paths to avoid confusion
