---
name: first-run
description: Onboard new Claude OS user — services, accounts, identity, first steps
---

# First Run Skill

Onboard a new Claude OS user. Verify services are running, discover accounts, set up identity, and orient them to the system.

## When to Use

User just installed Claude OS:
- First conversation after installation
- "Help me get started"
- "What is this?"
- `/first-run`

## The Flow

Guide the user through verification, discovery, setup, and orientation.

### Phase 1: Welcome

**Greet them:**

> "Welcome to Claude OS! This is a local system on your Mac where Claude manages your life — calendar, contacts, tasks, projects, everything. I'm Chief Claude, your orchestrator and daily partner."
>
> "Two interfaces: This terminal (where we're talking now), and the Dashboard (visual desktop at localhost:3000)."
>
> "Let me verify everything's running, then I'll help you get oriented."

### Phase 2: Verify Services

Check that backend and dashboard are running:

```python
service("status")
```

**If both running:**
> "✓ Backend and Dashboard are running."

**If backend not running:**
```python
service("restart", name="backend")
```
> "Started the backend. Give it 10 seconds..."

**If dashboard not running:**
```python
service("restart", name="dashboard")
```
> "Started the Dashboard. It'll be ready at localhost:3000 in about 30 seconds."

### Phase 3: Discover Accounts

Check what accounts were auto-discovered:

```python
email("accounts")
```

**Show user the results.**

**Explain discovery:**
> "The system found these accounts from your Mac's Mail, Calendar, and Contacts apps. If an account is in Mail.app, Claude can usually read it without setup."

**Ask: Do you want to connect more accounts or configure these?**

If yes → Hand off to `/setup-accounts` skill:
> "I'll pass you to the account setup flow..."

If no → Continue to next phase.

### Phase 4: Set Up Identity

**Explain identity.md:**
> "Desktop/identity.md tells me who you are. Basic facts I should know — your name, what you do, what you care about. This helps me understand context."

**Ask a few key questions:**
1. "What's your name?"
2. "What do you do?" (job, student, etc.)
3. "What are you working on right now?" (job search, projects, etc.)
4. "Anything else I should know?"

**Write to Desktop/identity.md:**

Create the file with their answers. Template:
```markdown
---
type: identity
---

# Identity

## Who I Am

[Name]
[What they do]

## Current Focus

[What they're working on]

## Context

[Anything else they mentioned]

---

*This file helps Claude understand who you are and what matters to you.*
```

Confirm:
> "Created Desktop/identity.md. You can edit this anytime — just open it in the Dashboard Finder."

### Phase 5: Create First Priority

**Explain priorities:**
> "Priorities are today's important tasks. They show in the Dashboard widget. I can track them for you."

**Ask: What's your first priority?**

```python
priority("create", content="[what they said]", level="medium")
```

Confirm:
> "Added to today's priorities. You'll see it in the Dashboard."

### Phase 6: Open Dashboard

**Guide them to the Dashboard:**
> "Open your browser to http://localhost:3000"

Wait for them to confirm it loaded.

**Orient them to the interface:**
- "The Desktop shows your files and folders (like a Mac desktop)"
- "Widgets on the side show today's calendar, priorities, and active Claude sessions"
- "Claude Finder lets you browse Desktop/ files"
- "Calendar, Contacts, and other apps are in the dock"

### Phase 7: Next Steps

**Ask: What do you want to do first?**

Suggest based on common needs:

| If They Say | Next Step |
|-------------|-----------|
| "Work on a project" | `/link-project` |
| "Connect more accounts" | `/setup-accounts` |
| "Build a custom app" | `/build-app` |
| "Set up automation" | `/create-mission` |
| "Just explore" | "Browse the Dashboard, open files in Finder, ask me anything" |

**Explain how to work with Claude:**
- "Talk to me naturally — I'll read files, update things, help you think"
- "I can spawn other Claudes for focused work (Builder for code, Deep Work for research)"
- "Everything persists in files — memory, specs, documents. I remember across conversations."

