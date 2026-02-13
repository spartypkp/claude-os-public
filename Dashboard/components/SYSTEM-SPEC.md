# Components System Specification

**Location:** `Dashboard/components/`  
**Purpose:** Semantically organized React components  
**Last Updated:** Jan 2026

---

## Overview

Components are organized by domain and purpose:

```
components/
├── core/           # Core infrastructure (shell, providers, layout)
├── shared/         # Reusable UI primitives
├── desktop/        # Desktop OS + core apps
├── claude/         # Claude Panel (ClaudePanel/)
├── transcript/     # Transcript viewer + tool renderers
├── activity/       # Task/session activity views
├── system/         # System tab views
└── context/        # React contexts
```

---

## Folder Purposes

### `/core` — Core Infrastructure

**Purpose:** App shell, providers, global components.

| File | Purpose |
|------|---------|
| `Providers.tsx` | React Query, contexts |
| `AppShell.tsx` | Main app layout with panels |
| `ApplicationShell.tsx` | Custom app wrapper |
| `AppLayout.tsx` | Custom app layout |
| `ErrorBoundary.tsx` | Error handling |
| `CommandPalette.tsx` | Global command palette |
| `Sidebar.tsx` | App sidebar navigation |
| `HudPanel.tsx`, `HudCard.tsx` | HUD display |
| `toast-provider.tsx` | Toast notifications |

### `/shared` — Reusable UI

**Purpose:** Components used across multiple domains.

| File | Purpose |
|------|---------|
| `ui/` | shadcn/ui primitives |
| `icons/` | Custom icon components |
| `FileViewer.tsx` | Generic file viewer |
| `MarkdownWindow.tsx` | Markdown file display |
| `MermaidRenderer.tsx` | Mermaid diagram renderer |
| `StructuredOutputViewer.tsx` | Task output display |
| `WorkerInlineCard.tsx` | Inline task card |
| `BlueprintAccordion.tsx` | Accordion for app lists |
| `ThemeToggle.tsx` | Dark/light toggle |

### `/desktop` — Desktop OS

**Purpose:** ClaudeOS desktop environment.

```
desktop/
├── ClaudeOS.tsx       # Main desktop component
├── Dock.tsx           # macOS-style dock
├── Menubar.tsx        # Top menu bar
├── DesktopIcon.tsx    # Desktop icons
├── DesktopWindow.tsx  # Window chrome
├── ContextMenu.tsx    # Right-click menu
├── QuickLook.tsx      # Quick preview
│
├── editors/           # File type editors
│   ├── CodeEditor.tsx
│   ├── MarkdownEditor.tsx
│   └── ...
│
├── widgets/           # Desktop widgets
│   ├── CalendarWidget.tsx
│   └── PrioritiesWidget.tsx
│
└── apps/              # CORE DESKTOP APPS
    ├── _template/     # Template for new core app
    ├── finder/        # File browser
    ├── calendar/      # Calendar (Apple integration)
    ├── contacts/      # Contacts (Apple integration)
    ├── email/         # Email (Apple integration)
    ├── missions/      # Missions manager
    ├── roles/         # Roles/personas
    ├── settings/      # System settings
    └── widgets-manager/  # Widget configuration
```

### `/ClaudePanel` — Claude Panel

**Purpose:** Claude chat interface.

See `ClaudePanel/SYSTEM-SPEC.md` for details.

### `/transcript` — Transcript Viewer

**Purpose:** Render Claude conversation turns and tool calls.

See `transcript/tools/SYSTEM-SPEC.md` for tool renderer details.

### `/activity` — Activity Views

**Purpose:** Task and session activity displays.

| File | Purpose |
|------|---------|
| `ActivityTodayView.tsx` | Today's activity feed |
| `ActivitySessionCard.tsx` | Session summary card |
| `ActivityWorkerRow.tsx` | Task list row |
| `ActivityWorkerDetail.tsx` | Task detail view |

### `/system` — System Tab Views

**Purpose:** System panel tab content.

| File | Purpose |
|------|---------|
| `HealthTab.tsx` | System health status |
| `MetricsTab.tsx` | Performance metrics |
| `ConfigTab.tsx` | Configuration |
| `DocsTab.tsx` | Documentation |

### `/context` — React Contexts

**Purpose:** Shared state contexts.

| File | Purpose |
|------|---------|
| `ChatPanelContext.tsx` | Chat panel state |
| `HudContext.tsx` | HUD state |

---

## Adding New Components

### New Core Desktop App

1. Copy `desktop/apps/_template/`
2. Create `desktop/apps/[appname]/[AppName]WindowContent.tsx`
3. Add to `windowStore.ts` `CoreAppType`
4. Register in `ClaudeOS.tsx` imports
5. Add icon to `Dock.tsx`

### New Custom App Component

Custom apps keep their components within `app/[app-name]/`:

```
app/my-app/
├── page.tsx
├── components/       # App-specific components
│   ├── MainView.tsx
│   └── DetailCard.tsx
└── ...
```

**NOT** in `components/` — custom app UI stays with the app.

### New Transcript Tool View

See `transcript/tools/SYSTEM-SPEC.md`.

### New Shared Component

Add to `shared/` if:
- Used by 2+ domains
- Generic/reusable
- No app-specific logic

---

## Import Conventions

```typescript
// Core infrastructure
import { Providers } from '@/components/core/Providers';
import { AppShell } from '@/components/core/AppShell';

// Shared UI
import { FileViewer } from '@/components/shared/FileViewer';
import { TaskInlineCard } from '@/components/shared/WorkerInlineCard';

// Desktop components
import { Dock } from '@/components/desktop/Dock';
import { FinderWindowContent } from '@/components/desktop/apps/finder/FinderWindowContent';

// Transcript
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';

// Activity
import { ActivityTodayView } from '@/components/activity/ActivityTodayView';
```

---

*Spec created Jan 2026*

