---
name: build-app
description: Build a custom app for the Dashboard through guided conversation. Walks through what to track, generates the spec, then builds the full stack (backend, database, MCP tools, UI). Use when user says "build an app", "I want to track X", "create a dashboard for Y", or wants a custom application.
---

# Build App

Guide the user from idea to working custom app on their Dashboard.

## What This Does

A custom app is a full-stack feature: backend service + database + MCP tools + Dashboard UI. It lives in `Desktop/{app-name}/` with an APP-SPEC.md blueprint, and the code lives in `.engine/src/modules/{name}/` (backend) and `Dashboard/app/{name}/` (frontend).

This is the most complex customization in Claude OS. The skill handles both the design conversation AND the build.

## The Conversation

### Step 1: What Do You Want?

Ask: **"What do you want to track, manage, or see on your Dashboard?"**

Don't let them get bogged down in technical details yet. Just understand the THING:
- "Track my reading list"
- "Monitor my side project hours"
- "See my meal prep plans"

### Step 2: What Data?

Ask: **"What information matters for each item?"**

Help them think through the fields. For a reading list: title, author, status (want to read / reading / finished), rating, notes. Keep it minimal — they can always add fields later.

### Step 3: What Actions?

Ask: **"What do you want to do with this data?"**

Common patterns:
- Add / edit / delete items (CRUD)
- Change status (state machine)
- View by category or filter
- Track progress over time
- Get summaries or stats

### Step 4: How Should Claude Interact?

Ask: **"Should Claude be able to read and update this through conversation?"**

If yes, we build MCP tools so Claude can `reading_list("add", title="Dune", author="Herbert")` etc. Most apps want this.

### Step 5: Generate the APP-SPEC.md

Write `Desktop/{app-name}/APP-SPEC.md`:

```markdown
# {App Name}

## Overview
{One paragraph: what this app does and why}

## Data Schema
{Tables and fields from Step 2}

## Features
{Actions from Step 3, organized by priority}

## MCP Tools
{Tool name and operations from Step 4}

## Views
{What the Dashboard page shows — list view, detail view, stats, etc.}

## Design
- Dark theme matching Dashboard aesthetic
- {Any specific UI preferences the user mentioned}
```

Also create `Desktop/{app-name}/manifest.yaml`:
```yaml
name: {App Name}
route: /{app-name}
description: {One-line description}
```

### Step 6: Build It

**This is where it gets technical.** Either build it directly or spawn Builder:

**Build directly if:** Simple CRUD, 1-2 tables, standard patterns.

**Spawn Builder if:** Complex logic, multiple tables, new patterns.

The build creates:
1. `.engine/src/modules/{name}/` — service.py, api.py, __init__.py
2. `.engine/config/schema.sql` — Add tables
3. `.engine/src/adapters/life_mcp/tools/{name}.py` — MCP tool
4. `Dashboard/app/{name}/page.tsx` — Frontend

After building: run migrations, restart services (`./restart.sh`), verify API responds, verify Dashboard loads.

### Step 7: Verify Together

Walk the user through it:
1. "Try asking me to add something" (test MCP tool)
2. "Open localhost:3000/{app-name}" (test Dashboard)
3. "Does this look right?"

Iterate until they're happy.
