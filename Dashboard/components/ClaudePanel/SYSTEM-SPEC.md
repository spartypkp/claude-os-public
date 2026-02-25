# ClaudePanel System Specification

**Location:** `Dashboard/components/ClaudePanel/`
**Purpose:** Main Claude conversation panel with session management, transcript display, and chat input
**Last Updated:** Feb 2026

---

## Overview

ClaudePanel is the primary interface for interacting with Claude sessions. It displays:
- Conversation tabs (multiple sessions: Chief, specialists, etc.)
- Transcript viewer (conversation history with tool calls, session boundaries)
- Chat input with file attachments and per-conversation draft persistence
- Activity indicators (thinking, tool use)
- Handoff progress (inline during session resets)
- Task list panel (Claude Code task tracking)

---

## Architecture

```
ClaudePanel/
├── SYSTEM-SPEC.md              # This file
├── index.ts                    # Public exports
├── constants.ts                # Constants, configs
│
├── ClaudePanel.tsx             # Main orchestrator
├── EmptyState.tsx              # "BRB" empty state display
├── MinimizedView.tsx           # Collapsed vertical strip
├── InputArea.tsx               # Chat input + attachment pills
│
├── ChatInput.tsx               # Text input with per-conversation draft persistence
├── ConversationList.tsx        # Conversation tabs with status bar + phase accents
├── ClaudeActivityHeader.tsx    # Active task banner
├── LifecycleToast.tsx          # Session lifecycle toast notifications
├── TaskListPanel.tsx           # Task list display (reads ~/.claude/tasks/)
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
            ├─► useHandoffState      → SSE handoff lifecycle per conversation
            │
            ├─► ConversationList     → Conversation tabs + status bar + phase accents
            │
            ├─► TranscriptViewer     → Conversation display (external)
            │       Uses: lib/systemMessages.ts for injection detection
            │       Uses: transcript/tools/ for tool chip rendering
            │
            ├─► InputArea            → Chat input + attachments
            │       └─► ChatInput    → Text input (drafts persist per conversation)
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
- Threads handoff state to ConversationList and TranscriptViewer

### EmptyState.tsx
- Fun "BRB" messages when no sessions (TV static effect)
- "Select a session" when sessions exist but none selected
- "Start Chief" button

### MinimizedView.tsx
- Vertical strip of session icons (uses `getRoleConfig()` from sessionUtils)
- Click to expand and select session
- Activity indicators (green dot = active, blue = tool)
- Plus button for new specialists

### InputArea.tsx
- Attachment pills with size display
- Preview toggle and content display
- ChatInput wrapper
- Help text (Enter to send, Esc to stop)

### ChatInput.tsx
- Text input with per-conversation draft persistence via localStorage
- Drafts keyed by sessionId, survive tab switches and page resets
- Cleared on send, flushed on cleanup

### ConversationList.tsx
- Horizontal conversation tabs with role icons
- Status bar showing handoff phase, interactive mode indicator
- Phase accent stripes on autonomous specialist tabs (colored by current phase)
- Session actions dropdown (end, handoff, reset)
- Minimize button

### ClaudeActivityHeader.tsx
- Active task banner (trimmed from original multi-component design)

### TaskListPanel.tsx
- Reads tasks from backend (`~/.claude/tasks/` format)
- Shows task items with status icons, IDs, owner badges, blocked indicators

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
API_BASE — re-exported from '@/lib/api' (reads NEXT_PUBLIC_API_URL env var, defaults to http://localhost:5001)

// Configs
BREAK_MESSAGES: BreakMessage[]
CLAUDE_LOGO_PATH: string  // SVG path data
```

---

## Session Roles

Role configs are defined in `lib/sessionUtils.ts` as the single source of truth (`ROLE_CONFIGS`). All roles use color `#da7756`.

| Role | Icon | Description |
|------|------|-------------|
| chief | ClaudeLogo | Main orchestrator |
| builder | Code2 | Custom Apps, infrastructure, debugging |
| writer | BookOpen | Sustained focus on a single artifact |
| researcher | Search | Investigates topics, synthesizes findings |
| idea | Lightbulb | Brainstorming, design, planning |
| project | FolderGit2 | External codebases |
| curator | Library | Audits, organizes, maintains accuracy |

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

### Send Reliability
- `sendMessage()` returns `Promise<boolean>` — `true` on success, `false` on error
- On failure (message too long, network error), input text is preserved (not cleared)
- Error banner auto-dismisses after 5 seconds
- Max message length: 100,000 characters

### Queued Messages
Messages sent while Claude is mid-turn get queued by Claude Code (written as `queue-operation` events in the JSONL transcript). The system handles these with deduplication:

- **Live streaming:** Enqueue events emit immediately as `user_message` with `queued: true`. When dequeued, either a real `user_message` replaces it (frontend filters out the queued version) or a `replaces_queued` event updates it in-place.
- **Historical load:** Two-pass dedup in `get_all_events()` — skips enqueue if matching user_message exists, clears queued flag if dequeue/remove exists.
- **UI:** Queued messages render at 50% opacity with a clock icon and "Queued" label. Resolved to full opacity when processed.
- Task notification XML (`<task-notification>`) from background agents is always filtered out (rendered via tool_result system instead).

