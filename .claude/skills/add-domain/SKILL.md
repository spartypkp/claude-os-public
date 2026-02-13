---
name: add-domain
description: Add a new life domain to Claude OS. Creates the Desktop folder and LIFE-SPEC.md through a guided conversation. Use when user says "add a domain", "I want Claude to help with fitness", "track my finances", or wants to extend what Claude manages.
---

# Add Life Domain

Guide the user through adding a new life domain to Claude OS.

## What This Does

A life domain is a folder on the Desktop with a LIFE-SPEC.md inside it. The LIFE-SPEC describes goals, current state, and strategy for that area of life. Claude reads it at the start of sessions to understand what the user cares about and where things stand.

## The Conversation

### Step 1: Understand What They Want

Ask: **"What area of your life do you want Claude to help with?"**

Listen for the domain — fitness, finances, relationships, side project, learning, etc. If they're vague, help them name it. The name becomes a folder.

### Step 2: Ask 3 Questions

1. **"Where are you now?"** — Current state. What's happening, what's working, what's not.
2. **"Where do you want to be?"** — Goals. What does success look like?
3. **"What's getting in the way?"** — Obstacles, constraints, context Claude should know.

Keep it conversational. Don't interrogate. Their answers become the spec.

### Step 3: Generate the Spec

Create `Desktop/{domain-name}/LIFE-SPEC.md` with this structure:

```markdown
---
type: spec
description: "{One-line summary of this domain}"
---

# {Domain Name} Specification

**Last Updated:** {today's date}

---

## Current State

{What they told you about where they are now}

## Goals

{What they told you about where they want to be}

## Strategy

{Your synthesis — how to get from current state to goals, informed by obstacles they mentioned}

## What Claude Should Do

{Concrete ways Claude can help in this domain — check-ins, tracking, reminders, research, etc.}
```

### Step 4: Confirm

Show them the spec. Ask if it captures what they meant. Edit if needed.

### Step 5: Verify

- Folder exists at `Desktop/{domain-name}/`
- LIFE-SPEC.md is inside it
- SYSTEM-INDEX.md will pick it up automatically via the watcher

Tell them: "This domain is live. Claude will see it at the start of every session now. You can edit the spec anytime — it's just a markdown file."
