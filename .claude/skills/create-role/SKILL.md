---
name: create-role
description: Create a new Claude specialist role through guided conversation. Generates the role definition and mode files. Use when user says "create a role", "I want a specialist for X", "add a new role", or needs a domain-specific Claude persona.
---

# Create Role

Guide the user through creating a custom specialist role.

## What This Does

A role is a Claude persona with specific expertise, tone, and context. Roles live in `.claude/roles/{name}/` with up to 5 files:
- `role.md` — Identity and capabilities (required)
- `interactive.md` — How to work in real-time with the user
- `preparation.md` — How to plan work (specialist loop phase 1)
- `implementation.md` — How to execute work (specialist loop phase 2)
- `verification.md` — How to verify work (specialist loop phase 3)

Not every role needs all 5. Interactive-only roles just need `role.md` + `interactive.md`.

## The Conversation

### Step 1: What's the Role?

Ask: **"What kind of specialist do you need?"**

Examples that help frame it:
- "A writing coach who reviews my drafts"
- "A fitness tracker that plans workouts"
- "A financial analyst for my investments"

Get the **name** (short, lowercase, one word ideally) and **purpose** (one sentence).

### Step 2: How Does It Work?

Ask: **"How would you use this role?"**

Two patterns:
- **Interactive** — You talk to it directly, pair-work style (like Chief)
- **Autonomous** — You give it a task, it works through prep/implementation/verification alone (like Builder on a spec)
- **Both** — Can do either depending on the task

This determines which mode files to generate.

### Step 3: What Makes It Special?

Ask: **"What should this role know or do differently from regular Claude?"**

Listen for:
- Domain expertise or context to load
- Specific tools it should use
- Tone (formal? casual? tough love?)
- Files it should auto-include at session start
- Constraints (what it should NOT do)

### Step 4: Generate the Files

**`role.md`** — The role definition. Format:

```markdown
---
auto_include:
  - Desktop/SYSTEM-INDEX.md
  {- any domain-specific files}
---

<session-role>
# {Role Name}

{2-3 paragraph description: who this role is, what it does, how it differs from other roles}

## Core Responsibilities

{Bullet list of what this role handles}

## How It Works

{How this role approaches problems — its methodology, priorities, style}

## Tools

{Which MCP tools it primarily uses, if relevant}

## Access

{What files/systems it can read and modify}
</session-role>
```

**`interactive.md`** — Only if the role supports interactive use. Describe the conversational rhythm, what a typical session looks like, how to communicate.

**`preparation.md`**, **`implementation.md`**, **`verification.md`** — Only if the role supports autonomous specialist loop. Follow the patterns from Builder's mode files (read `.claude/roles/builder/preparation.md` etc. for reference).

### Step 5: Register and Verify

After generating files:
1. Confirm all files exist in `.claude/roles/{name}/`
2. The role is immediately available — Chief can spawn it with `team("spawn", role="{name}", ...)`
3. Tell the user how to invoke it

**Custom roles also need to be added to SYSTEM-INDEX.md** under the Custom Roles table if they're domain-specific (not one of the base seven).