### Keyboard Shortcuts
- `Enter` — Send message
- `Shift+Enter` — Newline
- `Escape` — Interrupt session (when panel focused)

---

## Adding New Features

### Adding a new role
1. Add to `ROLE_CONFIGS` in `lib/sessionUtils.ts` (single source of truth)
2. Add to `SessionRole` type in backend `types.py`
3. All consumers (ConversationList, MinimizedView, ContextMenu) use `getRoleConfig()`

### Adding attachment features
1. Update `useAttachments.ts` hook
2. Add UI in `InputArea.tsx`

### Adding panel sections
1. Create component in `ClaudePanel/`
2. Import in `ClaudePanel.tsx`
3. Add to render, gate with `!isMinimized && sessionId && ...`
4. Export from `index.ts` if needed externally

---

## System Message Detection

**Location:** `lib/systemMessages.ts`

User messages in the transcript may actually be system injections (hook outputs, handoffs, role prompts, etc.). The `isSystemMessage()` function gates which messages get rendered as system pills vs. user bubbles.

**Critical rule:** All pattern matching uses `startsWith` on trimmed content — never `includes`. This prevents false positives when trigger words appear mid-message in normal user text.

**Patterns detected (must appear at START of message):**
- `[AUTO-HANDOFF]` — Session handoff injection
- `<session-role>`, `<session-mode>` — Role/mode prompt injection
- `<system-reminder>` — System reminder injection
- `SessionStart:` — Startup hook context
- `[CLAUDE OS SYS:` — System notifications (specialist complete, context warnings, etc.)
- `[TEAM →` — Direct team messages between sessions
- `[TEAM REQUEST:` — Spawn requests from non-Chief specialists
- `Base directory for this skill:`, `ARGUMENTS:` — Skill invocation
- `[Request interrupted by user]` — User interrupt

**Downstream routing:** TranscriptViewer calls `renderSystemMessage(content, timestamp)` from `transcript/SystemMessages.tsx`. This shared router handles the full priority chain:

1. `isContextMessage()` → ContextCard (app-tinted, left-aligned)
2. `isCaptureMessage()` → CaptureCard (type-tinted: bug/idea/drop/dump)
3. `isSpecialistNotification()` → SpecialistReport (pass/fail card)
4. `isSpecialistReply()` → SpecialistReplyCard (chat-style card from specialist)
5. `isTeamMessage()` → TeamMessageCard (from→to with role icons)
6. `isTeamRequest()` → TeamRequestCard (spawn request)
7. `isTaskNotification()` → TaskNotificationCard (collapsible subagent result)
8. WAKE → WakeDivider (tiny inline timestamp)
9. WARNING/FORCE-HANDOFF → WarningMessage (amber/red accent)
10. CRON/INFO/LATE/HANDOFF/SessionStart/session-role → SystemMessage plumbing variant (extra muted)
11. Default → SystemMessage pill (centered, muted)

The same `renderSystemMessage()` function is used by both TranscriptViewer (production) and the UI Test Suite (visual audit). One source of truth for routing and rendering.

**In `groupEventsIntoTurns()`:** System messages after session boundaries are absorbed silently (they're plumbing, not content). System messages at conversation start create a synthetic `session_start` boundary.

---

## External Dependencies

- `transcript/TranscriptViewer.tsx` — Renders conversation events
- `transcript/SystemMessages.tsx` — Shared system message components + `renderSystemMessage()` router (used by TranscriptViewer and UI Test Suite)
- `transcript/SessionBoundaries.tsx` — Shared session boundary components + `SessionBoundary` dispatcher
- `transcript/MarkdownLink.tsx` — Shared styled link component for ReactMarkdown
- `transcript/tools/` — Tool call rendering (see `tools/SYSTEM-SPEC.md`)
- `lib/systemMessages.ts` — System message detection, classification, and parsing
- `lib/sessionUtils.ts` — Role configs (single source of truth)
- `hooks/useHandoffState.ts` — SSE handoff lifecycle tracking per conversation
- `ChatPanelContext` — Global panel state (sessionId, visibility, openSession)
- `useClaudeSession` / `useConversation` — SSE connection for transcript events
- `useClaudeActivity` — Session list from API
- `useChiefStatus` — Chief spawn/status

---

## Debugging

### Session not loading
Check: `activeSessions`, `sessionId`, `conversationId` in ClaudePanel.

### Attachments not working
Check: `attachedFiles` in useAttachments.

### System messages showing as user bubbles
Check `lib/systemMessages.ts` — the pattern must appear at the START of the message content. If a new injection format isn't detected, add its prefix to `SYSTEM_MESSAGE_PATTERNS`.

### Panel not resizing
- Check localStorage key: `claude-panel-width`
- Verify `startResize` is bound to resize handle
