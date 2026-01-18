---
description: "Next.js dashboard portal for the life system. Visual workspace with dynamic Claude activity tracking, memory visualization, and keyboard-first UX."
---

# Life System Portal

The visual workspace for the life system. Monitor 2 to Claude Code's Monitor 1.

---

## Philosophy

**Two monitors, one system:**
- Monitor 1: Claude Code - where conversation happens, where edits happen
- Monitor 2: This portal - Claude's visual workspace

This isn't just a dashboard. It's the **shared surface** between you and your chief of staff. Claude writes to Desktop/, you see it here. You browse your specs, Claude references the same files. The filesystem IS the interface.

**Claude is the OS** - Not an app. Not a tool. The operating system for your life. The desktop view IS macOS - familiar dock, menubar, windows, widgets.

**Desktop-first** - The `/desktop` route is a full macOS-style experience. No sidebar. Just menubar, dock, desktop icons, windows, and widgets.

---

## Quick Reference

### Routes

| Route | Purpose |
|-------|---------|
| `/desktop` | Full macOS desktop experience (flagship view) |
| `/desktop/[...path]` | File viewer for Desktop/ files |
| `/activity` | Today's sessions overview |
| `/activity/session/[id]` | Session detail with chat UI |
| `/job-search` | Custom App: Interview prep command center |
| `/job-search/*` | Leetcode, DS&A, Pipeline, Opportunities |
| `/system/health` | Backend status, database, scheduler |
| `/system/metrics` | Worker statistics |
| `/system/settings` | System configuration |
| `/system/docs` | System documentation browser |

### Core Apps (accessed via Desktop Dock windows, not routes)

| App | Window Content |
|-----|----------------|
| Finder | File browser for Desktop/ - Miller columns, list, icon views. Dynamic sidebar (applications/domains), system file protection, sorted folders-first |
| Calendar | Week/day/month views, event management |
| Missions | Mission management with prompt viewer |
| Contacts | Contact management |
| Widgets | Widget configuration |
| Settings | System settings |

### Data Flow

