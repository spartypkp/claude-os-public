/**
 * Transcript Tools - Public API
 *
 * Renders tool calls in the ClaudePanel transcript viewer.
 *
 * Structure:
 * - ToolChip: Inline tool chip (collapsed one-liner, expandable)
 * - SystemEventChip: Full-width system event (lifecycle, meta)
 * - Registry: Single source of truth for tool config (icon, color, category, one-liner)
 *
 * Domain folders:
 * - shared/       → Shared UI primitives (CodeBlock, InfoBox, etc.)
 * - core/         → Claude Code native tools (Edit, Bash, Search, Web)
 * - claude-code/  → Claude Code meta tools (Task, AskUserQuestion, PlanMode)
 * - mcp-core/     → Life system MCP tools (team, priority, contact)
 * - misc/         → DefaultExpanded fallback
 */

// Main components
export { ToolChip } from './ToolChip';
export { SystemEventChip } from './SystemEventChip';
export { getExpandedView, DefaultExpanded } from './ExpandedViews';

// Registry functions
export { getToolConfig, getToolOneLiner, parseToolInput, parseToolResult } from './registry';

// Types
export type {
	ParsedToolInput,
	ParsedToolResult,
	ToolCategory,
	ToolChipProps,
	ToolConfig,
	ToolExpandedProps,
} from './types';

// Shared UI components (for use in custom app tools)
export * from './shared';
