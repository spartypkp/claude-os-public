'use client';

/**
 * Tool Expanded Views Registry
 *
 * Combines all domain-specific expanded views into a single registry.
 * Priority order (lowest → highest): misc, claude-code, mcp-core, core
 */

import type { ToolExpandedProps } from './types';

// Domain imports
import { coreExpandedViews } from './core';
import { claudeCodeExpandedViews } from './claude-code';
import { mcpCoreExpandedViews } from './mcp-core';
import { DefaultExpanded, miscExpandedViews } from './misc';

const expandedViewMap: Record<string, React.ComponentType<ToolExpandedProps>> = {
	...miscExpandedViews,
	...claudeCodeExpandedViews,
	...mcpCoreExpandedViews,
	...coreExpandedViews,
};

export function getExpandedView(toolName: string): React.ComponentType<ToolExpandedProps> {
	return expandedViewMap[toolName] || DefaultExpanded;
}

export { DefaultExpanded };
export * from './core';
export * from './claude-code';
export * from './mcp-core';
export * from './misc';
