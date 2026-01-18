# Claude OS

**Your life, managed by Claude.**

*Created by [@spartypkp](https://github.com/spartypkp)*

Claude OS is an open-source personal operating system where Claude manages your entire life — calendar, contacts, goals, projects, job search, health, finances. Everything lives in one place, and Claude is the intelligent layer that makes it useful.

---

## What Makes This Different

Most AI assistants forget everything between conversations. Claude OS doesn't.

The system is simple: a folder of files. Specifications describe what you want. Memory files track what's happening. Claude reads these files, writes to these files, and remembers across conversations because the files persist.

You talk to Claude about what you need. Claude figures out what to read, what to update, and what to do.

There's also a Dashboard — a macOS-style desktop environment that displays the same information visually. Icons, windows, applications. But the Dashboard is a view into the files, not a replacement for them. Claude works in the files. You see the results however you prefer.

---

## Key Features

### Persistent Memory

Claude remembers. Not through magic — through files.

- **TODAY.md** — Daily memory: schedule, priorities, what happened today
- **MEMORY.md** — Persistent memory: patterns proven over time
- **IDENTITY.md** — Who you are: facts, values, how you work
- **SYSTEM-INDEX.md** — System index: domains, apps, connected accounts

These files load automatically at the start of every session. Your context persists across conversations, across days, across weeks.

### The Team

Multiple Claude instances work together:

```
You (Principal)
    ↓
Chief (orchestrator, daily partner)
    ↓ manages
Specialists (focused work)
    ↓ any can spawn
Subagents (background tasks)
```

**Chief** runs all day. Orchestrates, redirects, protects your focus.

**Specialists** spawn for specific work — Builder for code, Deep Work for research, Idea for brainstorming. They execute a 3-phase loop (Preparation → Implementation → Verification) autonomously and close when complete.

**Subagents** run in the background. Any role can spawn them for research, exploration, testing, or anything that produces verbose output or needs parallel execution.

### Custom Applications

Build purpose-specific apps for your life domains:

- **Job Search** — Pipeline management, interview prep, opportunity tracking
- **Any domain** — Write an APP-SPEC.md, Claude builds the rest

Custom apps include backend services, database tables, MCP tools, and Dashboard UI — all generated from a specification document.

### Native Integrations

Claude OS connects to your existing tools:

- **Calendar** — Read, create, update events across Apple Calendar
- **Contacts** — Unified contact management with Apple Contacts
- **Email** — Read inbox, draft messages, send (with safeguards)
- **Messages** — Read and send iMessages

### The Dashboard

A macOS-style desktop environment:

- **Finder** — Browse your Desktop/ files
- **Calendar** — Week/day/month views
- **Widgets** — Priorities, calendar, active sessions at a glance
- **Windows** — Native feel with traffic lights, dragging, resizing


---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/spartypkp/claude-os.git
cd claude-os

# Follow the setup guide
# See SETUP.md for complete instructions
```

**Requirements:**
- macOS (Apple Calendar, Contacts, Messages integration)
- Python 3.11+
- Node.js 18+
- Claude API key (Anthropic)
- Claude Code CLI

For detailed installation instructions, see [SETUP.md](SETUP.md).

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     YOU (Principal)                          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────┐  ┌──────────────┐  ┌─────────────┐
     │   Chief     │  │  Specialist  │  │   Mission   │
     │  (daily)    │  │  (3-phase    │  │ (scheduled) │
     │             │  │   loop)      │  │             │
     └─────────────┘  └──────────────┘  └─────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    ┌──────────────────┐
                    │   Subagents      │
                    │  (background)    │
                    │  (concurrent)    │
                    └──────────────────┘
```

### The Filesystem

**Desktop/** — Your visible world. Everything here appears in the Dashboard.

- `TODAY.md` — Daily memory and schedule
- `MEMORY.md` — Persistent memory across days
- `IDENTITY.md` — Your personal context
- `SYSTEM-INDEX.md` — Auto-generated system index
- Domain folders (`career/`, `health/`, `projects/`) — Each with a `LIFE-SPEC.md`

**.engine/** — Backend infrastructure. Services, database, MCP server.

**Dashboard/** — Next.js frontend. The visual interface.

**.claude/** — Claude configuration. Roles, hooks, guides, missions.

### How Sessions Work

Claude runs in tmux — a terminal multiplexer that keeps sessions alive.

```
tmux session: "life"
├── Window: backend   ← FastAPI server
├── Window: dashboard ← Next.js dev server
├── Window: chief     ← Chief of Staff Claude
└── Windows: specialists (come and go)
```

Chief persists all day. Specialists spawn for focused tasks and close when done (after executing a 3-phase Preparation → Implementation → Verification loop). Subagents run silently in the background for research, testing, and other tasks.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Operating manual — how Claude works in this system |
| [SETUP.md](SETUP.md) | Installation and configuration guide |
| `.claude/skills/` | Specialized capabilities (Leetcode practice, file import, mission creation, etc.) |
| `.claude/roles/` | Role definitions (Chief, Builder, Deep Work, Idea, Project) |
| `.engine/SYSTEM-SPEC.md` | Backend architecture |
| `Dashboard/SYSTEM-SPEC.md` | Frontend architecture |

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Areas where help is appreciated:**
- Cross-platform support (Linux, Windows)
- Additional calendar/contact providers (Google, Outlook)
- Documentation improvements
- Bug fixes and performance improvements

---

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| macOS | 12+ | Required for Apple integrations |
| Python | 3.11+ | Backend services |
| Node.js | 18+ | Dashboard |
| Claude API | — | Anthropic API key required |
| Claude Code | Latest | CLI tool from Anthropic |

**Optional:**
- Gmail API credentials (for Gmail integration)
- Additional calendar providers

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

Created and maintained by [@spartypkp](https://github.com/spartypkp).

This project started as an experiment: what if Claude could actually manage my life? After months of daily use — Claude handling my calendar, tracking job applications, preparing for interviews, remembering context across hundreds of conversations — it became something real. An operating system that learns.

Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.

---

**Questions?** Open an issue on GitHub.

**Want to contribute?** See [CONTRIBUTING.md](CONTRIBUTING.md).
