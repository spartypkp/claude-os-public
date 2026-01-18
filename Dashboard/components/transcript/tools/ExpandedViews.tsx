'use client';

/**
 * Tool Expanded Views Registry
 * 
 * This file combines all domain-specific expanded views into a single registry.
 * 
 * ARCHITECTURE:
 * ─────────────
 * tools/
 * ├── shared/       → UI primitives (CodeBlock, StatusBadge, etc.)
 * ├── core/         → Claude Code native tools (Read, Write, Edit, Bash, etc.)
 * ├── mcp-core/     → Life system MCP tools (worker, team, priority, contact)
 * ├── misc/         → Miscellaneous (voice) + DefaultExpanded fallback
 * └── _template/    → Template for new custom apps (copy this!)
 * 
 * ADDING A NEW CUSTOM APP:
 * ────────────────────────
 * 1. Copy `_template/` folder to `tools/[your-app-name]/`
 * 2. Follow the template patterns to create your tool components
 * 3. Export them in the `[yourApp]ExpandedViews` map
 * 4. Import and add to the registry below:
 *    ```
 *    import { yourAppExpandedViews } from './your-app-name';
 *
 *    const expandedViewMap = {
 *      ...miscExpandedViews,
 *      ...yourAppExpandedViews,  // ← Add here
 *      ...mcpCoreExpandedViews,
 *      ...coreExpandedViews,
 *    };
 *    ```
 * 
 * PRIORITY ORDER (lowest → highest):
 * - misc (fallbacks, can be overridden)
 * - custom apps (your-app, etc.)
 * - mcp-core (life system infrastructure)
 * - core (Claude Code native - highest priority)
 */

import type { ToolExpandedProps } from './types';

// Domain imports
import { coreExpandedViews } from './core';
import { mcpCoreExpandedViews } from './mcp-core';
import { DefaultExpanded, miscExpandedViews } from './misc';

// =============================================================================
// COMBINED REGISTRY
// =============================================================================

/**
 * Combined map of all tool name → expanded view component mappings.
 *
 * Order matters! Later entries override earlier ones.
 * Add new custom apps between misc and mcp-core.
 */
const expandedViewMap: Record<string, React.ComponentType<ToolExpandedProps>> = {
	// Misc tools (lowest priority - fallbacks)
	...miscExpandedViews,

	// ─── Custom Apps (add new ones here) ───

	// ─── Core Infrastructure ───
	...mcpCoreExpandedViews,  // Life system MCP
	...coreExpandedViews,      // Claude Code native (highest priority)
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get the expanded view component for a tool.
 * Falls back to DefaultExpanded for unknown tools.
 * 
 * @param toolName - The formatted tool name (e.g., 'worker', 'Read', 'mock')
 * @returns React component for rendering the expanded view
 */
export function getExpandedView(toolName: string): React.ComponentType<ToolExpandedProps> {
	return expandedViewMap[toolName] || DefaultExpanded;
}

// Re-export DefaultExpanded for direct use
export { DefaultExpanded };

// Re-export all domain components for direct access
export * from './core';
export * from './mcp-core';
export * from './misc';

