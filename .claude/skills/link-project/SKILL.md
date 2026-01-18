---
name: link-project
description: Link external codebase into Claude OS via symlink
---

# Link Project Skill

Link an external codebase into Claude OS so you can work on it from within the system. The project stays where it is, but appears in Desktop/projects/.

## When to Use

User wants to work on an external codebase:
- "I want to work on my startup's repo"
- "Link my client project"
- "Add this codebase to Claude OS"
- `/link-project`

## The Flow

This skill creates a symlink from an external project into Desktop/projects/, then optionally spawns Project Claude.

### Phase 1: Understand the Project

**Ask: Where is your project?**
- Get the full absolute path
- For non-technical users: "Right-click the folder, hold Option, choose 'Copy as Pathname'"
- Verify it exists: `ls "/path/to/project"`

**Ask: What should we call it in Claude OS?**
- Short name for Desktop/projects/
- Default to the folder name if user doesn't care

**Ask: Does it have its own CLAUDE.md?**
- Check: `ls "/path/to/project/CLAUDE.md"`
- If yes: Project Claude will load it automatically
- If no: Fine, Project Claude works without it

### Phase 2: Explain Symlinks

For non-technical users, explain simply:

> "I'm going to link your project folder so it appears in your Claude OS desktop. The files stay where they are — nothing moves. Any changes I make here affect your real project files. Want me to set that up?"

For technical users, just confirm:
> "I'll create a symlink to Desktop/projects/[name] — changes sync both ways."

### Phase 3: Create the Symlink

```bash
ln -s /absolute/path/to/project $PROJECT_ROOT/Desktop/projects/project-name
```

**Important:**
- Use absolute paths (not `~/`)
- Wrap paths in quotes (handles spaces)
- Target goes in Desktop/projects/

### Phase 4: Verify

```bash
ls -la Desktop/projects/
```

Should show the symlink with `->` pointing to the original path.

Test access:
```bash
ls Desktop/projects/project-name
```

Should list the project's files.

### Phase 5: Offer Project Claude

**Ask: Want me to spawn Project Claude to start working on it?**

If yes:
```python
team("spawn", role="project", project_path="Desktop/projects/project-name", description="Working on [project-name]")
```

If no:
> "Project linked! You can spawn Project Claude later when you're ready to work on it."

## Verify Completion

Success means:
1. Symlink exists in Desktop/projects/
2. `ls Desktop/projects/project-name` shows project files
3. Changes in Claude OS affect original location
4. Changes in original location appear in Claude OS
5. Project Claude can access CLAUDE.md if it exists

## Common Issues

**"No such file or directory":**
- Verify source path exists: `ls "/source/path"`
- Use absolute paths (not `~/` or relative)
- Check spelling and capitalization

**Permission denied:**
- Check folder permissions on source
- User may need to grant access

**Symlink shows as regular folder:**
- It was copied instead of linked
- Remove: `rm -r Desktop/projects/project-name`
- Recreate with `ln -s`

**Project Claude can't access files:**
- Verify symlink works: `ls -la Desktop/projects/`
- Check project_path parameter is correct
- Symlink target should be absolute path

## Examples

### Example 1: Link Startup Codebase

**User:** "I want to work on my startup's codebase"

**Claude:**
1. "Where is your startup's code?" → `/Users/name/Code/startup-app`
2. "I'll call it 'startup-app' in Claude OS. Want a different name?" → User accepts
3. Check for CLAUDE.md: `ls /Users/name/Code/startup-app/CLAUDE.md` → Found
4. "I'm going to link your project folder so it appears in Desktop/projects/. The files stay where they are, but changes sync both ways. Sound good?"
5. Execute: `ln -s /Users/name/Code/startup-app Desktop/projects/startup-app`
6. Verify: `ls -la Desktop/projects/` shows symlink
7. "Project linked! I found a CLAUDE.md file, so Project Claude will load your project-specific instructions. Want me to spawn Project Claude now?" → User says yes
8. `team("spawn", role="project", project_path="Desktop/projects/startup-app")`
9. "Project Claude spawned — check the Dashboard to see the session"

### Example 2: Link Client Work

**User:** "Add my client project"

**Claude:**
1. "Where is the client project?" → `/Users/name/Projects/client-work`
2. "What should we call it?" → `client-work`
3. No CLAUDE.md found — that's fine
4. Create symlink: `ln -s /Users/name/Projects/client-work Desktop/projects/client-work`
5. Verify
6. "Linked to Desktop/projects/client-work. Want me to spawn Project Claude?" → User says not yet
7. "All set! Spawn Project Claude when you're ready to work on it."

## Technical Notes

- Claude OS is self-contained — external projects are symlinked in
- `Desktop/projects/` is the convention (not enforced)
- Project role auto-includes `${PROJECT_PATH}/CLAUDE.md` if present
- Symlinks are standard Unix — no special Claude OS handling
- Changes propagate both ways automatically
- Git, IDEs, build tools work normally on the original location

## Why Symlinks?

- Project stays in original location (your IDE, git, tools work normally)
- Claude can access it from within Claude OS
- No duplication — one source of truth
- Changes sync automatically both ways
