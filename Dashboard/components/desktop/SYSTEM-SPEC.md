# Desktop System Specification

**Location:** `Dashboard/components/desktop/`  
**Purpose:** ClaudeOS desktop environment: macOS-inspired window manager  
**Last Updated:** Feb 2026

---

## Overview

The desktop folder implements a macOS-inspired desktop environment with windows, dock, menubar, icons, widgets, and file management.

```
desktop/
├── SYSTEM-SPEC.md         # This file
│
├── [Shell Components]     # Root = Desktop OS shell/chrome
│   ├── ClaudeOS.tsx       # Main orchestrator
│   ├── Dock.tsx           # macOS-style dock
│   ├── Menubar.tsx        # Top menu bar
│   ├── DesktopWindow.tsx  # Window chrome (title bar, resize, etc.)
│   ├── DesktopIcon.tsx    # Desktop file/folder icons
│   ├── DesktopIconPreview.tsx  # Icon drag preview
│   ├── DesktopWidget.tsx  # Widget container (legacy, see note below)
│   ├── DesktopWidgetRnd.tsx    # Resizable widget wrapper (legacy, see note below)
│   ├── ContextMenu.tsx    # Right-click menus
│   ├── QuickLook.tsx      # Space bar preview (macOS feature)
│   ├── GetInfoPanel.tsx   # File info panel (Cmd+I)
│   ├── PromptModal.tsx    # Text input modal
│   ├── ExplanationTooltip.tsx  # Help tooltips
│   └── TrashIcon.tsx      # Dock trash icon
│
├── apps/                  # Core desktop app CONTENT (branded as "Claude [AppName]")
│   ├── _template/         # Template for new core apps
│   ├── finder/            # Claude Finder - File browser
│   ├── calendar/          # Claude Calendar - Apple integration
│   ├── contacts/          # Claude Contacts - Apple integration
│   ├── email/             # Claude Mail - Apple integration
│   ├── messages/          # Claude Messages - iMessage integration
│   ├── missions/          # Claude Missions - Mission management
│   ├── roles/             # Claude Roles - Claude personas
│   ├── settings/          # Claude Settings - System settings
│   └── widgets-manager/   # Claude Widgets - Widget configuration
│
├── widgets/               # Widget content for menubar dropdowns
│   ├── CalendarWidgetContent.tsx   # Calendar widget content
│   ├── EmailWidgetContent.tsx      # Email triage widget content
│   └── PrioritiesWidgetContent.tsx # Priorities widget content
│
└── editors/               # File type editors
    ├── CodeEditor.tsx
    ├── MarkdownEditor.tsx
    ├── JsonEditor.tsx
    ├── CsvViewer.tsx
    ├── ImageViewer.tsx
    ├── PdfViewer.tsx
    ├── PlainTextEditor.tsx
    └── DocumentRouter.tsx
```

---

## Architecture

### Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│                      ClaudeOS.tsx                           │
│                    (Main Orchestrator)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────────────────────────────┐  │
│  │  Menubar    │  │          Desktop Area               │  │
│  └─────────────┘  │  ┌─────────┐  ┌──────────────────┐  │  │
│                   │  │ Icons   │  │ DesktopWindow    │  │  │
│                   │  │         │  │  ┌────────────┐  │  │  │
│                   │  │         │  │  │ apps/*     │  │  │  │
│                   │  │         │  │  │ (content)  │  │  │  │
│                   │  │         │  │  └────────────┘  │  │  │
│                   │  └─────────┘  └──────────────────┘  │  │
│                   │                                      │  │
│                   │  ┌────────────────────────────────┐  │  │
│                   │  │ DesktopWidget (widgets/*)     │  │  │
│                   │  └────────────────────────────────┘  │  │
│                   └─────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                      Dock                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Layer Separation

| Layer | Location | Purpose |
|-------|----------|---------|
| **Shell** | Root files | Window chrome, dock, menubar, icons |
| **App Content** | `apps/` | What renders inside windows |
| **Widget Content** | `widgets/` | What renders inside widgets |
| **File Editors** | `editors/` | Content for file viewing/editing |

---

## Shell Components (Root)

### ClaudeOS.tsx: Main Orchestrator

The central component that:
- Manages window state (via `windowStore`)
- Renders all shell components
- Handles desktop interactions (click, drag, context menu)
- Coordinates between dock, menubar, windows, icons

### Dock.tsx

macOS-style dock with:
- Magnification on hover (RAF-throttled)
- Running app indicators
- Minimized window thumbnails
- Session indicators

### Menubar.tsx

Top menu bar with three sections:

**Left:** Claude logo (orange, opens About dialog) + active app name + Claude status text.

**Center:** Three widget dropdowns with inline indicators:
- Calendar (red icon): inline label showing `Now: Event (Xm left)` or `Next: Event: HH:MM AM`
- Priorities (amber icon): inline text showing `N left` or green `N/N` when all complete
- Email (blue icon): inline badge with unread count (hidden at inbox zero)

Each icon opens a dropdown with full widget content (CalendarWidgetContent, PrioritiesWidgetContent, EmailWidgetContent).

**Right:** Dark mode toggle, connection status, usage battery, clock.

### DesktopWindow.tsx

Window chrome providing:
- Title bar with traffic lights (close/minimize/maximize)
- Draggable, resizable
- Focus management
- Renders app content from `apps/`

### ContextMenu.tsx

Right-click context menus for:
- Desktop background
- Icons
- Windows
- Dock items

### QuickLook.tsx

macOS Quick Look (spacebar preview) for files.

### Others

- `DesktopIcon.tsx`: File/folder icons on desktop
- `DesktopWidget.tsx`: Widget container (legacy, see Widget Content section)
- `DesktopWidgetRnd.tsx`: Resizable widget wrapper (legacy)
- `GetInfoPanel.tsx`: File info (Cmd+I)
- `PromptModal.tsx`: Text input dialogs
- `TrashIcon.tsx`: Trash in dock

---

## App Content (`apps/`)

Each core app has a folder with its window content:

```
apps/[appname]/
├── [AppName]WindowContent.tsx   # Main component
├── [AppName]SettingsPanel.tsx   # Optional settings
└── [OtherViews].tsx             # Additional views
```

### Current Core Apps

| App | Branded Name | Files | Purpose |
|-----|--------------|-------|---------|
| `finder` | Claude Finder | FinderWindowContent | File browser |
| `calendar` | Claude Calendar | WindowContent, CalendarView | Calendar with Apple integration |
| `contacts` | Claude Contacts | WindowContent, SettingsPanel | Contacts with Apple integration |
| `email` | Claude Mail | WindowContent, SettingsPanel | Email with Apple integration |
| `messages` | Claude Messages | MessagesWindowContent | iMessage with Apple integration |
| `missions` | Claude Missions | MissionsWindowContent | Mission management |
| `roles` | Claude Roles | RolesWindow | Claude personas |
| `settings` | Claude Settings | SettingsWindowContent | System settings |
| `widgets-manager` | Claude Widgets | WidgetsWindowContent | Menubar widget configuration |
| `analytics` | Observatory | ObservatoryWindowContent | Session, tool, and specialist analytics |

### Adding a New Core App

1. Copy `apps/_template/`
2. Rename to `apps/[appname]/`
3. Create `[AppName]WindowContent.tsx`
4. Add to `CoreAppType` in `store/windowStore.ts`
5. Import in `ClaudeOS.tsx`
6. Add dock icon in `Dock.tsx`

---

## Widget Content (`widgets/`)

**Note:** Widgets have been moved from floating desktop panels to menubar dropdowns. The `DesktopWidget.tsx` and `DesktopWidgetRnd.tsx` files remain but are no longer used. Widgets now render as dropdown menus from center menubar icons via `WidgetDropdown` in `Menubar.tsx`.

| Content Component | Purpose | Location | Inline Indicator |
|-------------------|---------|----------|-----------------|
| `CalendarWidgetContent` | Today's events | Menubar dropdown | Current/next event text |
| `PrioritiesWidgetContent` | Priority queue | Menubar dropdown | Remaining/completion count |
| `EmailWidgetContent` | Email triage | Menubar dropdown | Unread count badge |

Widget icons are color-coded to match their dock app colors (calendar=red, priorities=amber, email=blue). Inline indicators show at-a-glance data next to each icon without opening the dropdown. Components: `CalendarInlineLabel`, `PriorityBadge`, `EmailBadge` in Menubar.tsx.

The Claude Widgets app (`widgets-manager/`) now manages which widgets appear in the menubar rather than configuring floating desktop widgets.

---

## File Editors (`editors/`)

Render file content based on type:

| Editor | File Types |
|--------|------------|
| `CodeEditor` | .ts, .tsx, .js, .py, .json, etc. |
| `MarkdownEditor` | .md |
| `JsonEditor` | .json (structured view) |
| `CsvViewer` | .csv |
| `ImageViewer` | .png, .jpg, .gif, etc. |
| `PdfViewer` | .pdf |
| `PlainTextEditor` | .txt, unknown |

`DocumentRouter.tsx` routes to the appropriate editor.

---

## State Management

Desktop state lives in `store/windowStore.ts`:

- `windows`: Open window list
- `windowStack`: Z-order
- `iconOrder`: Desktop icon ordering (CSS Grid auto-fills positions)
- `widgets`: Floating widget positions/sizes (legacy)
- `menubarWidgets`: Set of enabled menubar widgets ('priorities', 'calendar', 'sessions')
- `selectedIcons`: Multi-select
- `quickLookPath`: Quick Look target

Use selectors (not full store subscription):

```typescript
import { useWindows, useWindowActions } from '@/store/windowStore';

const windows = useWindows();
const { openWindow, closeWindow } = useWindowActions();
```

---

## Best Practices

### DO

- Keep shell components at root
- Put app content in `apps/[appname]/`
- Use `windowStore` selectors
- Follow macOS UX patterns

### DON'T

- Put content components at root
- Create new shell layers
- Subscribe to entire windowStore
- Break the shell/content separation

---

*Spec created Jan 2026*

