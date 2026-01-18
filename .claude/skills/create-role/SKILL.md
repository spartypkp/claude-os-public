---
name: create-role
description: Create a new Claude role through conversation. Interview the user about the role's purpose, responsibilities, and modes, then generate the role file and mode files automatically.
---

# Create Role Skill

Create new Claude roles through conversation. This skill guides you through gathering requirements and generates all necessary files.

## When to Use

User wants to add a new specialist role to the system. Examples:
- "I want a role for helping me practice guitar"
- "Create a role for research assistance"
- "/create-role"

## The Interview Flow

Guide the user through these questions. Adapt based on their answers—not every question is needed for every role.

### Phase 1: Core Identity

**Q1: What should this role specialize in?**
- Get the primary function in one sentence
- Examples: "Deep research and synthesis", "Guitar practice coaching", "Code review"

**Q2: What's a good name for this role?**
- Should be single word, lowercase for file naming
- Examples: researcher, coach, reviewer

**Q3: Describe this role's identity in 2-3 sentences.**
- How would you introduce this role?
- What's its core posture?

### Phase 2: Responsibilities

**Q4: What does this role DO?**
- List 3-5 key responsibilities
- Be specific: "Write research briefs" not "help with research"

**Q5: What section should it own in today.md?**
Options:
- Use existing section (Focus, System, Idea, Project)
- Create new section (requires updating today.md template)
- No section ownership (outputs go to Dump or calling role's section)

### Phase 3: Working Style

**Q6: How should this role work?**
- Direct and opinionated, or collaborative?
- Fast iterations or deep dives?
- Any specific patterns from other roles to emulate?

**Q7: What tools does this role need?**
- Full access (default)?
- Read-only for certain areas?
- Specific MCP tools required?
- Voice mode (`converse()`) needed?

### Phase 4: Modes

**Q8: What modes should this role support?**

| Mode | When Used | Include? |
|------|-----------|----------|
| interactive | Working directly with the user | Yes (always) |
| background | Chief delegates task | Usually yes |
| autonomous | Full autonomy (rare) | Ask |

For each included mode, briefly discuss:
- What's different in this mode?
- Any special behaviors?

### Phase 5: Example

**Q9: Walk through a typical interaction.**
- What would the user say to start?
- What would the role do/say?
- What's the outcome?

This becomes the Example section in the role file.

## Generation

After gathering requirements, generate the files:

### 1. Role File: `.claude/roles/{name}.md`

```markdown
<session-role>
# {Role Name}

{2-3 sentence identity description from Q3}

## What You Do

{List from Q4, expanded}

## Your Section in today.md

{From Q5 - section ownership and what to write there}

## How You Work

{From Q6 - working style, patterns, posture}

## Tools

{From Q7 - what tools, any restrictions}

## Example

{From Q9 - concrete interaction}

## Access

{Standard access statement based on Q7}
</session-role>
```

### 2. Interactive Mode: `.claude/modes/{name}/interactive.md`

```markdown
# {Role Name} — Interactive Mode

> {One-line summary of interactive mode behavior}

## What This Mode Means

the user is HERE, working with you:
- {3-4 bullets about interactive behavior}

**The rhythm:** {Describe the back-and-forth}

## Tool Usage Patterns

{Relevant MCP tool examples for this role}

## When to Ask vs Continue

| Situation | Action |
|-----------|--------|
| {situation} | {action} |

## Example

{Short interactive exchange}

## Anti-Patterns

{3-4 DON'T statements}
```

### 3. Background Mode: `.claude/modes/{name}/background.md`

```markdown
# {Role Name} — Background Mode

> {One-line summary of background mode behavior}

## What This Mode Means

Chief (or the user) delegated a task:
- Execute fully
- Document in working doc
- Call done() when finished (auto-notifies Chief)

**The rhythm:** Task received → Work → Document → done().

## Tool Usage Patterns

{Relevant MCP tool examples for this role}

## When to Continue vs done()

| Situation | Action |
|-----------|--------|
| Task complete | done() with summary (auto-notifies Chief) |
| Major milestone | Update working doc, continue |
| True blocker | Note in working doc, continue other work |
| Minor decisions | Make them, document |

## Example

{Short background task example}

## Anti-Patterns

**DON'T do partial work.** Complete the task.
**DON'T over-update.** Batch progress in working doc.
**DON'T skip documentation.** Working doc is required.
**DON'T forget done().** Close gracefully.
```

### 4. Autonomous Mode (if requested): `.claude/modes/{name}/autonomous.md`

```markdown
# {Role Name} — Autonomous Mode

> {One-line summary of autonomous behavior}

## What This Mode Means

Full autonomy granted. No check-ins needed except at boundaries.
- Execute work queue
- Document everything
- Handoff at 60% context

## Tool Usage Patterns

{Include reset() for context management}

## Guardrails

{What this role should NOT do autonomously}
```

## After Generation

1. **Verify files parse correctly** - Read them back
2. **Create the mode directory** - `mkdir -p .claude/modes/{name}`
3. **Test spawn** - Can Chief spawn this role?
4. **Behavior probe** - Ask the new role "What do you do?"

## File Locations

```
.claude/
├── roles/
│   └── {name}.md           # Role definition
└── modes/
    └── {name}/
        ├── interactive.md  # Working with the user
        ├── background.md   # Delegated task
        └── autonomous.md   # Full autonomy (optional)
```

## Tips

- **Start small.** A minimal viable role can always be expanded.
- **Copy patterns.** Look at existing roles (system.md, focus.md, idea.md) for structure.
- **Examples matter.** A good example teaches more than abstract descriptions.
- **Test immediately.** Spawn the role and verify before considering it done.

## Rollback

If the new role doesn't work:

```bash
# Remove role file
rm .claude/roles/{name}.md

# Remove mode directory
rm -rf .claude/modes/{name}/
```

No database entries, no service restarts—just file deletion.
