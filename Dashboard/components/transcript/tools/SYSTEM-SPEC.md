# Transcript Tools System Specification

**Location:** `Dashboard/components/transcript/tools/`
**Purpose:** Render tool calls in the Claude Panel transcript viewer
**Last Updated:** Feb 2026

---

## Overview

This module renders tool calls (file operations, MCP tools, Claude Code meta-tools) in the transcript. Each tool call has two views:

1. **Collapsed (ToolChip)** — Icon + one-liner showing what the tool did
2. **Expanded** — Full details when user clicks to expand

The system is modular: core infrastructure lives at the root, domain-specific expanded views live in folders.

---

## Architecture

```
tools/
├── SYSTEM-SPEC.md        # This file
├── index.ts              # Public API exports
├── types.ts              # TypeScript interfaces (ToolConfig, ParsedToolInput, etc.)
├── registry.ts           # Single source of truth: icon, color, category, one-liner, chipLabel
├── ToolChip.tsx          # Collapsed chip component (standard + subagent layouts)
├── SystemEventChip.tsx   # Full-width muted bars for system/lifecycle events
├── ExpandedViews.tsx     # Expanded view registry (getExpandedView)
├── ClickableRef.tsx      # Utility: hooks for opening files/apps in desktop
│
├── shared/               # Shared UI primitives
│   └── index.tsx         # CodeBlock, InfoBox, StatusBadge, KeyValue, etc.
│
├── core/                 # Claude Code native tools (Read, Write, Edit, Bash, Search, Web)
│   └── index.tsx
│
├── claude-code/          # Claude Code meta-tools (Task, AskUserQuestion, TaskList)
│   └── index.tsx
│
├── mcp-core/             # Life system MCP tools (team, priority, contact, email, calendar, etc.)
│   └── index.tsx
│
└── misc/                 # Fallback
    └── index.tsx         # DefaultExpanded (raw JSON viewer)
```

---

## Root Files (Public API)

| File | Purpose | Consumers |
|------|---------|-----------|
| `index.ts` | Re-exports public API | TranscriptViewer, ClaudePanel |
| `types.ts` | TypeScript interfaces | All files |
| `registry.ts` | Tool configs — icon, color, one-liner, chipLabel | ToolChip, SystemEventChip |
| `ToolChip.tsx` | Collapsed chip component | TranscriptViewer |
| `SystemEventChip.tsx` | Full-width system event bars | TranscriptViewer |
| `ExpandedViews.tsx` | Maps tool names → expanded components | ToolChip |
| `ClickableRef.tsx` | Hooks for opening files/apps in desktop | ToolChip, domain tools |

---

## Data Flow

```
TranscriptViewer
    │
    ├─► registry.ts::getToolConfig(formattedName)
    │       → { icon, color, category, showToolName, chipLabel }
    │
    ├─► category === 'system'?
    │       YES → SystemEventChip (full-width muted bar, non-expandable)
    │       NO  → ToolChip (inline chip, expandable)
    │
    └─► ToolChip
            │
            ├─► registry.ts::getToolOneLiner()  → { text, showToolName, chipLabel }
            │       showToolName: true  → renders "LABEL: text" inline prefix
            │       showToolName: false → renders just "text"
            │
            └─► ExpandedViews.tsx::getExpandedView(toolName)
                    │
                    └─► Domain Component (e.g., core/BashExpanded)
                            │
                            └─► shared/ components (CodeBlock, InfoBox, etc.)
```

---

## ToolConfig — The Registry

Every tool is defined in `registry.ts` with a `ToolConfig`:

```ts
interface ToolConfig {
  icon: LucideIcon;              // Lucide icon component
  color: string;                 // CSS color value
  category: 'tool' | 'system';  // 'system' → SystemEventChip, 'tool' → ToolChip
  getOneLiner: (input, result?) => string;  // Collapsed text
  showToolName?: boolean;        // Show tool name as inline prefix (default: true)
  chipLabel?: string;            // Override prefix label (e.g., reply_to_chief → "REPLY")
}
```

### Chip Rendering Format

When `showToolName` is true, the chip renders as:
```
[icon] LABEL: one-liner-text [chevron]
```
Where LABEL is `chipLabel || formattedName`, displayed uppercase.

When `showToolName` is false:
```
[icon] one-liner-text [chevron]
```

### Tool Categories

