---
name: setup-accounts
description: Connect email, calendar, and messaging accounts
---

# Setup Accounts Skill

Connect email, calendar, and messaging accounts to Claude OS. Most accounts auto-discover from Apple's Mail, Calendar, and Contacts apps. This skill guides through discovery, verification, and manual setup when needed.

## When to Use

User wants to connect accounts:
- "I want Claude to access my email"
- "Set up my Gmail account"
- "Connect my work calendar"
- `/setup-accounts`

## The Flow

Guide the user through checking current accounts, discovering new ones, and configuring capabilities.

### Phase 1: Check Current Accounts

Start by seeing what's already connected:

```python
email("accounts")
```

This shows:
- All configured accounts
- What each can do (read email, send email, calendar access)
- Which account is primary

**Show user the output.**

**Ask: What else do you want to connect?**
- More email accounts
- Calendar access
- Contacts sync
- Or configure capabilities for existing accounts

### Phase 2: Understand the System

**Explain auto-discovery:**

> "The system automatically finds accounts from your Mac's Mail, Calendar, and Contacts apps. If an account is in Mail.app, Claude can usually read it without any setup."

**What discovery finds:**
- Mail.app accounts (Gmail, iCloud, Exchange, IMAP)
- Calendar owners from Calendar.app
- Contact sources from Contacts.app

**What needs manual setup:**
- Gmail accounts for *sending* email (requires OAuth)
- Custom capabilities (enabling send, disabling read)

### Phase 3: Adding Accounts

#### For Apple-based accounts (Mail.app, iCloud, Exchange)

**Step 1:** "Add the account in System Settings → Internet Accounts"
- Guide them to open System Settings
- Click Internet Accounts
- Add the account (Gmail, iCloud, Exchange, etc.)
- Enable Mail, Calendar, and Contacts

**Step 2:** Restart backend to re-run discovery
```python
service("restart", name="backend")
```

**Step 3:** Verify the account appears
```python
email("accounts")
```

**Confirm:** "Account should appear now. Can you see it in the list?"

#### For Gmail with send capability

Gmail needs OAuth for sending. Read-only works via Mail.app, but sending requires API access.

**Step 1:** Run OAuth setup
```bash
cd .engine && ./venv/bin/python src/cli/gmail_oauth_setup.py
```

This opens a browser for Google login and permission grant.

**Step 2:** Add to accounts.yaml
```bash
open .engine/config/accounts.yaml
```

Guide them to add:
```yaml
accounts:
  user@gmail.com:
    display_name: "User - Personal"
    can_send_email: true
    provider_config:
      client_id: "${GMAIL_CLIENT_ID}"
      client_secret: "${GMAIL_CLIENT_SECRET}"
      refresh_token: "${GMAIL_REFRESH_TOKEN}"
```

**Step 3:** Restart backend
```python
service("restart", name="backend")
```

**Step 4:** Verify
```python
email("accounts")
```

Should show `can_send_email: true` for that account.

### Phase 4: Configure Capabilities

Accounts can be configured in `.engine/config/accounts.yaml`:

**Common configurations:**
```yaml
accounts:
  user@example.com:
    can_send_email: false      # Draft only, don't send
    can_delete_calendar: false # Read and create, don't delete
    is_primary: true           # Default account for new events
```

**Ask: What capabilities do you want?**
- Read-only email (no sending)
- Draft email (manual send)
- Autonomous sending (Claude can send without asking)
- Calendar read/write/delete
- Primary account (default for new events)

**Guide them to edit accounts.yaml**, then:
```python
service("restart", name="backend")
```

### Phase 5: Verify Everything Works

**Test email read:**
```python
email("unread", limit=5)
```

**Test calendar:**
```python
calendar("list", from_date="2026-01-14", to_date="2026-01-15")
```

**Test contacts:**
```python
contact("list", limit=5)
```

**Confirm with user:** "Everything working? You should see your emails, events, and contacts."

## Verify Completion

Success means:
1. `email("accounts")` shows desired accounts
2. Each account has correct capabilities
3. Test reads succeed (email, calendar, contacts)
4. User understands what Claude can/cannot do with each account

## Common Issues

**Account not appearing:**
- Is it in Mail.app? Discovery only finds Mail.app accounts
- Restart backend: `service("restart", name="backend")`
- Check System Settings → Internet Accounts (is Mail enabled?)

**Can't send email:**
- Check `can_send_email` in accounts.yaml
- Gmail needs OAuth setup (see Phase 3)
- Only `is_claude_account: true` accounts can send autonomously
- Regular accounts can draft (manual send)

**Calendar not syncing:**
- Calendar discovery uses owner_identity_email from Calendar.app
- Verify calendar is enabled in System Settings → Internet Accounts
- Check calendar permissions

**Backend won't restart:**
- Check logs: `service("logs", name="backend", lines=50)`
- Syntax error in accounts.yaml (YAML is picky about indentation)
- Missing required fields

**OAuth flow fails:**
- Gmail API must be enabled in Google Cloud Console
- Client ID and secret must be valid
- Refresh token must be saved correctly

## Examples

### Example 1: Connect Gmail Read-Only

**User:** "I want Claude to read my Gmail"

**Claude:**
1. Check current: `email("accounts")` → Gmail not listed
2. "Is your Gmail account in Mail.app?" → User says yes
3. "Great! Restart the backend and it'll auto-discover:"
4. `service("restart", name="backend")`
5. Wait 10 seconds, then: `email("accounts")` → Gmail appears
6. "Gmail connected! Testing..." `email("unread", limit=5)`
7. "Working! You have 5 unread emails. Claude can read and search, but not send (that requires OAuth setup)."

### Example 2: Enable Gmail Sending

**User:** "I want Claude to draft emails from my Gmail"

**Claude:**
1. Check current: `email("accounts")` → Gmail exists, `can_send_email: false`
2. "Gmail sending requires OAuth. I'll walk you through it."
3. "First, run this command:" `cd .engine && ./venv/bin/python src/cli/gmail_oauth_setup.py`
4. Wait for browser flow
5. "Now open accounts.yaml and add this config..." (provide template)
6. "Save and close, then I'll restart the backend"
7. `service("restart", name="backend")`
8. Verify: `email("accounts")` → `can_send_email: true`
9. "Gmail sending enabled! I can now draft emails for your review."

### Example 3: Add Work Calendar

**User:** "Connect my work Exchange calendar"

**Claude:**
1. "Is your work account in System Settings → Internet Accounts?" → User says no
2. "Add it there first: System Settings → Internet Accounts → Add Account → Exchange"
3. Wait for user
4. "Done? I'll restart the backend to pick it up"
5. `service("restart", name="backend")`
6. Test: `calendar("calendars")` → Work calendar appears
7. "Work calendar connected! Testing..." `calendar("list", from_date="2026-01-14")`
8. "Working! I can see your work events now."

## Technical Notes

- Config file: `.engine/config/accounts.yaml`
- Discovery service: `.engine/src/services/account_discovery.py`
- Database table: `accounts`
- Restart backend after any accounts.yaml changes
- Discovery runs automatically on backend startup
- Capabilities are per-account (not global)
- `is_claude_account: true` enables autonomous sending (with safeguards)
