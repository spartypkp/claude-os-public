# Claude OS

An open-source personal operating system where Claude Code manages your calendar, contacts, email, goals, and projects. Multiple Claude instances collaborate as a team: a Chief orchestrates your day, Specialists handle focused tasks, and Subagents run in the background. Context persists across conversations through markdown files that both you and Claude can read and edit.

Created by [@spartypkp](https://github.com/spartypkp). Built with [Claude Code](https://claude.ai/claude-code).

---

## Quickstart

```bash
curl -fsSL https://raw.githubusercontent.com/spartypkp/claude-os-public/main/get-started.sh | bash
```

Read the [What the setup script does](#what-the-setup-script-does) section before running this. The script won't ask you any questions when run this way. If it fails partway through, it's safe to re-run since it skips already-completed steps.

Requirements: macOS 12+, git, and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (signed in). Python 3.11+, Node.js 18+, and tmux are installed automatically if missing.

---

## What Is This?

The system is a folder of files. Specs describe your goals. Memory files track patterns. Claude reads and writes these files to persist context across sessions. There's no database of memories, just markdown that you can inspect and edit directly.

The Dashboard is a macOS-style desktop UI (localhost:3000) that provides a visual interface to the files. Claude works in the filesystem; the Dashboard is a view, not a replacement.

### The Team

```
You
 └── Chief (daily orchestrator, always running)
      ├── Builder (code, infrastructure, debugging)
      ├── Writer (documents, analysis, sustained focus)
      ├── Researcher (investigations, synthesis)
      ├── Idea (brainstorming, design, planning)
      ├── Curator (audits, organization, accuracy)
      ├── Project (external codebases)
      └── Subagents (background tasks, parallel research)
```

Chief runs all day in your terminal. It manages priorities, spawns specialists, and keeps files accurate.

Specialists spawn for focused work. They run a 3-phase loop (Preparation, Implementation, Verification) then close. Chief spawns them, or you can open them from the Dashboard.

Subagents run in the background for research, testing, and exploration. Any role can spawn them.

### Persistent Memory

Four files load at every session start:

| File | Purpose |
|------|---------|
| `TODAY.md` | Daily schedule, priorities, timeline |
| `MEMORY.md` | Long-term patterns, preferences, observations |
| `IDENTITY.md` | Facts about you, values, how you work |
| `SYSTEM-INDEX.md` | System index of domains, apps, integrations |

Claude maintains these in real time. Events get logged, patterns get documented, stale info gets corrected.

---

## What the Setup Script Does

The `get-started.sh` script makes the following changes to your system:

1. Clones the repo to `~/claude-os/` (or a custom path you pass as an argument)
2. Installs Homebrew packages if missing: Python 3.11, Node.js, tmux, MesloLGS Nerd Font
3. Creates a Python virtual environment inside the repo and installs Python dependencies, including libraries for accessing macOS Calendar, Contacts, and Mail
4. Installs JavaScript dependencies for the Dashboard (Next.js)
5. Creates a SQLite database at `.engine/data/db/system.db`
6. Disconnects from the public GitHub repo so you don't accidentally push personal data back to it. If you have the [GitHub CLI](https://cli.github.com/) installed and run the script directly (not with the `curl` command above), it will ask if you want to create a private repo for backup. With the `curl` quickstart, this step is skipped automatically.
7. Starts a tmux session named `life` with three windows: backend (FastAPI on :5001), dashboard (Next.js on :3000), and chief (a Claude Code process)
8. Opens `http://localhost:3000` in your browser
9. Opens a new Terminal window attached to the tmux session

It does NOT modify your shell config, install any background services, or schedule anything outside the project folder. Everything lives inside `~/claude-os/`. The Claude Code hooks only activate when you run Claude Code from that directory.

macOS may prompt for permission to access Mail, Calendar, or Contacts during or after setup.

### Where to Run This

Running this on your primary machine means background processes on ports 3000 and 5001, and macOS permission prompts for Mail/Calendar/Contacts. The system is self-contained in `~/claude-os/` and doesn't touch system config files, but if you want isolation:

- A dedicated macOS user account is the simplest option. Full Apple API access, easy to delete the whole account later.
- A macOS VM (e.g. UTM) also works for full isolation.
- A Linux VM will not work. The Apple integrations (Calendar, Contacts, Mail) require macOS.

---

## Stopping and Removing

Stop all services:

```bash
cd ~/claude-os && ./restart.sh --stop
```

If something is still running after that (e.g. you closed the terminal without stopping first):

```bash
tmux kill-session -t life 2>/dev/null
lsof -ti :5001 -ti :3000 | xargs kill 2>/dev/null
```

To fully remove:

```bash
rm -rf ~/claude-os
rm -rf ~/.claude/projects/-Users-$USER-claude-os/
```

This removes all Claude OS files and Claude Code's project reference. Homebrew packages installed by the script (tmux, python, node, font-meslo-lg-nerd-font) will remain on your system.

---

## Features

### Native Integrations

Connects to macOS tools through Apple's native APIs:

- Calendar: read, create, update events (Apple Calendar)
- Contacts: search, create, update contacts
- Email: read inbox, draft and send messages
- Messages: read and send iMessages (restricted by default)

### Custom Applications

Build apps by writing a spec:

1. Describe what you want in an `APP-SPEC.md`
2. Claude generates the backend, database, MCP tools, and Dashboard UI
3. Your app appears as a fullscreen route in the Dashboard

### Scheduling

A cron scheduler runs automated tasks defined in `SCHEDULE.md`:

- Inject: send messages into Claude sessions on a schedule
- Spawn: launch specialists automatically (morning reset, checkups)
- Exec: run Python functions (database vacuum, log rotation)

### Dashboard

A macOS-style desktop environment on localhost:3000:

- Desktop with file icons, folder navigation, wallpaper
- Dock with color-coded app icons
- Top bar with calendar, priorities, email triage, connection status
- ClaudePanel for live conversation transcripts and specialist spawning
- Core apps: Finder, Calendar, Contacts, Mail, Messages, Settings
- Custom apps: fullscreen routes built from specs

### Skills

Reusable workflow prompts:

- `/setup`: onboarding for new users
- `/morning-reset`: archive yesterday, prepare today's brief
- `/evening-checkin`: recap the day, sync memory, plan tomorrow
- `/temporal-parliament`: resolve decisions where present and future self disagree
- `/build-app`: guided custom app creation

---

## Architecture

```
┌──────────────────────────────────┐
│          Dashboard (Next.js)     │  ← localhost:3000
│   Desktop · Apps · ClaudePanel   │
└──────────────┬───────────────────┘
               │ HTTP/SSE
┌──────────────┴───────────────────┐
│         Backend (FastAPI)        │  ← localhost:5001
│  Sessions · Calendar · Email     │
│  Contacts · Messages · Schedule  │
└──────────────┬───────────────────┘
               │
┌──────────────┴───────────────────┐
│         Claude Code (tmux)       │
│  Chief · Specialists · Agents    │
│  MCP Server · Hooks · Skills     │
└──────────────────────────────────┘
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `Desktop/` | User-facing files, domain specs, app specs |
| `.engine/src/` | Backend modules, core logic, adapters |
| `Dashboard/` | Next.js frontend |
| `.claude/roles/` | Role definitions (Chief, Builder, Writer, etc.) |
| `.claude/skills/` | Workflow prompts |
| `.claude/hooks/` | Session lifecycle hooks |
| `.claude/test/` | Playwright smoke tests |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Operating manual, principles, how Claude works |
| `.claude/roles/` | Role definitions for each specialist |
| `.claude/skills/` | Workflow prompts and automations |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Areas where help is appreciated:

- Cross-platform support (Linux, Windows)
- Additional providers (Google Calendar, Outlook, Android messages)
- Documentation and guides
- Bug fixes (see GitHub issues)

---

## License

MIT. See [LICENSE](LICENSE).

---

Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.