**`category: 'tool'`** — Standard inline chips. Most tools.
- File ops: Read, Write, Edit (showToolName: false — verb in one-liner)
- Search: Grep, Glob (showToolName: false — pattern is clear)
- Web: WebSearch, WebFetch (showToolName: false)
- MCP data: contact, calendar, email, priority, etc. (showToolName: true)
- Subagent: Task (special rendering — agent-type pill + badges)

**`category: 'system'`** — Full-width system event bars (non-expandable).
- Lifecycle: status, timeline, reset, done, reply_to_chief, show
- Orchestration: team
- Interactive: AskUserQuestion, EnterPlanMode, ExitPlanMode, Skill

---

## Domain Folders

### `/shared` — UI Primitives

Reusable components for building expanded views.

| Component | Purpose |
|-----------|---------|
| `CodeBlock` | Code/output display with copy button |
| `SectionHeader` | Labeled section (variant: default/error/success) |
| `InfoBox` | Icon + text box |
| `FilePathHeader` | Clickable file path with open/finder buttons |
| `StatusBadge` | Colored pill for status/type/level |
| `KeyValue` | Label: value display |
| `ResultIndicator` | Inline success/error indicator |
| `ErrorBox` | Error message display |
| `isErrorResult()` | Utility to detect errors in raw result |

### `/core` — Claude Code Native Tools

| Tool | Component |
|------|-----------|
| Read | `ReadExpanded` |
| Edit | `EditExpanded` |
| Bash | `BashExpanded` |
| Grep, Glob | `SearchExpanded` |
| WebSearch, WebFetch | `WebExpanded` |

### `/claude-code` — Claude Code Meta Tools

| Tool | Component |
|------|-----------|
| Task, TaskOutput, TaskStop | `TaskExpanded` |
| AskUserQuestion | `AskUserQuestionExpanded` |
| TaskCreate, TaskUpdate, TaskGet | `TaskManagementExpanded` |
| TaskList | `TaskListExpanded` |

### `/mcp-core` — Life System MCP Tools

| Tool | Component |
|------|-----------|
| team | `TeamExpanded` |
| priority | `PriorityExpanded` |
| contact | `ContactExpanded` |
| email | `EmailExpanded` |
| calendar | `CalendarExpanded` |
| messages | `MessagesExpanded` |
| opportunity | `OpportunityExpanded` |
| pet | `PetExpanded` |
| reply_to_chief | `ReplyExpanded` |
| Skill | `SkillExpanded` |

### `/misc` — Fallback

| Tool | Component |
|------|-----------|
| (unknown) | `DefaultExpanded` (raw JSON viewer) |

---

## Adding a New Tool

### 1. Register in registry.ts

```ts
your_tool: {
  icon: SomeIcon,
  color: '#3b82f6',
  category: 'tool',
  showToolName: true,
  getOneLiner: (input) => {
    const op = input.operation || '';
    return op || 'manage';
  },
},
```

### 2. Create expanded view (optional)

Add to the appropriate domain folder (mcp-core, claude-code, etc.):

```tsx
export function YourToolExpanded({ rawInput, rawResult }: ToolExpandedProps) {
  const hasError = isErrorResult(rawResult);
  return (
    <div className="space-y-2">
      {rawResult && (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} />)}
    </div>
  );
}
```

### 3. Register expanded view in ExpandedViews.tsx

Add to the domain's export map, then import in ExpandedViews.tsx.

---

## Special Chip Layouts

### Subagent Chips (Task tool)

When `formattedName` is Task/TaskOutput/TaskStop, ToolChip renders a special layout:
- Agent-type pill (colored by agent type)
- Model badge (haiku/sonnet/opus)
- Background badge (if run_in_background)
- Description text
- Agent colors exported as `AGENT_COLORS` from ToolChip.tsx

### System Event Chips (SystemEventChip)

Category 'system' tools render as full-width muted bars:
- No expand/collapse
- Icon + one-liner text only
- Used for lifecycle events (status, timeline, reset, done, team, show, reply)

---

## Debugging Tips

### Find the Tool Name

```tsx
// In TranscriptViewer, tool names arrive as:
// - Claude Code: "Read", "Write", "Edit", "Bash", "Task", etc.
// - MCP: "mcp__life__status" → formatToolName → "status"
```

### Test Your Component

1. Trigger the tool in Claude
2. Click the chip in the transcript
3. Your expanded view should render
4. Check browser console for errors

---

## Registry Priority

Order in `expandedViewMap` (ExpandedViews.tsx):
1. `misc` (lowest — fallback)
2. `claude-code` (meta tools)
3. `mcp-core` (MCP tools)
4. `core` (highest — Claude native tools)

Later entries override earlier ones for the same tool name.
