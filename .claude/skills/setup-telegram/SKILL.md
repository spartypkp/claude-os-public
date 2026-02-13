---
name: setup-telegram
description: Connect Telegram to Claude OS. Walks through creating a bot via @BotFather, getting the user's chat ID, configuring .env, and testing the connection. Use when user says "set up Telegram", "connect Telegram", "configure Telegram bot", or wants to message Claude from their phone.
---

# Setup Telegram

Guide the user through connecting Telegram to Claude OS so they can message Chief from their phone.

## What Telegram Does in Claude OS

Telegram is a **mobile interface to Chief**. Once connected:
- Messages sent to the bot get injected into Chief's conversation (tagged `[Telegram HH:MM]`)
- Chief's responses stream back to Telegram automatically
- Photos, locations, and URLs are supported
- Commands like `/calendar`, `/priorities`, `/status` work directly
- The `show()` tool can render calendars and contact cards as images to Telegram

It's the same Chief, just accessible from your phone.

## Before Starting

Check if Telegram is already configured:

```bash
# Check if env vars are set (without revealing values)
(grep -q "^TELEGRAM_BOT_TOKEN=" .env 2>/dev/null && echo "BOT_TOKEN: set" || echo "BOT_TOKEN: not set") && \
(grep -q "^TELEGRAM_USER_ID=" .env 2>/dev/null && echo "USER_ID: set" || echo "USER_ID: not set")
```

If both are set, skip to **Step 4: Test the Connection**.

If already working, just confirm: "Telegram is already connected and working. Want me to test it?"

---

## Step 1: Create the Bot

Walk the user through @BotFather:

> "First, we need to create a Telegram bot. This takes about 30 seconds:
>
> 1. Open Telegram and search for **@BotFather**
> 2. Send `/newbot`
> 3. Choose a name (this is the display name — anything you want, like "Claude OS")
> 4. Choose a username (must end in `bot`, like `my_claude_os_bot`)
> 5. BotFather will give you a token — it looks like `123456789:ABCdefGHI...`
>
> Copy that token and paste it here."

**When they paste the token:**
- Validate format: should match pattern like `\d+:[A-Za-z0-9_-]+`
- If it looks right, acknowledge: "Got it. Let me save that."
- Tell them to run the .env edit themselves since the file is protected:

> "Run this in your terminal (paste your actual token):"
> ```bash
> echo 'TELEGRAM_BOT_TOKEN=YOUR_TOKEN_HERE' >> .env
> ```

**Optional bot customization** (mention but don't push):
> "If you want, you can also customize your bot in BotFather:
> - `/setdescription` — what people see when they find your bot
> - `/setuserpic` — give it an avatar
> - `/setcommands` — add command hints (calendar, priorities, status, spawn)
>
> None of this is required — we can do it later."

## Step 2: Get Your User ID

> "Next, I need your Telegram user ID so the bot only responds to you (security — no one else can talk to it).
>
> 1. In Telegram, search for **@userinfobot**
> 2. Send it any message
> 3. It replies with your user ID — a number like `123456789`
>
> Paste that here."

**When they paste the ID:**
- Validate: should be a numeric string
- Tell them to add it to .env:

> "Add this to your .env too:"
> ```bash
> echo 'TELEGRAM_USER_ID=YOUR_ID_HERE' >> .env
> ```

## Step 3: Restart Services

The backend needs to reload to pick up the new env vars:

```bash
./restart.sh
```

Wait for health checks to pass. Then:

> "Services restarted. The Telegram bot should now be listening."

## Step 4: Test the Connection

> "Open Telegram and send any message to your bot. Try 'hello' — you should see it appear here in my conversation tagged with `[Telegram]`.
>
> Then I'll reply, and you should see my response in Telegram."

**Wait for their message to arrive.** When it does:

> "Got your message! I can see it tagged `[Telegram HH:MM]`. Let me send something back..."

Send a reply — just respond naturally. Then:

> "Check Telegram — you should see my response. If you do, we're all set!"

**Test the commands too:**

> "Try these in Telegram:
> - `/calendar` — shows today's schedule
> - `/priorities` — shows today's priorities
> - `/status` — shows what Claude is doing"

## Step 5: Confirm and Explain

Once working:

> "Telegram is connected. Here's what you can do:
>
> **From your phone:** Message me anytime. I'll see it in my conversation and respond. Your messages show up tagged `[Telegram]` so I know they came from your phone.
>
> **What works:** Text, photos (I can see images you send), locations, and URLs (I auto-expand Twitter links and Google Maps).
>
> **Commands:** `/calendar`, `/priorities`, `/status`, `/spawn [role]`
>
> **From my side:** When I use `show("calendar")` or `show("priorities")`, I can render them as images and send them to your Telegram.
>
> This is the same conversation — Telegram is just another way to reach me, alongside the terminal and Dashboard."

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot doesn't respond | Check backend logs: `tmux capture-pane -t life:backend -p \| tail -20`. Look for "Telegram service disabled" — means env vars aren't set. |
| "Unauthorized" reply | `TELEGRAM_USER_ID` doesn't match. Re-check with @userinfobot. |
| Messages don't appear in Chief | Chief session might not be running. Check `tmux list-windows -t life`. |
| Chief replies don't reach Telegram | Transcript watcher may not have started. Restart backend: `./restart.sh` |
| Token "invalid" errors | Re-copy token from @BotFather. Make sure no extra spaces. |
| Old `TELEGRAM_CHAT_ID` in .env | Rename to `TELEGRAM_USER_ID` — the code reads `TELEGRAM_USER_ID`. |

---

## Idempotency

If user runs `/setup-telegram` again:
1. Check if already configured (both env vars set)
2. If yes, skip to testing
3. If partially configured, pick up where they left off
4. If connection test fails, troubleshoot
