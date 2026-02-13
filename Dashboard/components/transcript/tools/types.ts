/**
 * Tool rendering types
 */
import type { LucideIcon } from 'lucide-react';

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Tool category determines rendering style:
 * - 'tool': Inline chip (Read, Edit, Bash, search, MCP data tools)
 * - 'system': Full-width system event (lifecycle, meta, orchestration)
 */
export type ToolCategory = 'tool' | 'system';

/**
 * Unified tool configuration — single source of truth for how a tool renders.
 * Lives in registry.ts. Replaces the old fragmented icon/color/oneLiner split.
 */
export interface ToolConfig {
	/** Lucide icon component */
	icon: LucideIcon;
	/** CSS color value */
	color: string;
	/** Rendering category */
	category: ToolCategory;
	/** Get one-liner text for collapsed view */
	getOneLiner: (input: ParsedToolInput, result?: ParsedToolResult) => string;
	/** Whether to show the tool name as an inline prefix (e.g., "STATUS: text") */
	showToolName?: boolean;
	/** Override label for the prefix (defaults to formattedName). Use for ugly names like reply_to_chief → "REPLY" */
	chipLabel?: string;
}

/**
 * Parsed tool input with semantic meaning
 */
export interface ParsedToolInput {
	// File operations
	filePath?: string;
	path?: string;
	fileName?: string;
	parentDir?: string;
	content?: string;

	// Search operations
	pattern?: string;
	query?: string;

	// Bash
	command?: string;
	description?: string;

	// MCP operations
	operation?: string;

	// Contact
	contactName?: string;
	contactQuery?: string;

	// Priority
	priorityContent?: string;
	priorityId?: string;

	// Generic
	raw?: Record<string, unknown>;
	truncated?: boolean;
}

/**
 * Parsed tool result
 */
export interface ParsedToolResult {
	success?: boolean;
	error?: string;
	content?: string;
	data?: unknown;
	raw?: string;
}

/**
 * Props for tool chip (collapsed view)
 */
export interface ToolChipProps {
	toolName: string;
	formattedName: string;
	icon: LucideIcon;
	color: string;
	input: ParsedToolInput;
	result?: ParsedToolResult;
	isRunning: boolean;
	hasError: boolean;
	isExpanded: boolean;
	onToggle: () => void;
}

/**
 * Props for tool expanded view
 */
export interface ToolExpandedProps {
	toolName: string;
	formattedName: string;
	input: ParsedToolInput;
	result?: ParsedToolResult;
	rawInput?: Record<string, unknown>;
	rawResult?: string;
}
