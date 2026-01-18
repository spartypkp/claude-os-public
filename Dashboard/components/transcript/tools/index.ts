/**
 * Transcript Tools - Public API
 * 
 * This module provides components for rendering tool calls in the transcript viewer.
 * 
 * Structure:
 * - ToolChip: Collapsed view with one-liner description
 * - getExpandedView: Returns the appropriate expanded view component for a tool
 * - Registry functions: parseToolInput, parseToolResult, getToolOneLiner
 * - LiveWorkerEmbed: Real-time worker viewer (uses SSE events)
 * 
 * Domain folders:
 * - shared/      → Shared UI primitives (CodeBlock, InfoBox, etc.)
 * - core/        → Claude Code native tools
 * - mcp-core/    → Life system MCP tools
 * - misc/        → Voice, DefaultExpanded
 */

// Main components
export { ToolChip } from './ToolChip';
export { getExpandedView, DefaultExpanded } from './ExpandedViews';
export { LiveWorkerEmbed } from './LiveSessionEmbed';

// Registry functions
export { getToolOneLiner, getToolRenderer, parseToolInput, parseToolResult } from './registry';

// Types
export type { 
	ParsedToolInput, 
	ParsedToolResult, 
	ToolChipProps, 
	ToolExpandedProps, 
	ToolRendererConfig 
} from './types';

// Shared UI components (for use in custom app tools)
export * from './shared';
