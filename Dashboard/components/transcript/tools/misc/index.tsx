'use client';

/**
 * Misc Tool Expanded Views — Default fallback for unknown tools
 */

import { CodeBlock, SectionHeader, isErrorResult } from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// DEFAULT FALLBACK
// =============================================================================

export function DefaultExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const hasError = isErrorResult(rawResult);

	const cleanInput = rawInput ? Object.fromEntries(
		Object.entries(rawInput).filter(([k]) => !k.startsWith('_'))
	) : null;

	return (
		<div className="space-y-3">
			{cleanInput && Object.keys(cleanInput).length > 0 && (
				<div>
					<SectionHeader>Input</SectionHeader>
					<CodeBlock code={JSON.stringify(cleanInput, null, 2)} maxHeight="150px" />
				</div>
			)}

			{rawResult && (
				<div>
					<SectionHeader variant={hasError ? 'error' : 'default'}>
						{hasError ? 'Error' : 'Result'}
					</SectionHeader>
					<CodeBlock code={rawResult} maxHeight="150px" />
				</div>
			)}
		</div>
	);
}

// =============================================================================
// EXPORT MAP
// =============================================================================

export const miscExpandedViews = {};
