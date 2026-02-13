# Claude OS Setup Guide

**Your life, managed by Claude.**

---

## Quick Start (5 minutes)

```bash
# Clone
git clone https://github.com/spartypkp/claude-os-public.git
cd claude-os

# Install (handles all dependencies)
./install.sh

# Run
./start.sh
```

That's it. The install script handles Homebrew, Python, Node, and all dependencies. The start script launches everything and opens your browser.

---

## What You Need

| Requirement | Notes |
|-------------|-------|
| **macOS 12+** | Required for Apple Calendar/Contacts/Mail integration |
| **Anthropic API key** | Get one at [console.anthropic.com](https://console.anthropic.com) |

The install script will handle Python, Node, tmux, and Claude Code CLI if you don't have them.

---

## Installation

### Step 1: Clone and Install

```bash
git clone https://github.com/spartypkp/claude-os-public.git
cd claude-os
./install.sh
```

The installer will:
- Check macOS version
- Install Homebrew (if needed)
- Install Python 3.11+, Node 18+, tmux (via Homebrew)
- Create Python virtual environment
- Install all Python and Node dependencies
- Copy configuration templates
- Initialize the database

### Step 2: Install Claude Code CLI

If the installer didn't find Claude Code:

```bash
npm install -g @anthropic-ai/claude-code
```

Then run `claude` once to set up your API key.

### Step 3: Grant Permissions

Claude OS reads from macOS Calendar, Contacts, and Mail. You'll need to grant access:

**Calendar & Contacts:**
- System Settings → Privacy & Security → Calendar → Enable for Terminal
- System Settings → Privacy & Security → Contacts → Enable for Terminal

**Mail (optional, for email reading):**
- System Settings → Privacy & Security → Full Disk Access → Add Terminal

---

## Running Claude OS

### Start

```bash
./start.sh
```

This creates a tmux session with three windows:
- `backend` — Python API server (port 5001)
- `dashboard` — Next.js frontend (port 3000)
- `chief` — Claude Code session

Your browser opens to http://localhost:3000 automatically.

### Stop

```bash
./stop.sh
```

### Attach to Running Session

```bash
tmux attach -t life
```

Switch windows with `Ctrl+B` then `0`, `1`, or `2`. Detach with `Ctrl+B` then `D`.

---

## Configuration (Optional)

Most users don't need to configure anything. The defaults work.

### Environment Variables (.env)

Only needed for optional integrations:

```bash
# SMS notifications (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Cloud sync (Supabase)
SUPABASE_URL=
SUPABASE_ANON_PUBLIC=

# Autonomous email sending (Gmail API)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

### MCP Servers (.mcp.json)

Pre-configured. Only edit if you know what you're doing:

```json
{
  "mcpServers": {
    "life": {
      "command": "./venv/bin/python",
      "args": [".engine/src/life_mcp/server.py"]
    },
    "apple": {
      "command": "./venv/bin/python",
      "args": [".engine/src/life_mcp/apple_filtered.py"]
    }
  }
}
```

---

## First Time Using Claude OS

Once running:

1. **Open the Dashboard** — http://localhost:3000
2. **Fill in your identity** — Edit `Desktop/IDENTITY.md` with facts about yourself
3. **Talk to Claude** — In the chief tmux window, tell Claude about your goals

Claude will:
- Learn your schedule from Apple Calendar
- Start populating your memory files (TODAY.md, MEMORY.md)
- Start managing your priorities

See [CLAUDE.md](./CLAUDE.md) for the full operating manual.

---

## Troubleshooting

### "Command not found: claude"

```bash
npm install -g @anthropic-ai/claude-code
```

### Backend won't start

```bash
# Check if port is in use
lsof -i :5001

# Reinstall dependencies
source venv/bin/activate
pip install -r requirements.txt
```

### Dashboard won't start

```bash
cd Dashboard
rm -rf node_modules .next
npm install
```

### Permission denied for Calendar/Contacts/Mail

1. System Settings → Privacy & Security
2. Find the relevant section (Calendar, Contacts, or Full Disk Access)
3. Enable access for your terminal app

### tmux session disappeared

```bash
# Check if it exists
tmux ls

# If not, just restart
./start.sh
```

### Database errors

```bash
# Nuclear option: reset database
rm .engine/data/db/system.db
./stop.sh && ./start.sh
```

---

## Scripts Reference

| Script | What it does |
|--------|--------------|
| `./install.sh` | One-time setup. Installs all dependencies. |
| `./start.sh` | Starts Claude OS (backend, dashboard, Claude Code) |
| `./stop.sh` | Stops Claude OS |

### start.sh Options

```bash
./start.sh              # Normal start
./start.sh --no-browser # Don't open browser
./start.sh --no-claude  # Don't auto-start Claude Code
```

---

## Ports

| Service | Port | URL |
|---------|------|-----|
| Dashboard | 3000 | http://localhost:3000 |
| Backend API | 5001 | http://localhost:5001/api/health |

---

## Manual Setup (Advanced)

If you prefer to set things up manually or the scripts don't work:

<details>
<summary>Click to expand manual instructions</summary>

### Prerequisites

```bash
brew install python@3.11 node tmux
npm install -g @anthropic-ai/claude-code
```

### Python Environment

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Node Dependencies

```bash
cd Dashboard && npm install && cd ..
```

### Configuration

```bash
cp .env.example .env
cp .mcp.json.example .mcp.json
```

### Start Services

```bash
# Terminal 1: Backend
source venv/bin/activate
python .engine/src/main.py

# Terminal 2: Dashboard
cd Dashboard && npm run dev

# Terminal 3: Claude Code
claude
```

Or with tmux:

```bash
tmux new-session -s life -n backend -d
tmux send-keys -t life:backend 'source venv/bin/activate && python .engine/src/main.py' C-m
tmux new-window -t life -n dashboard
tmux send-keys -t life:dashboard 'cd Dashboard && npm run dev' C-m
tmux new-window -t life -n chief
tmux attach -t life
```

</details>

---

## Updating

```bash
git pull
./install.sh  # Re-run to catch new dependencies
./stop.sh && ./start.sh
```

---

## Uninstalling

```bash
./stop.sh
cd ..
rm -rf claude-os
```

To remove Homebrew packages installed for Claude OS:

```bash
brew uninstall python@3.11 node tmux  # Only if you don't need them
npm uninstall -g @anthropic-ai/claude-code
```