| Data | Source | API Endpoint |
|------|--------|--------------|
| Desktop files | Desktop/*.md | `/api/files/tree` |
| Priorities | SQLite | `/api/priorities` |
| Calendar | Apple Calendar | `/api/calendar/*` |
| Sessions | SQLite | `/api/system/activity` |
| Workers | SQLite | `/api/workers/*` |
| Missions | SQLite | `/api/missions` |
| Memory | today.md + memory.md | `/api/system/memory` |

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS + CSS variables
- **State**: React hooks + Zustand (windowStore)
- **Backend**: FastAPI (port 5001)
- **Database**: SQLite
- **Graphics**: WebGL (Claude Avatar)
- **Drag & Drop**: @dnd-kit/core with GPU-accelerated transforms

### Performance Notes

**Desktop Icon Dragging (optimized Jan 2026):**
- Grid cells match icon size (96x112px) to prevent overlap
- CSS transitions disabled during drag (only color transitions remain)
- Lightweight `DesktopIconPreview` component for DragOverlay (no logic, just visuals)
- GPU acceleration via `willChange: transform` hint
- `visibility: hidden` instead of opacity changes
- See `Workspace/working/desktop-ux-audit.md` for full analysis

---

## Architecture Overview

### Two Navigation Systems

**Desktop View (`/desktop`):**
- No sidebar - full-screen desktop
- Dock at bottom with app icons
- Menubar at top with time, API health, dark mode toggle
- Native desktop feel with windows, widgets, icons

**Traditional Views (other routes):**
- Sidebar on left (256px, collapsible)
- TopBar shows page title and calendar context
- Standard dashboard layout

### Core App Window Convention

Core Apps (Claude Finder, Claude Calendar, Claude Settings, Claude Contacts, Claude Widgets) follow a **window ↔ fullscreen pattern**:

1. Click dock icon → Opens as window on Desktop
2. Click green button → Navigate to fullscreen route
3. Click green button in fullscreen → Return to Desktop + window

Custom Apps (Job Search, etc.) always open as fullscreen routes.

### Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│                     WILL (Principal)                         │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │ Interactive │  │ Interactive │  │   Mission   │
     │   Claude    │  │   Claude    │  │   Claude    │
     │   (Chief)   │  │  (System)   │  │  (Memory)   │
     └─────────────┘  └─────────────┘  └─────────────┘
              │               │               │
              ▼               ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  Workers    │  │  Workers    │  │  Workers    │
     └─────────────┘  └─────────────┘  └─────────────┘
```

**The Portal mirrors this:**
- Static views = user content (Desktop, Calendar)
- Dynamic sidebar = Active Claude work (sessions + workers)
- Memory view = Claude's knowledge state
- Missions view = Scheduled autonomous work
- System views = Infrastructure health

---

## Implementation Status (Jan 2026)

### Complete

- [x] ClaudeOS / Desktop view - macOS-style with light/dark mode
- [x] Dock with magnification, sessions, separators
- [x] Core App window system (window ↔ fullscreen toggle)
- [x] All Core Apps: Claude Finder, Claude Calendar, Claude Settings, Claude Contacts, Claude Widgets
- [x] Custom Apps as fullscreen routes (Job Search)
- [x] Claude Panel with transcript, attachments, spawn
- [x] Activity Hub with session detail
- [x] Calendar view with drag-to-reschedule
- [x] Missions view with prompt viewer
- [x] Memory view (sprints, today, weekly, patterns)
- [x] Settings view (macOS aesthetic, model config)
- [x] Widget system (Priorities, Calendar, Sessions)
- [x] Context menus (right-click everything)
- [x] Theme system (light default, dark toggle)
- [x] HUD overlay
- [x] Claude Avatar (WebGL shader)
- [x] Keyboard navigation (vim-style)

### Removed

- Contacts view (access via Core App window)
- Email view (access via Apple Mail directly)
- `/workers` route (use Activity instead)
- `/specs` route (use Finder/Desktop windows)

### Future

- [ ] Real-time updates (WebSocket, currently polling)
- [ ] Custom Apps as windows (currently fullscreen-only)
- [ ] Drag files between Finder and Desktop

---

## Detailed Specifications

This SYSTEM-SPEC provides the overview. See these focused specs for details:

| Document | Contents |
|----------|----------|
| `specs/views.md` | Detailed view specifications (Desktop, Calendar, Activity, etc.) |
| `specs/shell.md` | Shell components (TopBar, Sidebar, Dock, Claude Panel, HUD) |
| `specs/design-system.md` | Visual design (typography, colors, spacing, patterns) |
| `specs/context-menu.md` | Context menu specifications for all targets |
| `specs/api-contract.md` | All API endpoints (request/response types) |

---

## Key Files

### Shell

| File | Purpose |
|------|---------|
| `components/AppShell.tsx` | Main shell wrapper |
| `components/desktop/ClaudeOS.tsx` | Desktop view container (96x112px grid) |
| `components/desktop/DesktopIcon.tsx` | Desktop icon component (no transitions when dragging) |
| `components/desktop/DesktopIconPreview.tsx` | Lightweight drag overlay (performance optimized) |
| `components/desktop/Dock.tsx` | Dock component |
| `components/desktop/Menubar.tsx` | Menubar component |
| `components/Sidebar.tsx` | Traditional sidebar |
| `components/ClaudePanel/` | Claude Panel components |

### State

| File | Purpose |
|------|---------|
| `store/windowStore.ts` | Window state, dark mode, context menu |
| `store/desktopStore.ts` | Desktop icons, widget positions |

### Hooks

| File | Purpose |
|------|---------|
| `hooks/useWorkers.ts` | Worker management |
| `hooks/useClaudeActivityState.ts` | Activity indicator |
| `hooks/useTranscriptStream.ts` | Transcript polling |
| `hooks/useTheme.ts` | Theme management |
| `hooks/useDesktopLayout.ts` | Desktop icon layout |

### Windows

| File | Purpose |
|------|---------|
| `components/desktop/DesktopWindow.tsx` | Window container with traffic lights |
| `components/desktop/windows/*.tsx` | Core App window content |
| `components/ApplicationShell.tsx` | Fullscreen app wrapper |
