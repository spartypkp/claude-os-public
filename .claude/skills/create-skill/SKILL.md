---
name: create-skill
description: Create a new Claude skill (workflow prompt). Walks through defining the trigger, steps, and outputs, then generates the SKILL.md file. Use when user says "create a skill", "teach Claude to do X", "add a workflow", or wants to automate a multi-step process.
---

# Create Skill

Guide the user through creating a new skill for Claude.

## What This Does

A skill is a workflow prompt that Claude follows when triggered. It lives in `.claude/skills/{name}/SKILL.md`. Claude Code matches skills by their `description` field — when a user's request semantically matches the description, the skill activates and Claude follows the steps inside.

**A skill earns its existence when it encodes a specific sequence of steps that Claude would get wrong or skip without the prompt.** If Claude can already do it well from a plain request, it doesn't need to be a skill.

## The Conversation

### Step 1: What's the Workflow?

Ask: **"What do you want Claude to do, step by step?"**

Listen for the SEQUENCE — skills are workflows, not capabilities. Good skills:
- "Check my portfolio, compare to benchmarks, write a summary, send it to me"
- "Pull the next leetcode problem, start a timer, score me when done"
- "Archive yesterday's notes, consolidate memory, prepare a morning brief"

Bad skills (Claude already does these):
- "Write good emails" (that's just Claude being Claude)
- "Research a topic" (too generic, no specific steps)

### Step 2: When Should It Trigger?

Ask: **"How would you ask for this? What words would you use?"**

Their answer becomes the `description` field and trigger examples. Think about:
- Slash command: `/money-check`, `/morning`, `/leetcode`
- Natural language: "check my portfolio", "do the morning thing"
- Scheduled: runs at a specific time (via missions)

### Step 3: What Are the Steps?

Walk through the workflow together. For each step, clarify:
- What tool or action? (MCP tool, file read/write, API call, subagent)
- What data flows from one step to the next?
- Are there decision points? (if X then Y, else Z)
- What does the output look like?

### Step 4: Generate the SKILL.md

Create `.claude/skills/{name}/SKILL.md`:

```markdown
---
name: {skill-name}
description: {What this skill does and when to trigger it. Be specific — this is the semantic match target. Include example phrases users would say.}
---

# {Skill Title}

{One sentence: what this skill does.}

## When to Use

{2-4 bullet points of trigger phrases}

## The Flow

### Step 1: {Action}
{What to do, which tools to use, what to check}

### Step 2: {Action}
{Next step, referencing output from Step 1 if needed}

{...continue for each step...}

## Verify Completion

{How to know it worked — what should be true when done}
```

**Key principles:**
- Keep it under 200 lines. If it's longer, the workflow is too complex for one skill.
- Be specific about which tools to call and what arguments to pass.
- Include error handling for common failure modes.
- The description field matters most — it's how Claude Code decides to activate the skill.

### Step 5: Test It

After creating the file:
1. Tell the user the trigger phrases
2. Have them try invoking it naturally
3. Watch if Claude picks it up and follows the steps
4. Iterate on the description if it doesn't trigger, or on the steps if it triggers but does the wrong thing
