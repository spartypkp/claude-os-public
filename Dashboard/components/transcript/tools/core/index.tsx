'use client';

/**
 * Core Tool Expanded Views
 *
 * Claude Code native tools: Edit, Bash, Grep, Glob, WebSearch, WebFetch, TodoWrite
 * Read/Write don't expand — they click-to-open in Desktop.
 */

import { AlertCircle, Check, Clock, FolderOpen, Play, Search, Square, Terminal } from 'lucide-react';
import { useOpenInDesktop } from '../ClickableRef';
import { CodeBlock, FilePathHeader, InfoBox, SectionHeader, isErrorResult } from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// EDIT TOOL (diff view — the one file op worth expanding)
// =============================================================================

export function EditExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const path = input.filePath || 'unknown';
	const oldString = rawInput?.old_string ? String(rawInput.old_string) : '';
	const newString = rawInput?.new_string ? String(rawInput.new_string) : '';
	const replaceAll = Boolean(rawInput?.replace_all);
	const hasError = isErrorResult(rawResult);

	const oldLines = oldString.split('\n').length;
	const newLines = newString.split('\n').length;
	const lineDiff = newLines - oldLines;

	return (
		<div className="space-y-2">
			<div className="relative">
				<FilePathHeader path={path} variant="warning" />
				{replaceAll && (
					<span className="absolute top-1.5 right-16 text-[9px] bg-[var(--color-warning)]/20 text-[var(--color-warning)] px-1.5 py-0.5 rounded">
						replace all
					</span>
				)}
			</div>

			{oldString && newString && (
				<div className="space-y-1.5">
					<div className="text-[10px] text-[var(--text-muted)] flex items-center gap-2">
						<span className="text-[var(--color-error)]">-{oldLines} lines</span>
						<span>→</span>
						<span className="text-[var(--color-success)]">+{newLines} lines</span>
						{lineDiff !== 0 && (
							<span className={lineDiff > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
								({lineDiff > 0 ? '+' : ''}{lineDiff} net)
							</span>
						)}
					</div>

					<div className="rounded-md overflow-hidden border border-[var(--color-error)]/20">
						<div className="bg-[var(--color-error)]/10 px-2 py-1 text-[9px] font-medium text-[var(--color-error)] border-b border-[var(--color-error)]/20">
							REMOVED
						</div>
						<div className="bg-[var(--color-error)]/5 p-2">
							<code className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-all block">
								{oldString.slice(0, 800)}{oldString.length > 800 ? '\n...' : ''}
							</code>
						</div>
					</div>

					<div className="rounded-md overflow-hidden border border-[var(--color-success)]/20">
						<div className="bg-[var(--color-success)]/10 px-2 py-1 text-[9px] font-medium text-[var(--color-success)] border-b border-[var(--color-success)]/20">
							ADDED
						</div>
						<div className="bg-[var(--color-success)]/5 p-2">
							<code className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-all block">
								{newString.slice(0, 800)}{newString.length > 800 ? '\n...' : ''}
							</code>
						</div>
					</div>
				</div>
			)}

			{rawResult && (
				<div className={`text-[10px] flex items-center gap-1.5 ${hasError ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
					{hasError ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
					{hasError ? rawResult : 'Edited'}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// BASH TOOL
// =============================================================================

export function BashExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const command = String(input.command || rawInput?.command || '');
	const description = rawInput?.description ? String(rawInput.description) : '';

	return (
		<div className="space-y-3">
			{description && (
				<div className="text-[10px] text-[var(--text-muted)] italic">
					{description}
				</div>
			)}

			<div className="relative group">
				<div className="flex items-start gap-2 font-mono text-[11px] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
					<Terminal className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
					<code className="text-[var(--text-secondary)] whitespace-pre-wrap break-all">{command}</code>
				</div>
			</div>

			{rawResult && (
				<CodeBlock code={rawResult} maxHeight="150px" />
			)}
		</div>
	);
}

// =============================================================================
// SEARCH TOOLS (Grep, Glob)
// =============================================================================

export function SearchExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const { openInFinder } = useOpenInDesktop();
	const pattern = input.pattern || input.query || '';
	const path = rawInput?.path ? String(rawInput.path) : '';
	const hasError = isErrorResult(rawResult);

	let matchInfo = '';
	if (rawResult && !hasError) {
		const lines = rawResult.split('\n').filter(l => l.trim());
		matchInfo = `${lines.length} match${lines.length === 1 ? '' : 'es'}`;
	}

	return (
		<div className="space-y-3">
			<InfoBox icon={Search} color="var(--color-info)">
				<code className="font-mono">{pattern}</code>
			</InfoBox>

			{path && (
				<button
					onClick={() => openInFinder(path)}
					className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[#da7756] transition-colors"
					title="Show in Finder"
				>
					<FolderOpen className="w-3 h-3" />
					<span className="hover:underline decoration-dotted">{path}</span>
				</button>
			)}

			{matchInfo && (
				<div className="text-[10px] text-[var(--color-success)]">
					Found {matchInfo}
				</div>
			)}

			{rawResult && (
				<CodeBlock code={rawResult} maxHeight="200px" />
			)}
		</div>
	);
}

// =============================================================================
// WEB TOOLS (WebSearch, WebFetch)
// =============================================================================

export function WebExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const query = rawInput?.query ? String(rawInput.query) : input.query || '';
	const url = rawInput?.url ? String(rawInput.url) : '';
	const prompt = rawInput?.prompt ? String(rawInput.prompt) : '';
	const hasError = isErrorResult(rawResult);

	return (
		<div className="space-y-3">
			{query && (
				<InfoBox icon={Search} color="var(--color-info)">
					&quot;{query}&quot;
				</InfoBox>
			)}
			{url && (
				<InfoBox icon={Search} color="var(--color-info)" copyText={url}>
					<span className="font-mono truncate">{url}</span>
				</InfoBox>
			)}

			{prompt && (
				<div>
					<SectionHeader>Prompt</SectionHeader>
					<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
						{prompt}
					</div>
				</div>
			)}

			{rawResult && (
				<div>
					<SectionHeader variant={hasError ? 'error' : 'default'}>
						{hasError ? 'Error' : 'Result'}
					</SectionHeader>
					<CodeBlock code={rawResult} maxHeight="200px" />
				</div>
			)}
		</div>
	);
}

// =============================================================================
// TODO WRITE
// =============================================================================

export function TodoWriteExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const todos = rawInput?.todos;
	const hasError = isErrorResult(rawResult);

	if (!Array.isArray(todos)) return null;

	const statusColors: Record<string, string> = {
		in_progress: 'var(--color-primary)',
		pending: 'var(--text-muted)',
		completed: 'var(--color-success)',
		cancelled: 'var(--color-error)',
	};

	const statusIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
		in_progress: Play,
		pending: Clock,
		completed: Check,
		cancelled: Square,
	};

	return (
		<div className="space-y-3">
			<SectionHeader>Tasks</SectionHeader>
			<div className="space-y-1">
				{(todos as Array<{ content?: string; status?: string }>).map((todo, i) => {
					const status = todo.status || 'pending';
					const StatusIcon = statusIcons[status] || Clock;
					const color = statusColors[status] || 'var(--text-muted)';

					return (
						<div
							key={i}
							className="flex items-start gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]"
						>
							<StatusIcon className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color }} />
							<span className="text-[var(--text-secondary)]">{todo.content || 'Task'}</span>
						</div>
					);
				})}
			</div>

			{rawResult && (
				hasError || rawResult.length > 100 ? (
					<div>
						<SectionHeader variant={hasError ? 'error' : 'success'}>
							{hasError ? 'Error' : 'Result'}
						</SectionHeader>
						<CodeBlock code={rawResult} maxHeight="80px" />
					</div>
				) : (
					<span className="text-[10px] text-[var(--color-success)]">Updated</span>
				)
			)}
		</div>
	);
}

// =============================================================================
// EXPORT MAP
// =============================================================================

export const coreExpandedViews = {
	// Edit (diff view — the only file op that expands)
	Edit: EditExpanded,

	// Terminal
	Bash: BashExpanded,

	// Search
	Grep: SearchExpanded,
	Glob: SearchExpanded,

	// Web
	WebSearch: WebExpanded,
	WebFetch: WebExpanded,
	web_search: WebExpanded,

	// Tasks
	TodoWrite: TodoWriteExpanded,
};
