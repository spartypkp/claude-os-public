# ClaudePanel System Specification

**Location:** `Dashboard/components/ClaudePanel/`  
**Purpose:** Main Claude conversation panel with session management, transcript display, and chat input  
**Last Updated:** Jan 2026

---

## Overview

ClaudePanel is the primary interface for interacting with Claude sessions. It displays:
- Session list (multiple sessions: Chief, System, Focus, etc.)
- Transcript viewer (conversation history with tool calls)
- Chat input with file attachments
- Activity indicators (thinking, tool use)
- Context warnings (high context usage)

---

## Architecture

```
ClaudePanel/
├── SYSTEM-SPEC.md              # This file
├── index.ts                    # Public exports
├── constants.ts                # Constants, configs, role mappings
│
├── ClaudePanel.tsx             # Main orchestrator (~560 lines)
├── ClaudeLogo.tsx              # Claude SVG logo component
├── EmptyState.tsx              # "BRB" empty state display
├── MinimizedView.tsx           # Collapsed vertical strip
├── InputArea.tsx               # Chat input + attachment pills
│
├── ChatInput.tsx               # Text input component
├── ConversationList.tsx        # Conversation tabs (~460 lines)
├── ConversationRow.tsx         # Individual conversation row
├── ChiefPopoutPanel.tsx        # Chief-specific popout panel
├── ClaudeActivityHeader.tsx    # Activity banner + ThinkingIndicator
├── ClaudeActivityIndicator.tsx # Activity state indicator
├── ContextWarningBanner.tsx    # Context warning display
├── TaskListPanel.tsx           # Task list display
│
└── hooks/
    ├── index.ts                # Hook exports
    ├── useAttachments.ts       # File attachment state & handlers
    ├── usePanelResize.ts       # Panel width resize logic
    └── useDragDrop.ts          # Drag & drop file handling
```

**Design Decision:** Components are kept flat (no subfolders) because they're tightly coupled to ClaudePanel and aren't reused elsewhere. The `hooks/` folder is the exception—hooks represent a distinct abstraction layer (stateful logic vs. UI).

---

## Data Flow

```
AppShell
    │
    └─► ClaudePanel (orchestrator)
            │
            ├─► usePanelResize       → Width state + localStorage
            ├─► useAttachments       → File state management
            ├─► useDragDrop          → File drop handling
            │
            ├─► ConversationList     → Conversation tabs
            │       └─► ConversationRow → Individual conversation
            │
            ├─► TranscriptViewer     → Conversation display (external)
            ├─► InputArea            → Chat input + attachments
            │       └─► ChatInput    → Text input
            │
            └─► MinimizedView        → Collapsed state
                (or) EmptyState      → No session state
```

---

## Component Responsibilities

### ClaudePanel.tsx (Orchestrator)
- Composes all subcomponents
- Manages panel state (visible, minimized, width)
- Session sync: URL params, auto-select Chief, session lifecycle
- Global keyboard handlers (Escape to interrupt)
- Message sending with attachments

### ClaudeLogo.tsx
- SVG Claude logo used in session icons
- Exported for reuse in MinimizedView

### EmptyState.tsx
- Fun "BRB" messages when no sessions (TV static effect)
- "Select a session" when sessions exist but none selected
- "Start Chief" button

### MinimizedView.tsx
- Vertical strip of session icons
- Click to expand and select session
- Activity indicators (green dot = active, blue = tool)
- Plus button for new specialists

### InputArea.tsx
- Attachment pills with size display
- Preview toggle and content display
- ChatInput wrapper
- Help text (Enter to send, Esc to stop)

### ConversationList.tsx
- Horizontal conversation tabs with icons
- Session actions dropdown (end, handoff, reset)
- Worker count badge
- Minimize button

### ConversationRow.tsx
- Individual conversation tab
- Role icon and color
- Activity state indicator
- Selection highlight

### ChiefPopoutPanel.tsx
- Chief-specific expanded panel
- Shows Chief conversation in popout mode
- Used when Chief is the active conversation

---

## Hooks

### useAttachments(options)
```ts
const {
  attachedFiles,      // AttachmentItem[]
  addAttachment,      // (path, imported?) => Promise
  removeAttachment,   // (path) => void
  togglePreview,      // (path) => Promise
  clearAttachments,   // () => void
  formatBytes,        // (bytes) => string
} = useAttachments({ sessionId });
```
- Listens for `attach-to-chat` and `remove-attachment` events
- Auto-clears on session change
- Handles file upload to Inbox with auto-rename

