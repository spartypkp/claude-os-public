# Contributing to Claude OS

Thanks for your interest in contributing! This project is an experiment in using Claude as an operating system for life management. We welcome contributions of all kinds.

---

## Ways to Contribute

**Bug Reports** — Found something broken? Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, Python version)

**Feature Requests** — Have an idea? Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Alternative approaches you considered

**Code Contributions** — Ready to build? See the development setup below.

**Documentation** — Spotted a typo? Unclear instructions? Documentation PRs are always welcome.

---

## Development Setup

1. **Install prerequisites**
   - Node.js 18+
   - Python 3.11+
   - tmux

2. **Clone and install**
   ```bash
   git clone https://github.com/spartypkp/claude-os.git
   cd claude-os

   # Backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

   # Dashboard
   cd Dashboard
   npm install
   ```

3. **Start services**
   ```bash
   # Terminal 1: Backend
   ./venv/bin/python .engine/src/main.py

   # Terminal 2: Dashboard
   cd Dashboard && npm run dev
   ```

4. **Verify setup**
   - Dashboard: http://localhost:3000
   - Backend API: http://localhost:5001

See `SETUP.md` for detailed installation instructions.

---

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/your-feature`
3. **Make your changes** following the code guidelines below
4. **Test locally** — verify the Dashboard loads and backend responds
5. **Commit** with clear messages: `Fix calendar event creation bug`
6. **Push** to your fork
7. **Open a PR** with:
   - Clear description of what changed
   - Why the change was needed
   - How to test it

---

## Code Guidelines

### TypeScript (Dashboard)

- Follow existing patterns in `Dashboard/`
- Use functional components with hooks
- Tailwind CSS for styling
- React Query for data fetching
- Zustand for state management

### Python (Backend)

- Follow existing patterns in `.engine/`
- FastAPI for API routes
- Type hints on function signatures
- SQLite for data persistence
- MCP tools for Claude integration

### General

- **No unused imports** — Clean up before committing
- **Descriptive names** — `fetchCalendarEvents` not `getData`
- **Comments for why, not what** — Code should be self-documenting
- **Small, focused PRs** — One feature or fix per PR

---

## Architecture Overview

Claude OS has three main layers:

```
Dashboard/           → Next.js frontend (what users see)
.engine/             → Python backend (services, API, database)
.claude/             → Claude configuration (roles, hooks, settings)
Desktop/             → User files (specs, memory, documents)
```

For detailed architecture documentation, see `CLAUDE.md`.

**Key concepts:**
- **Roles** — Different Claude personalities (Chief, Builder, etc.)
- **Hooks** — Session lifecycle management
- **MCP Tools** — How Claude interacts with the system
- **Specs** — Markdown files that define goals and applications

---

## Community Guidelines

- **Be respectful** — We're all here to learn and build
- **Be patient** — Maintainers review PRs as time allows
- **Be helpful** — Answer questions when you can
- **Ask questions** — Use GitHub Discussions for help

---

## Questions?

- **GitHub Issues** — Bug reports and feature requests
- **GitHub Discussions** — General questions and ideas
- **CLAUDE.md** — Detailed system documentation

Thanks for contributing!
