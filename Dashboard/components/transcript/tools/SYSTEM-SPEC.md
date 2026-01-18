# Transcript Tools System Specification

**Location:** `Dashboard/components/transcript/tools/`  
**Purpose:** Render tool calls in the Claude Panel transcript viewer  
**Last Updated:** Jan 2026

---

## Overview

This module renders tool calls (file operations, MCP tools, custom app tools) in the transcript. Each tool call has two views:

1. **Collapsed (ToolChip)** — One-liner showing what the tool did
2. **Expanded** — Full details when user clicks to expand

The system is modular: core infrastructure lives at the root, domain-specific tool views live in folders.

---

## Architecture

```
tools/
├── SYSTEM-SPEC.md        # This file
├── index.ts              # Public API exports
├── types.ts              # TypeScript interfaces
├── registry.ts           # Collapsed view one-liners (getOneLiner)
├── ToolChip.tsx          # Collapsed chip component
├── ExpandedViews.tsx     # Expanded view registry (getExpandedView)
├── ClickableRef.tsx      # Utility: hooks for opening files/apps
├── LiveSessionEmbed.tsx  # Utility: real-time worker viewer (SSE-driven)
│
├── shared/               # Shared UI primitives
│   └── index.tsx         # CodeBlock, InfoBox, StatusBadge, etc.
│
├── core/                 # Claude Code native tools
│   └── index.tsx         # Read, Write, Edit, Bash, Search, Web, TodoWrite
│
├── mcp-core/             # Life system MCP tools
│   └── index.tsx         # worker, team, session, priority, contact, log
│
├── job-search/           # Job Search custom app
│   └── index.tsx         # mock, dsa, leetcode, calendar, messages, mail
│
├── misc/                 # Miscellaneous + fallback
│   └── index.tsx         # VoiceExpanded, DefaultExpanded
│
└── _template/            # Template for new custom apps
    └── index.tsx         # Copy this to create new app tools
```

---

## Root Files (Public API)

These files form the module's public interface. **Don't move them.**

| File | Purpose | Consumers |
|------|---------|-----------|
| `index.ts` | Re-exports public API | TranscriptViewer, ClaudePanel |
| `types.ts` | TypeScript interfaces | All files |
| `registry.ts` | One-liner text for collapsed view | ToolChip |
| `ToolChip.tsx` | Collapsed chip component | TranscriptViewer |
| `ExpandedViews.tsx` | Maps tool names → expanded components | ToolChip |
| `ClickableRef.tsx` | Hooks for opening files/apps in desktop | shared/, domain tools |
| `LiveSessionEmbed.tsx` | Real-time worker embed (SSE-driven) | mcp-core/WorkerExpanded |
| `tool-schema.json` | Reference: tool schemas and usage counts | (docs only) |

---

## Data Flow

```
TranscriptViewer
    │
    ▼
ToolChip.tsx
    │
    ├─► registry.ts::getToolOneLiner()  → collapsed text
    │
    └─► ExpandedViews.tsx::getExpandedView(toolName)
            │
            ▼
        Domain Component (e.g., core/ReadExpanded)
            │
            └─► shared/ components (CodeBlock, InfoBox, etc.)
```

---

## Domain Folders

### `/shared` — UI Primitives

Reusable components for building expanded views. **Use these, don't reinvent.**

| Component | Purpose |
|-----------|---------|
| `CodeBlock` | Code/output display with copy button |
| `SectionHeader` | Labeled section (variant: default/error/success) |
| `InfoBox` | Icon + text box with optional copy |
| `FilePathHeader` | Clickable file path with open/finder buttons |
| `StatusBadge` | Colored pill for status/type/level |
| `OperationHeader` | Operation name + optional ID |
| `KeyValue` | Label: value display |
| `ResultSection` | Standardized result/error output |
| `ResultIndicator` | Inline success/error indicator |
| `ErrorBox` | Error message display |
| `isErrorResult()` | Utility to detect errors in raw result |

### `/core` — Claude Code Native Tools

Built-in Claude Code tools. Highest priority in registry.

| Tool | Component |
|------|-----------|
| Read | `ReadExpanded` |
| Write | `WriteExpanded` |
| Edit | `EditExpanded` |
| Bash | `BashExpanded` |
| Grep, Glob | `SearchExpanded` |
| WebSearch, WebFetch | `WebExpanded` |
| TodoWrite | `TodoWriteExpanded` |

### `/mcp-core` — Life System MCP Tools

Infrastructure tools for the Claude team system.

| Tool | Component |
|------|-----------|
| worker, worker_* | `WorkerExpanded` |
| team | `TeamExpanded` |
| session_* | `SessionExpanded` |
| priority, priority_* | `PriorityExpanded` |
| contact, contact_* | `ContactExpanded` |
| log, ping, status | `LogExpanded` |
| Skill | `SkillExpanded` |

