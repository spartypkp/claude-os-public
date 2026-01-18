'use client';

/**
 * [APP_NAME] Custom App Tool Expanded Views
 * 
 * TEMPLATE: Copy this folder to create expanded views for a new custom app.
 * 
 * Steps to add a new custom app's tools:
 * 1. Copy this folder to `tools/[app-name]/`
 * 2. Rename this file's contents, replacing [APP_NAME] and [app_name]
 * 3. Add your tool components following the ExampleExpanded pattern
 * 4. Export them in the `[appName]ExpandedViews` map at the bottom
 * 5. Import and merge in `ExpandedViews.tsx`:
 *    ```
 *    import { [appName]ExpandedViews } from './[app-name]';
 *    // Add to expandedViewMap:
 *    ...[appName]ExpandedViews,
 *    ```
 * 
 * The tool name in the map should match what the MCP tool sends.
 * Use `console.log(toolName)` in ToolChip.tsx to debug tool names.
 */

import { Zap } from 'lucide-react';
import {
	CodeBlock,
	InfoBox,
	isErrorResult,
	OperationHeader,
	ResultSection,
	SectionHeader,
	StatusBadge,
} from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// EXAMPLE TOOL - Copy and modify this pattern
// =============================================================================

/**
 * Example expanded view for a custom app tool.
 * 
 * Props available:
 * - toolName: The raw MCP tool name (e.g., 'mcp__life__worker')
 * - formattedName: Cleaned tool name (e.g., 'worker')
 * - input: Parsed semantic input (filePath, operation, etc.)
 * - result: Parsed result (success, error, data)
 * - rawInput: Original tool input as Record<string, unknown>
 * - rawResult: Original result string
 * 
 * Best practices:
 * - Extract fields with type coercion: `const x = rawInput?.field ? String(rawInput.field) : ''`
 * - Use shared components: StatusBadge, CodeBlock, InfoBox, ResultSection
 * - Use isErrorResult(rawResult) for consistent error detection
 * - Return early with null for invalid/missing data
 */
export function ExampleExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	// 1. Extract and type-coerce fields from rawInput
	const operation = rawInput?.operation ? String(rawInput.operation) : '';
	const name = rawInput?.name ? String(rawInput.name) : '';
	const status = rawInput?.status ? String(rawInput.status) : '';
	const content = rawInput?.content ? String(rawInput.content) : '';

	// 2. Check for errors using shared helper
	const hasError = isErrorResult(rawResult);

	// 3. Define color mappings for status badges
	const statusColors: Record<string, string> = {
		active: 'var(--color-success)',
		pending: 'var(--color-warning)',
		error: 'var(--color-error)',
		default: 'var(--text-muted)',
	};

	// 4. Render using shared components
	return (
		<div className="space-y-3">
			{/* Operation header with optional ID */}
			<OperationHeader operation={operation || 'example'} icon={Zap} />

			{/* Status badge */}
			{status && (
				<StatusBadge
					label={status}
					color={statusColors[status] || statusColors.default}
				/>
			)}

			{/* Name/title display */}
			{name && (
				<InfoBox icon={Zap} color="var(--color-primary)">
					{name}
				</InfoBox>
			)}

			{/* Content section */}
			{content && (
				<div>
					<SectionHeader>Content</SectionHeader>
					<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
						{content}
					</div>
				</div>
			)}

			{/* Result section - use shared ResultSection for consistency */}
			{rawResult && (
				<ResultSection result={rawResult} hasError={hasError} />
			)}
		</div>
	);
}

// =============================================================================
// ANOTHER EXAMPLE - Operation-based tool with multiple views
// =============================================================================

export function OperationBasedExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const operation = rawInput?.operation ? String(rawInput.operation) : '';
	const id = rawInput?.id ? String(rawInput.id) : '';
	const hasError = isErrorResult(rawResult);

	// Different rendering based on operation
	switch (operation) {
		case 'create':
			return (
				<div className="space-y-3">
					<OperationHeader operation="create" />
					{/* Create-specific UI */}
					{rawResult && <ResultSection result={rawResult} successLabel="Created" />}
				</div>
			);

		case 'list':
			// Parse list results
			let items: Array<{ id: string; name: string; }> = [];
			if (rawResult && !hasError) {
				try {
					const parsed = JSON.parse(rawResult);
					if (Array.isArray(parsed)) items = parsed;
				} catch { /* not JSON */ }
			}

			if (items.length > 0) {
				return (
					<div className="space-y-1">
						{items.map((item, i) => (
							<div
								key={i}
								className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]"
							>
								<span className="font-mono text-[var(--text-muted)]">{item.id?.slice(0, 8)}</span>
								<span className="text-[var(--text-secondary)]">{item.name}</span>
							</div>
						))}
					</div>
				);
			}
			return rawResult ? <CodeBlock code={rawResult} maxHeight="150px" /> : null;

		case 'delete':
			return (
				<div className="space-y-2">
					<OperationHeader operation="delete" id={id} />
					{rawResult && <ResultSection result={rawResult} successLabel="Deleted" />}
				</div>
			);

		default:
			// Fallback for unknown operations
			return (
				<div className="space-y-3">
					{operation && <OperationHeader operation={operation} id={id} />}
					{rawResult && <ResultSection result={rawResult} />}
				</div>
			);
	}
}

// =============================================================================
// EXPORT MAP - Maps MCP tool names to components
// =============================================================================

/**
 * Export your tools in this map.
 * Keys should match the MCP tool name (after formatting).
 * 
 * Example MCP tool names:
 * - 'example_tool' → from mcp__[app]__example_tool
 * - 'example' → short name
 * 
 * If unsure of the tool name, add `console.log(formattedName)` 
 * in ToolChip.tsx to see what name arrives.
 */
export const templateExpandedViews = {
	// Map tool names to components
	example: ExampleExpanded,
	example_tool: ExampleExpanded,
	operation_based: OperationBasedExpanded,
};