### Phase 8: Verify Basic Functionality

Quick checks to ensure everything works:

**Calendar:**
```python
calendar("list", from_date="2026-01-14", to_date="2026-01-15")
```
> "✓ Calendar working — I can see your events"

**Files:**
```bash
ls Desktop/
```
> "✓ File system working — your Desktop is ready"

**Memory:**
```bash
ls Desktop/TODAY.md Desktop/MEMORY.md
```
> "✓ Memory files exist — I'll remember our conversations"

## Verify Completion

Success means:
1. Services running (backend + dashboard)
2. Accounts discovered
3. Identity.md created with basic info
4. First priority added
5. User opened Dashboard successfully
6. User knows what to do next
7. Basic functionality verified (calendar, files, memory)

## Common Issues

**Dashboard won't load:**
- Check service status: `service("status")`
- Restart: `service("restart", name="dashboard")`
- Wait 30 seconds for Next.js to build
- Check browser at http://localhost:3000 (not https)

**No accounts found:**
- Accounts must be in System Settings → Internet Accounts first
- Mail, Calendar, and Contacts must be enabled
- Restart backend: `service("restart", name="backend")`

**Backend errors:**
- Check logs: `service("logs", name="backend", lines=50)`
- Common: dependency issues (need to run setup script)
- Port conflict: something else on port 5001

**Identity.md won't save:**
- Check permissions on Desktop/
- Verify path: `$PROJECT_ROOT/Desktop/identity.md`
- Use Write tool, not bash echo

**Can't access Claude Code:**
- Verify Claude Code is installed: `claude --version`
- Check tmux session exists: `tmux ls`
- May need to restart terminal

## Example Flow

**User:** "I just installed Claude OS. Help me get started."

**Claude:**

"Welcome to Claude OS! This is a local system where Claude manages your life — calendar, contacts, tasks, projects, everything. I'm Chief Claude, your orchestrator.

Two interfaces: This terminal (where we're talking now), and the Dashboard (visual desktop at localhost:3000).

Let me verify everything's running..."

`service("status")`

"✓ Backend and Dashboard running.

Let me check what accounts were auto-discovered..."

`email("accounts")`

"Found your Gmail and iCloud accounts from Mail.app. I can read these without any setup. Want to connect more or configure sending? We can do that with `/setup-accounts` anytime.

Now let's create your identity file. A few quick questions:

What's your name?"

**User:** "the user"

"What do you do?"

**User:** "Software engineer, looking for a job"

"What are you working on right now?"

**User:** "Job search, interview prep"

"Anything else I should know about you?"

**User:** "ADHD, need help staying organized"

"Got it. Creating Desktop/identity.md..."

[Writes identity.md with his answers]

"Created! You can edit this anytime in the Dashboard.

What's your first priority today?"

**User:** "Prep for Anthropic interview"

`priority("create", content="Prep for Anthropic interview", level="critical")`

"Added to today's priorities.

Now open your browser to http://localhost:3000 — that's your Dashboard."

[User opens it]

"See it? The Desktop shows your files, widgets on the side show your calendar and priorities. Claude Finder (in the dock) lets you browse files.

What do you want to do first? I can help you:
- Link a project you're working on
- Build a custom app (like a job search tracker)
- Set up automation (like daily briefs)
- Or just explore and ask questions"

**User:** "Maybe build a job search tracker?"

"Perfect! Let's do that. I'll hand you off to the app-building flow..."

[Invokes `/build-app` skill]

## Technical Notes

- Services run in tmux windows (backend, dashboard)
- Dashboard is Next.js dev server (localhost:3000)
- Backend is FastAPI (localhost:5001)
- Account discovery reads from Mail.app/Calendar.app databases
- identity.md is user-editable (not locked)
- First priority creates database entry
- Memory files (TODAY.md, MEMORY.md) pre-exist from installation
- System works entirely offline (except OAuth flows)
