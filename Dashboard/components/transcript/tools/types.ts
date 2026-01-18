/**
 * Tool rendering types
 */
import type { LucideIcon } from 'lucide-react';

/**
 * Parsed tool input with semantic meaning
 */
export interface ParsedToolInput {
	// File operations
	filePath?: string;
	path?: string;  // Alternative to filePath
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

	// Worker
	workerId?: string;
	instructions?: string;

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

/**
 * Tool renderer configuration
 */
export interface ToolRendererConfig {
	/** Get one-liner text for collapsed view */
	getOneLiner: (input: ParsedToolInput, result?: ParsedToolResult) => string;

	/** Optional: custom chip component */
	ChipComponent?: React.ComponentType<ToolChipProps>;

	/** Optional: custom expanded component */
	ExpandedComponent?: React.ComponentType<ToolExpandedProps>;

	/** Whether to show the tool name badge */
	showToolName?: boolean;
}