### usePanelResize()
```ts
const {
  panelWidth,   // number
  isResizing,   // boolean
  startResize,  // () => void
} = usePanelResize();
```
- Persists to localStorage
- Clamps to MIN/MAX bounds

### useDragDrop(options)
```ts
const {
  isDragOver,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFilePick,
} = useDragDrop({ onAttach, onError });
```
- External files → upload to Inbox first
- Internal paths → attach directly

---

## Constants (constants.ts)

```ts
// Panel dimensions
MIN_PANEL_WIDTH = 320
MAX_PANEL_WIDTH = 800
DEFAULT_PANEL_WIDTH = 440
MINIMIZED_PANEL_WIDTH = 52

// Storage
PANEL_WIDTH_KEY = 'claude-panel-width'

// File limits
MAX_PREVIEW_BYTES = 20000
MAX_PREVIEW_CHARS = 2000
INBOX_PATH = 'Inbox'

// API
API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'

// Configs
ROLE_NAMES: Record<string, string>
ROLE_ICONS: Record<string, RoleIconConfig>
BREAK_MESSAGES: BreakMessage[]
CLAUDE_LOGO_PATH: string  // SVG path data
```

---

## Session Roles

| Role | Icon | Color | Description |
|------|------|-------|-------------|
| chief | ClaudeLogo | #da7756 | Main orchestrator |
| builder | Code2 | blue | Custom Apps, infrastructure, debugging |
| deep-work | Target | green | Sustained complex tasks |
| project | Briefcase | purple | External codebases |
| idea | Lightbulb | yellow | Brainstorming, design, planning |

**Conversation Architecture:** Chief uses an "eternal" `conversation_id` of `"chief"` that persists across days, providing continuity for overnight missions and worker ownership. Specialists use unique conversation IDs per task.

---

## Features

### File Attachments
- Drag files from Finder → attach as context
- Drop external files → upload to Desktop/Inbox first
- Right-click for context menu (remove, preview)
- Preview shows first 2000 chars
- Sent as `[Attached Files]:\n@path/to/file` prefix

### Panel Resize
- Drag left edge to resize
- Width persisted to localStorage
- Min 320px, Max 800px, Default 440px

### Minimized Mode
- Click chevron to minimize → 52px vertical strip
- Shows session icons with activity dots
- Click icon to expand and select
- Plus button opens panel for new session

### URL Sync
- Conversation ID in URL: `?conversation=xxx`
- Refreshing restores selected conversation
- Deep linking to specific conversations (e.g., `?conversation=chief`)
- Auto-clears invalid conversation params

### Keyboard Shortcuts
- `Enter` — Send message
- `Shift+Enter` — Newline
- `Escape` — Interrupt session (when panel focused)

---

## Adding New Features

### Adding a new role
1. Add to `ROLE_NAMES` in `constants.ts`
2. Add icon config to `ROLE_ICONS` in `constants.ts`
3. Add to `MINIMIZED_ROLE_ICONS` in `MinimizedView.tsx`

### Adding attachment features
1. Update `useAttachments.ts` hook
2. Add UI in `InputArea.tsx`

### Adding panel sections
1. Create component in `ClaudePanel/`
2. Import in `ClaudePanel.tsx`
3. Add to render, gate with `!isMinimized && sessionId && ...`
4. Export from `index.ts` if needed externally

---

## External Dependencies

- `TranscriptViewer` — Renders conversation events
- `transcript/tools/` — Tool call rendering (see `tools/SYSTEM-SPEC.md`)
- `ChatPanelContext` — Global panel state (sessionId, visibility, openSession)
- `useClaudeSession` — SSE connection for transcript events
- `useClaudeActivity` — Session list from API
- `useChiefStatus` — Chief spawn/status

---

## Debugging

### Session not loading
```ts
// In ClaudePanel.tsx
console.log('Sessions:', activeSessions);
console.log('Selected:', sessionId, sessionRole);
console.log('ConversationId:', conversationId);
```

### Attachments not working
```ts
// In useAttachments.ts
console.log('Attached:', attachedFiles);
console.log('Adding:', path);
```

### Panel not resizing
- Check localStorage key: `claude-panel-width`
- Verify `startResize` is bound to resize handle
