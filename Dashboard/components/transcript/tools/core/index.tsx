'use client';

/**
 * Core Tool Expanded Views
 * 
 * Claude Code native tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, TodoWrite
 * These are the fundamental tools built into Claude Code.
 */

import { AlertCircle, Check, Clock, FolderOpen, Play, Search, Square, Terminal } from 'lucide-react';
import { useOpenInDesktop } from '../ClickableRef';
import { CodeBlock, FilePathHeader, InfoBox, SectionHeader } from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// READ TOOL
// =============================================================================

export function ReadExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const path = input.filePath || 'unknown';
	const offset = rawInput?.offset ? Number(rawInput.offset) : undefined;
	const limit = rawInput?.limit ? Number(rawInput.limit) : undefined;
	const hasError = rawResult?.toLowerCase().includes('error');

	const lineCount = rawResult ? rawResult.split('\n').length : 0;

	return (
		<div className="space-y-2">
			<FilePathHeader path={path} variant="default" />

			{(offset || limit) && (
				<div className="text-[10px] text-[var(--text-muted)] flex items-center gap-2">
					{offset && <span>from line {offset}</span>}
					{limit && <span>• {limit} lines</span>}
				</div>
			)}

			{rawResult && !hasError && (
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Content</span>
						<span className="text-[9px] text-[var(--text-muted)]">{lineCount} lines</span>
					</div>
					<CodeBlock code={rawResult} maxHeight="250px" showLineNumbers />
				</div>
			)}

			{hasError && rawResult && (
				<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
					<div className="flex items-center gap-1.5 text-[10px] text-[var(--color-error)] font-medium mb-1">
						<AlertCircle className="w-3 h-3" />
						Error
					</div>
					<code className="text-[11px] text-[var(--text-secondary)] font-mono">{rawResult}</code>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// WRITE TOOL
// =============================================================================

export function WriteExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const path = input.filePath || 'unknown';
	const fileName = path.split('/').pop() || path;
	const content = rawInput?.content ? String(rawInput.content) : input.content || '';
	const hasError = rawResult?.toLowerCase().includes('error');

	const ext = fileName.split('.').pop()?.toLowerCase();
	const langMap: Record<string, string> = {
		ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
		py: 'python', rs: 'rust', go: 'go', md: 'markdown', json: 'json',
		css: 'css', html: 'html', sql: 'sql', sh: 'bash', yml: 'yaml', yaml: 'yaml'
	};
	const language = ext ? langMap[ext] : undefined;
	const lineCount = content ? content.split('\n').length : 0;

	return (
		<div className="space-y-2">
			<FilePathHeader path={path} variant="success" />

			{content && (
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Content</span>
						<span className="text-[9px] text-[var(--text-muted)]">{lineCount} lines</span>
					</div>
					<CodeBlock
						code={content.slice(0, 3000) + (content.length > 3000 ? '\n...' : '')}
						language={language}
						maxHeight="250px"
						showLineNumbers
					/>
				</div>
			)}

			{rawResult && (
				<div className={`text-[10px] flex items-center gap-1.5 ${hasError ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
					{hasError ? <AlertCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
					{hasError ? rawResult : '✓ Written'}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// EDIT TOOL (search_replace)
// =============================================================================

export function EditExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const path = input.filePath || 'unknown';
	const oldString = rawInput?.old_string ? String(rawInput.old_string) : '';
	const newString = rawInput?.new_string ? String(rawInput.new_string) : '';
	const replaceAll = Boolean(rawInput?.replace_all);
	const hasError = rawResult?.toLowerCase().includes('error');

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
						<span className="text-[var(--color-error)]">−{oldLines} lines</span>
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
					{hasError ? rawResult : '✓ Edited'}
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
	const hasError = rawResult?.toLowerCase().includes('error');

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
	const hasError = rawResult?.toLowerCase().includes('error');

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
					✓ Found {matchInfo}
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
	const hasError = rawResult?.toLowerCase().includes('error');

	return (
		<div className="space-y-3">
			{query && (
				<InfoBox icon={Search} color="var(--color-info)">
					"{query}"
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
	const hasError = rawResult?.toLowerCase().includes('error');

	if (!Array.isArray(todos)) {
		return null; // Will fall back to default
	}

	const statusColors: Record<string, string> = {
		'in_progress': 'var(--color-primary)',
		'pending': 'var(--text-muted)',
		'completed': 'var(--color-success)',
		'cancelled': 'var(--color-error)',
	};

	const statusIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties; }>> = {
		'in_progress': Play,
		'pending': Clock,
		'completed': Check,
		'cancelled': Square,
	};

	return (
		<div className="space-y-3">
			<SectionHeader>Tasks</SectionHeader>
			<div className="space-y-1">
				{(todos as Array<{ content?: string; status?: string; }>).map((todo, i) => {
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
					<span className="text-[10px] text-[var(--color-success)]">✓ Updated</span>
				)
			)}
		</div>
	);
}

// =============================================================================
// EXPORT MAP
// =============================================================================

export const coreExpandedViews = {
	// File operations
	Read: ReadExpanded,
	Write: WriteExpanded,
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

