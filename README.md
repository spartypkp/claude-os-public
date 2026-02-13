# Claude OS

**Your life, managed by Claude.**

Claude OS is an open-source personal operating system where Claude manages your entire life — calendar, contacts, email, goals, projects, and everything in between. Multiple Claude instances collaborate as a team: a Chief orchestrates your day, Specialists handle focused work, and Subagents run in the background. Everything persists in files, so Claude remembers across conversations, days, and weeks.

*Created by [@spartypkp](https://github.com/spartypkp). Built entirely with [Claude Code](https://claude.ai/claude-code).*

---

## Quickstart

```bash
curl -fsSL https://raw.githubusercontent.com/spartypkp/claude-os/main/get-started.sh | bash
```

This clones the repo, installs dependencies, sets up the database, starts services, and launches Claude Code with the `/setup` onboarding conversation.

**Requirements:** macOS 12+, Python 3.11+, Node.js 18+, [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), Anthropic API key.

---

## What Is This?

Most AI assistants forget everything between conversations. Claude OS doesn't.

The system is a folder of files. Specifications describe your goals. Memory files track patterns. Claude reads these files, writes to them, and persists context across every session. There's no database of "memories" — just markdown files that both you and Claude can read and edit.

You get a Dashboard — a macOS-style desktop with windows, a dock, and apps. But the Dashboard is a view into the files, not a replacement for them. Claude works in the filesystem. You see the results however you prefer.

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

**Chief** runs all day in your terminal. Manages priorities, redirects when you drift, spawns specialists, and keeps files accurate.

**Specialists** spawn for focused work. They execute a 3-phase loop — Preparation, Implementation, Verification — then close. Chief spawns them, you can also open them interactively from the Dashboard.

**Subagents** run in the background for research, testing, and exploration. Any role can spawn them.

### Persistent Memory

Four files load at every session start:

| File | What It Provides |
|------|-----------------|
| `TODAY.md` | Daily memory — schedule, priorities, timeline |
| `MEMORY.md` | Long-term patterns, preferences, observations |
| `IDENTITY.md` | Who you are — facts, values, how you work |
| `SYSTEM-INDEX.md` | System index — domains, apps, integrations |

Claude maintains these in real time. When something happens, it gets logged. When a pattern emerges, it gets documented. When a file is wrong, it gets fixed.

---

## Features

### Native Integrations

Claude OS connects to your existing tools through Apple's native APIs:

- **Calendar** — Read, create, update events (Apple Calendar)
- **Contacts** — Search, create, update, enrich contacts
- **Email** — Read inbox, draft messages, send with safeguards
- **Messages** — Read and send iMessages (restricted by default)

### Custom Applications

Build purpose-specific apps by writing a spec:

1. Describe what you want in an `APP-SPEC.md`
2. Claude generates the backend, database, MCP tools, and Dashboard UI
3. Your app appears as a fullscreen route in the Dashboard

### Scheduling

A cron scheduler runs automated tasks from `SCHEDULE.md`:

- **Inject** — Send messages into Claude sessions on a schedule
- **Spawn** — Launch specialists automatically (morning reset, checkups)
- **Exec** — Run Python functions (database vacuum, log rotation)

### The Dashboard

A macOS-style desktop environment running on localhost:

- **Desktop** — File icons, folder navigation, wallpaper
- **Dock** — Color-coded app icons with hover magnification
- **Top Bar** — Calendar widget, priorities widget, email triage, battery, connection status
- **ClaudePanel** — Live conversation transcript, tool visualization, specialist spawn
- **Core Apps** — Finder, Calendar, Contacts, Mail, Messages, Settings
- **Custom Apps** — Purpose-built fullscreen applications

### Skills

Reusable workflow prompts that Claude can invoke:

- `/setup` — Onboarding conversation for new users
- `/morning-reset` — Archive yesterday, prepare today's brief
- `/evening-checkin` — Recap the day, sync memory, plan tomorrow
- `/temporal-parliament` — Resolve decisions where present and future self disagree
- `/build-app` — Guided custom app creation

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
| `Desktop/` | Your visible world — files, domains, apps |
| `.engine/src/` | Backend — modules, core, adapters |
| `Dashboard/` | Frontend — Next.js app |
| `.claude/roles/` | Role definitions (Chief, Builder, Writer, etc.) |
| `.claude/skills/` | Workflow prompts |
| `.claude/hooks/` | Session lifecycle hooks |
| `.claude/test/` | Playwright smoke tests |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Operating manual — the relationship, principles, how Claude works |
| `.claude/roles/` | Role definitions for each specialist |
| `.claude/skills/` | Workflow prompts and automations |

---

## Contributing

Contributions welcome! Areas where help is appreciated:

- **Cross-platform support** — Linux, Windows (currently macOS-only)
- **Additional providers** — Google Calendar, Outlook, Android messages
- **Documentation** — Guides, tutorials, examples
- **Bug fixes** — See issues on GitHub

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.
