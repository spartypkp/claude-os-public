---
name: setup-accounts
description: Connect email, calendar, and messaging accounts to Claude OS. Discovers available accounts, configures access, and tests connections. Use when user says "connect my email", "set up Gmail", "add my calendar", "configure accounts", or wants Claude to read/send email and manage calendar.
---

# Setup Accounts

Guide the user through connecting their accounts to Claude OS.

## What This Does

Claude OS can read/write email, calendar, and iMessage through the MCP server. Each provider needs different setup:
- **Apple Mail/Calendar** — Reads directly from macOS databases. No OAuth needed, just permissions.
- **Gmail** — Needs OAuth credentials for sending. Reading works through Apple Mail if synced.
- **iMessage** — Reads from local macOS Messages database. Sends via AppleScript.

## The Conversation

### Step 1: Discover What's Available

Run account discovery:
```
email("discover")
email("accounts")
calendar("calendars")
messages("test")
```

Show the user what's already connected and what's available.

### Step 2: What Do They Want?

Ask: **"Which accounts do you want Claude to have access to?"**

Common setups:
- "Read my Gmail but don't send anything" — Just ensure Gmail is in Apple Mail
- "Draft emails for me to review" — Draft mode (opens compose window, user reviews before sending)
- "Send emails on my behalf" — Requires OAuth setup + explicit sending permission
- "Manage my calendar" — Calendar read/write access
- "Read my messages" — iMessage access (privacy-sensitive, discuss implications)

### Step 3: Configure Each Account

**For Apple Mail/Calendar (easiest):**
1. Verify the account appears in `email("discover")`
2. Test with `email("unread", account="...", limit=5)`
3. If it works, done. Apple handles auth via macOS keychain.

**For Gmail sending:**
1. Need Google Cloud OAuth credentials (client_id, client_secret)
2. Walk through: Google Cloud Console → Create Project → Enable Gmail API → Create OAuth credentials
3. Configure in Claude OS: save credentials, run OAuth flow
4. Test with `email("draft", to="themselves", subject="Test", content="Testing Claude OS email")`

**For Calendar:**
1. Check `calendar("calendars")` — lists all available calendars
2. Test read: `calendar("list", from_date="today", to_date="tomorrow")`
3. Test write: Create a test event, then delete it

**For iMessage:**
1. Test connection: `messages("test")`
2. If working, test read: `messages("conversations", limit=5)`
3. Discuss privacy: Claude can read all local messages. User should understand the scope.
4. Sending is permission-gated — user approves each send.

### Step 4: macOS Permissions

If any integration fails with a permission error, guide the user to grant access:

**Full Disk Access** (needed for email reading and iMessage):
1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click the **+** button
3. Add the terminal app they're using (Terminal, iTerm2, VS Code, Cursor, etc.)
4. Also add `/usr/bin/python3` if running from a script
5. Restart the terminal after granting

**Calendar access:**
1. Open **System Settings** → **Privacy & Security** → **Calendars**
2. Enable access for the terminal app
3. If Calendar.app hasn't been opened yet, open it once to create the database

**Contacts access:**
1. Open **System Settings** → **Privacy & Security** → **Contacts**
2. Enable access for the terminal app

**Automation** (needed for drafts, sends via AppleScript):
1. Open **System Settings** → **Privacy & Security** → **Automation**
2. Allow the terminal app to control **Mail.app** and **Messages.app**

**Common gotcha:** Claude Code runs as a child of whatever terminal app it's in. So granting Full Disk Access to "Terminal" covers all processes launched from Terminal, including Claude Code and the Python backend.

### Step 5: Set Permissions

Help the user decide what Claude can do autonomously vs. what needs approval:
- **Draft freely, ask before sending** (recommended default for email)
- **Read freely, ask before writing** (recommended for calendar)
- **Read only** (recommended for messages initially)

### Step 6: Verify Everything

Test each configured account:
```
email("unread", account="...", limit=3)
calendar("list", from_date="today", to_date="tomorrow")
messages("test")
```

Confirm with user: "Here's what I can see. Does this look right? Anything I shouldn't have access to?"

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `email("discover")` returns empty | Open Mail.app, add account via System Settings → Internet Accounts |
| `calendar("calendars")` returns empty | Open Calendar.app once, check macOS Privacy & Security → Calendars |
| `messages("test")` fails | Grant Full Disk Access to terminal app, restart terminal |
| Draft opens wrong app | Check which Mail client is default in System Settings → Default Apps |
| Gmail sending fails | OAuth credentials needed — set up via Google Cloud Console |
| "Database locked" errors | Close other apps reading the same database, or restart backend |

For a deeper walkthrough of any integration, ask: "Help me set up [email/calendar/messages]"