### `/job-search` — Job Search Custom App

Example custom app. Tools for interview preparation.

| Tool | Component |
|------|-----------|
| mock, mock_interview | `MockExpanded` |
| dsa | `DsaExpanded` |
| leetcode | `LeetcodeExpanded` |
| calendar, calendar_* | `CalendarExpanded` |
| messages | `MessagesExpanded` |
| mail | `MailExpanded` |

### `/misc` — Miscellaneous

Catch-all and fallback.

| Tool | Component |
|------|-----------|
| converse | `VoiceExpanded` |
| (unknown) | `DefaultExpanded` |

### `/_template` — New App Template

**Copy this folder** when creating tools for a new custom app.

---

## Adding a New Custom App

### Step 1: Copy the Template

```bash
cp -r Dashboard/components/transcript/tools/_template \
      Dashboard/components/transcript/tools/[your-app]
```

### Step 2: Create Your Components

Edit `[your-app]/index.tsx`:

```tsx
'use client';

import { SomeIcon } from 'lucide-react';
import { CodeBlock, InfoBox, ResultSection, StatusBadge } from '../shared';
import type { ToolExpandedProps } from '../types';

export function YourToolExpanded({ rawInput, rawResult }: ToolExpandedProps) {
  // Extract fields
  const operation = rawInput?.operation ? String(rawInput.operation) : '';
  const hasError = rawResult?.toLowerCase().includes('error');
  
  return (
    <div className="space-y-3">
      {/* Your UI here - use shared components */}
      {rawResult && <ResultSection result={rawResult} />}
    </div>
  );
}

// Export map: tool name → component
export const yourAppExpandedViews = {
  your_tool: YourToolExpanded,
  another_tool: AnotherToolExpanded,
};
```

### Step 3: Register in ExpandedViews.tsx

```tsx
// Add import
import { yourAppExpandedViews } from './your-app';

// Add to expandedViewMap (before mcpCoreExpandedViews)
const expandedViewMap = {
  ...miscExpandedViews,
  ...yourAppExpandedViews,  // ← Add here
  ...jobSearchExpandedViews,
  ...mcpCoreExpandedViews,
  ...coreExpandedViews,
};
```

### Step 4: (Optional) Add One-Liners to registry.ts

If you want custom collapsed text, add a renderer to `registry.ts`:

```ts
const yourToolRenderer: ToolRendererConfig = {
  getOneLiner: (input) => {
    const name = input.raw?.name ? String(input.raw.name) : '';
    return name || 'your tool';
  },
  showToolName: true,
};

// Add to toolRenderers map
your_tool: yourToolRenderer,
```

---

## Debugging Tips

### Find the Tool Name

The tool name comes from the MCP server. To see what name arrives:

```tsx
// In ToolChip.tsx, add temporarily:
console.log('Tool:', toolName, 'Formatted:', formattedName);
```

Common transformations:
- `mcp__life__worker` → `worker`
- `mcp__apple__calendar` → `calendar`
- `Read` stays `Read`

### Test Your Component

1. Trigger the tool in Claude
2. Click the chip in the transcript
3. Your expanded view should render
4. Check browser console for errors

---

## Best Practices

### DO

- Use shared components (`CodeBlock`, `StatusBadge`, etc.)
- Extract fields with type coercion: `String(rawInput?.field || '')`
- Use `isErrorResult(rawResult)` for consistent error detection
- Handle missing data gracefully (show nothing, not errors)
- Keep components focused (one tool per component)

### DON'T

- Create new styling patterns (use shared/)
- Parse JSON without try/catch
- Assume rawInput fields exist
- Add heavy logic (parsing belongs in registry.ts)

---

## Type Reference

```ts
interface ToolExpandedProps {
  toolName: string;           // Raw MCP tool name
  formattedName: string;      // Cleaned name (e.g., 'worker')
  input: ParsedToolInput;     // Semantic input (filePath, operation, etc.)
  result?: ParsedToolResult;  // Parsed result (success, error, data)
  rawInput?: Record<string, unknown>;  // Original tool input
  rawResult?: string;         // Original result string
}

interface ParsedToolInput {
  filePath?: string;
  operation?: string;
  workerId?: string;
  // ... see types.ts for full list
  raw?: Record<string, unknown>;
}

interface ParsedToolResult {
  success?: boolean;
  error?: string;
  content?: string;
  data?: unknown;
}
```

---

## Maintenance Notes

### Adding New Core Tools

If Claude Code adds new native tools, add them to `/core/index.tsx` and update the export map.

### Updating Shared Components

Changes to `/shared/` affect all expanded views. Test across domains.

### Registry Priority

Order in `expandedViewMap` matters:
1. `misc` (lowest - fallbacks)
2. Custom apps (middle)
3. `mcp-core` (infrastructure)
4. `core` (highest - Claude native)

Later entries override earlier ones for the same tool name.

