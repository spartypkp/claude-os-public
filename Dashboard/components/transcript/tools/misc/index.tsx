'use client';

/**
 * Misc Tool Expanded Views
 * 
 * Tools that don't fit into other categories:
 * - Voice (converse)
 * - Default fallback for unknown tools
 */

import { Mic } from 'lucide-react';
import { CodeBlock, SectionHeader } from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// VOICE TOOL (converse)
// =============================================================================

export function VoiceExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const message = rawInput?.message ? String(rawInput.message) : '';
	const waitForResponse = Boolean(rawInput?.wait_for_response);
	const voice = rawInput?.voice ? String(rawInput.voice) : '';
	const hasError = rawResult?.toLowerCase().includes('error');

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
				<Mic className="w-3 h-3" />
				{voice && <span>Voice: {voice}</span>}
				{waitForResponse && <span>• Waiting for response</span>}
			</div>

			{message && (
				<div>
					<SectionHeader>Speaking</SectionHeader>
					<div className="bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
						{message}
					</div>
				</div>
			)}

			{rawResult && (
				<div>
					<SectionHeader variant={hasError ? 'error' : 'default'}>
						{hasError ? 'Error' : 'Response'}
					</SectionHeader>
					<CodeBlock code={rawResult} maxHeight="150px" />
				</div>
			)}
		</div>
	);
}

// =============================================================================
// DEFAULT FALLBACK
// =============================================================================

export function DefaultExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const hasError = rawResult?.toLowerCase().includes('error');

	// Filter out internal keys
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

export const miscExpandedViews = {
	converse: VoiceExpanded,
};

