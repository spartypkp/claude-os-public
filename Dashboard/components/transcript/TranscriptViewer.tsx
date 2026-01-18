'use client';

import { WorkerInlineCard } from '@/components/shared/WorkerInlineCard';
import { ToolChip } from '@/components/transcript/tools';
import type { TranscriptEvent } from '@/hooks/useTranscriptStream';
import { getRoleConfig } from '@/lib/sessionUtils';
import { isSystemMessage, summarizeSystemMessage } from '@/lib/systemMessages';
import type { LucideIcon } from 'lucide-react';
import {
	ArrowDown, // mail


















	// MCP Voice
	AudioLines, // done
	Bell, // leetcode
	BookOpen,
	Brain, // dsa


















	// MCP Apple
	Calendar,
	Check, // reset
	CheckCircle,
	ChevronDown,
	ChevronRight, // mock
	Code, // worker
	Contact,
	Copy,
	Download, // converse
	ExternalLink,
	FileEdit,
	FilePlus,
	FileText,
	Folder,
	GitBranch,
	Globe,
	// MCP Life System
	HardHat,
	ListChecks,
	Loader2, // messages
	Mail, // calendar
	MessageSquare, // log


















	// MCP Job Search
	Mic, // ping, remind
	Moon, // priority
	Network, // context_check
	PenLine, // night_mode_start
	PieChart, // status
	Radio,
	RefreshCw,
	Search, // team
	Server, // contact
	Star,
	Terminal, // service
	Timer,
	Wrench,
	X
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// =============================================================================
// TYPES
// =============================================================================

interface TranscriptViewerProps {
	events: TranscriptEvent[];
	isConnected?: boolean;
	role?: string;
	activityIndicator?: React.ReactNode;
	/** Pagination state for "Load earlier" functionality */
	pagination?: {
		hasEarlier: boolean;
		isLoadingEarlier: boolean;
		totalSessionCount: number;
		loadedSessionCount: number;
	};
	/** Callback to load earlier history */
	onLoadEarlier?: () => void;
}

interface ToolWithResult {
	use: TranscriptEvent;
	result?: TranscriptEvent;
}

interface ToolBatch {
	id: string;
	toolName: string;
	targetFile?: string;
	tools: { event: TranscriptEvent; result?: TranscriptEvent; }[];
}

interface Turn {
	id: string;
	type?: 'normal' | 'session_boundary';  // Jan 2026: support session boundaries
	userMessage?: TranscriptEvent;
	responseEvents: TranscriptEvent[];
	toolsWithResults: Map<string, TranscriptEvent>; // toolUseId -> tool_result
	// Session boundary metadata (when type === 'session_boundary')
	boundaryEvent?: TranscriptEvent;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string; }>> = {
	// Claude Code native tools
	Read: FileText,
	Write: FilePlus,
	Edit: FileEdit,
	Bash: Terminal,
	Grep: Search,
	Glob: Folder,
	WebSearch: Globe,
	WebFetch: Download,
	Task: GitBranch,
	TodoWrite: ListChecks,
	// MCP Life System - consolidated
	worker: HardHat,
	contact: Contact,
	priority: Star,
	team: Network,
	service: Server,
	timer: Timer,
	// MCP Life System - standalone
	status: Radio,
	reset: RefreshCw,
	done: CheckCircle,
	ping: Bell,
	night_mode_start: Moon,
	context_check: PieChart,
	log: PenLine,
	remind: Bell,
	// MCP Job Search
	mock: Mic,
	dsa: BookOpen,
	leetcode: Code,
	// MCP Apple
	calendar: Calendar,
	messages: MessageSquare,
	mail: Mail,
	// MCP Voice
	converse: AudioLines,
};

const TOOL_COLORS: Record<string, string> = {
	// Claude Code native tools
	Read: 'var(--color-cyan)',
	Glob: 'var(--color-cyan)',
	Grep: 'var(--color-info)',
	Write: 'var(--color-warning)',
	Edit: 'var(--color-warning)',
	Bash: 'var(--color-primary)',
	WebSearch: 'var(--color-success)',
	WebFetch: 'var(--color-success)',
	Task: 'var(--color-primary)',
	TodoWrite: 'var(--color-primary)',
	// MCP Life System - consolidated (teal/cyan family)
	worker: '#14b8a6',      // teal-500
	contact: '#06b6d4',     // cyan-500
	priority: '#f59e0b',    // amber-500
	team: '#8b5cf6',        // violet-500
	service: '#64748b',     // slate-500
	timer: '#ec4899',       // pink-500
	// MCP Life System - standalone
	status: 'var(--color-claude)',  // claude orange
	reset: '#f97316',       // orange-500
	done: '#22c55e',        // green-500
	ping: '#eab308',        // yellow-500
	night_mode_start: '#6366f1', // indigo-500
	context_check: '#3b82f6', // blue-500
	log: '#64748b',         // slate-500
	remind: '#eab308',      // yellow-500
	// MCP Job Search (purple family)
	mock: '#a855f7',        // purple-500
	dsa: '#8b5cf6',         // violet-500
	leetcode: '#7c3aed',    // violet-600
	// MCP Apple (blue family)
	calendar: '#3b82f6',    // blue-500
	messages: '#22c55e',    // green-500
	mail: '#ef4444',        // red-500
	// MCP Voice
	converse: '#f97316',    // orange-500
};

/**
 * Small inline Claude logo for chat labels
 */
function ClaudeLogo({ className = "w-3 h-3" }: { className?: string; }) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
		</svg>
	);
}

/**
 * Custom link component for ReactMarkdown - styled and opens in new tab
 */
function MarkdownLink({ href, children }: { href?: string; children?: React.ReactNode; }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 underline underline-offset-2 decoration-[var(--color-primary)]/40 hover:decoration-[var(--color-primary)] transition-colors inline-flex items-center gap-0.5"
		>
			{children}
			<ExternalLink className="w-3 h-3 opacity-60" />
		</a>
	);
}

/**
 * Shared ReactMarkdown config for consistent link handling
 */
const MARKDOWN_COMPONENTS = {
	a: MarkdownLink,
};

// =============================================================================
// UTILITIES
// =============================================================================

function formatTime(timestamp?: string): string {
	if (!timestamp) return '';
	try {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		});
	} catch {
		return '';
	}
}

/**
 * Detect if a tool call is a worker create operation and extract worker info.
 * Returns null if not a worker create, otherwise returns worker details.
 */
function getWorkerCreateInfo(
	toolName?: string,
	toolInput?: Record<string, unknown>,
	resultContent?: string
): { workerId: string; shortId: string; instructionsPreview?: string; } | null {
	// Check if this is a worker tool with create operation
	const formattedName = toolName ? formatToolName(toolName) : '';
	if (formattedName !== 'worker') return null;
	if (toolInput?.operation !== 'create') return null;
	if (!resultContent) return null;

	// Parse the result to get worker_id
	try {
		const result = JSON.parse(resultContent);
		if (result.success && result.worker_id) {
			return {
				workerId: result.worker_id,
				shortId: result.short_id || result.worker_id.slice(0, 8),
				instructionsPreview: toolInput.instructions
					? String(toolInput.instructions).slice(0, 100)
					: undefined,
			};
		}
	} catch {
		// Not JSON or parse error - try to extract worker_id from text
		const match = resultContent.match(/worker_id['":\s]+([a-f0-9-]+)/i);
		if (match) {
			return {
				workerId: match[1],
				shortId: match[1].slice(0, 8),
				instructionsPreview: toolInput?.instructions
					? String(toolInput.instructions).slice(0, 100)
					: undefined,
			};
		}
	}

	return null;
}

/**
 * Extract just the filename from a path for display
 */
function getFileName(path: string): string {
	const parts = path.split('/');
	return parts[parts.length - 1] || path;
}

/**
 * Smart path truncation: show filename, optionally with parent context
 * e.g., "CLAUDE.md" or "components/TranscriptViewer.tsx"
 */
function smartTruncatePath(path: string, maxLen: number = 40): string {
	const parts = path.split('/');
	const fileName = parts[parts.length - 1] || path;

	// If just filename fits, return it
	if (fileName.length <= maxLen) {
		// Try to include parent folder if it fits
		if (parts.length >= 2) {
			const withParent = parts.slice(-2).join('/');
			if (withParent.length <= maxLen) {
				return withParent;
			}
		}
		return fileName;
	}

	// Truncate filename if too long
	return fileName.slice(0, maxLen - 3) + '...';
}

/**
 * Clean up tool name for display.
 * - Strips mcp__ prefix and server name (e.g., mcp__life__worker → worker)
 * - Returns short, readable name
 */
function formatToolName(toolName: string): string {
	// Handle MCP tools: mcp__server__tool → tool
	if (toolName.startsWith('mcp__')) {
		const parts = toolName.split('__');
		return parts[parts.length - 1] || toolName;
	}
	return toolName;
}

/**
 * Group events into turns. A turn = user message + all assistant events until next user message.
 * Jan 2026: Also handles session_boundary events for cross-session conversation history.
 * Merges handoff system messages into the boundary they follow.
 */
function groupEventsIntoTurns(events: TranscriptEvent[]): Turn[] {
	const turns: Turn[] = [];
	let currentTurn: Turn | null = null;
	let lastBoundaryTurn: Turn | null = null; // Track last boundary to merge handoff into

	for (const event of events) {
		// Handle session boundaries (Jan 2026 - conversation history across resets)
		if (event.type === 'session_boundary') {
			// Save current turn if exists
			if (currentTurn) {
				turns.push(currentTurn);
				currentTurn = null;
			}
			// Add boundary as a special turn
			const boundaryTurn: Turn = {
				id: event.uuid || `boundary-${turns.length}`,
				type: 'session_boundary',
				responseEvents: [],
				toolsWithResults: new Map(),
				boundaryEvent: event,
			};
			turns.push(boundaryTurn);
			lastBoundaryTurn = boundaryTurn; // Track it for potential handoff merge
		} else if (event.type === 'user_message') {
			const content = event.content || '';
			const isHandoff = isSystemMessage(content);

			// If this is a handoff/system message right after a boundary, merge it
			if (isHandoff && lastBoundaryTurn && !lastBoundaryTurn.userMessage) {
				// Attach the handoff content to the boundary
				lastBoundaryTurn.userMessage = event;
				lastBoundaryTurn = null; // Don't merge multiple
				// Don't start a new turn - skip this user message
				continue;
			}

			lastBoundaryTurn = null; // Clear - no longer right after boundary

			// Save current turn if exists
			if (currentTurn) {
				turns.push(currentTurn);
			}
			// Start new turn
			currentTurn = {
				id: event.uuid || `turn-${turns.length}`,
				type: 'normal',
				userMessage: event,
				responseEvents: [],
				toolsWithResults: new Map(),
			};
		} else if (event.type === 'tool_result') {
			lastBoundaryTurn = null; // Clear on any other event
			// Attach result to its tool_use via toolUseId
			if (currentTurn && event.toolUseId) {
				currentTurn.toolsWithResults.set(event.toolUseId, event);
			} else if (!currentTurn) {
				// Edge case: result before any user message - use unique ID
				currentTurn = {
					id: event.uuid || `orphan-result-${turns.length}-${Date.now()}`,
					type: 'normal',
					responseEvents: [],
					toolsWithResults: new Map(),
				};
				if (event.toolUseId) {
					currentTurn.toolsWithResults.set(event.toolUseId, event);
				}
			}
		} else if (event.type === 'text' || event.type === 'thinking' || event.type === 'tool_use') {
			lastBoundaryTurn = null; // Clear on any other event
			if (!currentTurn) {
				// Events before first user message - use unique ID
				currentTurn = {
					id: event.uuid || `orphan-event-${turns.length}-${Date.now()}`,
					type: 'normal',
					responseEvents: [],
					toolsWithResults: new Map(),
				};
			}
			currentTurn.responseEvents.push(event);
		}
		// Skip 'system' and other event types
	}

	// Don't forget the last turn
	if (currentTurn) {
		turns.push(currentTurn);
	}

	return turns;
}

/**
 * Group consecutive tool_use events into batches for collapsed display.
 * Tools are batched if they have the same toolName AND same target file (if applicable).
 */
function groupToolsIntoBatches(
	events: TranscriptEvent[],
	toolResults: Map<string, TranscriptEvent>
): (TranscriptEvent | ToolBatch)[] {
	const result: (TranscriptEvent | ToolBatch)[] = [];
	let currentBatch: ToolBatch | null = null;

	for (const event of events) {
		if (event.type !== 'tool_use') {
			// Non-tool event - flush current batch and add event
			if (currentBatch) {
				result.push(currentBatch);
				currentBatch = null;
			}
			result.push(event);
			continue;
		}

		// It's a tool_use event
		const toolName = event.toolName || 'Unknown';
		const toolInput = event.toolInput as Record<string, unknown> | undefined;
		const targetFile = toolInput?.file_path
			? getFileName(String(toolInput.file_path))
			: undefined;
		const toolResult = event.toolUseId ? toolResults.get(event.toolUseId) : undefined;

		// Check if this tool can be batched with current batch
		const canBatch =
			currentBatch &&
			currentBatch.toolName === toolName &&
			currentBatch.targetFile === targetFile &&
			targetFile !== undefined; // Only batch if there's a file target

		if (canBatch && currentBatch) {
			// Add to existing batch
			currentBatch.tools.push({ event, result: toolResult });
		} else {
			// Flush current batch if exists
			if (currentBatch) {
				result.push(currentBatch);
			}

			// Start new batch or add single tool
			if (targetFile) {
				currentBatch = {
					id: event.uuid || `batch-${result.length}`,
					toolName,
					targetFile,
					tools: [{ event, result: toolResult }],
				};
			} else {
				// No file target - don't batch, add as single event
				currentBatch = null;
				result.push(event);
			}
		}
	}

	// Flush final batch
	if (currentBatch) {
		result.push(currentBatch);
	}

	return result;
}

/**
 * Type guard to check if an item is a ToolBatch
 */
function isToolBatch(item: TranscriptEvent | ToolBatch): item is ToolBatch {
	return 'tools' in item && Array.isArray(item.tools);
}

// =============================================================================
// COMPONENTS
// =============================================================================

function CodeBlock({ code, language }: { code: string; language?: string; }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="relative group my-2">
			{/* Header bar with language + copy */}
			<div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-muted)] border border-[var(--border-subtle)] border-b-0 rounded-t-lg">
				<span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
					{language || 'code'}
				</span>
				<button
					onClick={handleCopy}
					className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-accent)] transition-colors"
					aria-label={copied ? 'Copied!' : 'Copy code'}
				>
					{copied ? (
						<>
							<Check className="w-3 h-3 text-[var(--color-success)]" />
							<span className="text-[var(--color-success)]">Copied</span>
						</>
					) : (
						<>
							<Copy className="w-3 h-3" />
							<span>Copy</span>
						</>
					)}
				</button>
			</div>
			<pre className="font-mono text-[12px] bg-[var(--surface-base)] p-3 rounded-b-lg overflow-x-auto border border-[var(--border-subtle)] border-t-0 text-[var(--text-secondary)]">
				<code>{code}</code>
			</pre>
		</div>
	);
}

function parseContentWithCodeBlocks(content: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
	let lastIndex = 0;
	let match;

	while ((match = codeBlockRegex.exec(content)) !== null) {
		if (match.index > lastIndex) {
			const textBefore = content.slice(lastIndex, match.index);
			if (textBefore.trim()) {
				parts.push(
					<div key={`text-${lastIndex}`} className="[&_p]:!my-0 [&_p]:!leading-snug">
						<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
							{textBefore}
						</ReactMarkdown>
					</div>
				);
			}
		}

		parts.push(
			<CodeBlock key={`code-${match.index}`} code={match[2]} language={match[1] || undefined} />
		);

		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < content.length) {
		const remaining = content.slice(lastIndex);
		if (remaining.trim()) {
			parts.push(
				<div key={`text-${lastIndex}`} className="[&_p]:!my-0 [&_p]:!leading-snug">
					<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
						{remaining}
					</ReactMarkdown>
				</div>
			);
		}
	}

	if (parts.length === 0) {
		return [
			<div key="content" className="[&_p]:!my-0 [&_p]:!leading-snug">
				<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
					{content}
				</ReactMarkdown>
			</div>
		];
	}

	return parts;
}

/**
 * User message bubble - right aligned with accent color
 */
const UserMessage = memo(function UserMessage({ content, timestamp }: { content: string; timestamp?: string; }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// Format timestamp as "3:42 PM"
	const formattedTime = timestamp ? (() => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} catch {
			return '';
		}
	})() : '';

	return (
		<div className="flex justify-end mb-4 group/user">
			<div className="max-w-[85%] relative">
				{/* Copy button - subtle, appears on hover */}
				<button
					onClick={handleCopy}
					className="absolute top-1/2 -translate-y-1/2 -left-8 opacity-0 group-hover/user:opacity-100
            p-1.5 rounded-full hover:bg-[var(--surface-accent)] transition-all duration-150"
					aria-label={copied ? 'Copied!' : 'Copy message'}
				>
					{copied ? (
						<Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
					) : (
						<Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
					)}
				</button>
				{/* Message bubble */}
				<div className="bg-[var(--color-primary)] text-white px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-2xl rounded-br-md shadow-sm">
					{content}
				</div>
				{/* Timestamp */}
				{formattedTime && (
					<div className="flex justify-end mt-1 mr-1">
						<span className="text-[10px] text-[var(--text-muted)]">{formattedTime}</span>
					</div>
				)}
			</div>
		</div>
	);
});

/**
 * System message - center aligned, compact, muted
 * For handoffs, wakes, worker notifications, session context
 */
function SystemMessage({
	content,
	isExpanded,
	onToggle,
}: {
	content: string;
	isExpanded?: boolean;
	onToggle?: () => void;
}) {
	const { icon, summary } = summarizeSystemMessage(content);

	return (
		<div className="flex justify-center my-3">
			<div className="flex items-center gap-3 max-w-[90%]">
				{/* Decorative line left */}
				<div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-transparent to-[var(--border-subtle)]" />

				{/* System pill */}
				<button
					onClick={onToggle}
					disabled={!onToggle}
					className={`
						group flex items-center gap-2 px-3 py-1.5 text-[11px]
						text-[var(--text-muted)] bg-[var(--surface-subtle)]
						border border-[var(--border-subtle)] rounded-full
						${onToggle ? 'hover:bg-[var(--surface-accent)] hover:border-[var(--border-default)] cursor-pointer' : 'cursor-default'}
						transition-all duration-150
					`}
				>
					<span className="text-sm">{icon}</span>
					<span className="font-medium">{summary}</span>
					{onToggle && (
						<ChevronDown
							className={`w-3 h-3 opacity-50 group-hover:opacity-100 transition-all duration-150 ${isExpanded ? 'rotate-180' : ''}`}
						/>
					)}
				</button>

				{/* Decorative line right */}
				<div className="hidden sm:block flex-1 h-px bg-gradient-to-l from-transparent to-[var(--border-subtle)]" />
			</div>
		</div>
	);
}

/**
 * Tool display wrapper - uses new modular ToolChip system
 */
function ToolOneLiner({
	event,
	result,
	isExpanded,
	onToggle,
}: {
	event: TranscriptEvent;
	result?: TranscriptEvent;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const toolName = event.toolName || 'Unknown';
	const formattedName = formatToolName(toolName);
	const Icon = TOOL_ICONS[formattedName] || TOOL_ICONS[toolName] || Wrench;
	const color = TOOL_COLORS[formattedName] || TOOL_COLORS[toolName] || 'var(--text-tertiary)';

	// Check if this is a worker create - show inline card instead
	const workerInfo = getWorkerCreateInfo(
		toolName,
		event.toolInput as Record<string, unknown>,
		result?.content
	);

	if (workerInfo) {
		return (
			<WorkerInlineCard
				workerId={workerInfo.workerId}
				shortId={workerInfo.shortId}
				instructionsPreview={workerInfo.instructionsPreview}
			/>
		);
	}

	return (
		<ToolChip
			toolName={toolName}
			formattedName={formattedName}
			icon={Icon}
			color={color}
			toolInput={event.toolInput as Record<string, unknown> | undefined}
			resultContent={result?.content}
			isExpanded={isExpanded}
			onToggle={onToggle}
		/>
	);
}

/**
 * Batched tools - shows "file.tsx ×3" in a clean chip
 */
function ToolBatchDisplay({
	batch,
	isExpanded,
	onToggle,
	expandedTools,
	onToggleTool,
}: {
	batch: ToolBatch;
	isExpanded: boolean;
	onToggle: () => void;
	expandedTools: Set<string>;
	onToggleTool: (id: string) => void;
}) {
	const formattedName = formatToolName(batch.toolName);
	const Icon = TOOL_ICONS[formattedName] || TOOL_ICONS[batch.toolName] || Wrench;
	const color = TOOL_COLORS[formattedName] || TOOL_COLORS[batch.toolName] || 'var(--text-tertiary)';
	const hasErrors = batch.tools.some(
		t => t.result?.content?.includes('error') || t.result?.content?.includes('Error')
	);
	const isRunning = batch.tools.some(t => !t.result);

	// For single-item batches, just render as normal ToolOneLiner
	if (batch.tools.length === 1) {
		const tool = batch.tools[0];
		const toolId = tool.event.toolUseId || tool.event.uuid || batch.id;
		return (
			<ToolOneLiner
				event={tool.event}
				result={tool.result}
				isExpanded={expandedTools.has(toolId)}
				onToggle={() => onToggleTool(toolId)}
			/>
		);
	}

	return (
		<div className="my-1">
			<button
				onClick={onToggle}
				className={`
          group inline-flex items-center gap-1.5 py-1 px-2 rounded-md text-left
          transition-all duration-150
          ${isExpanded
						? 'bg-[var(--surface-accent)] ring-1 ring-[var(--border-default)]'
						: 'bg-[var(--surface-base)] hover:bg-[var(--surface-accent)]'
					}
          ${hasErrors ? 'ring-1 ring-[var(--color-error)]/30' : ''}
        `}
			>
				{/* Icon with subtle background */}
				<span
					className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
					style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
				>
					{isRunning ? (
						<Loader2 className="w-3 h-3 animate-spin" />
					) : (
						<Icon className="w-3 h-3" />
					)}
				</span>

				{/* Filename */}
				<span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[180px] font-mono">
					{batch.targetFile}
				</span>

				{/* Count badge */}
				<span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded flex-shrink-0">
					×{batch.tools.length}
				</span>

				{/* Error indicator */}
				{hasErrors && (
					<X className="w-3 h-3 text-[var(--color-error)] flex-shrink-0" />
				)}

				{/* Expand indicator */}
				<ChevronRight
					className={`w-3 h-3 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''
						}`}
				/>
			</button>

			{/* Expanded: show individual tools */}
			{isExpanded && (
				<div className="mt-1.5 ml-2 pl-3 border-l-2 border-[var(--border-subtle)] space-y-1">
					{batch.tools.map((tool, idx) => {
						const toolId = tool.event.toolUseId || tool.event.uuid || `${batch.id}-${idx}`;
						return (
							<ToolOneLiner
								key={toolId}
								event={tool.event}
								result={tool.result}
								isExpanded={expandedTools.has(toolId)}
								onToggle={() => onToggleTool(toolId)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

/**
 * Thinking block - elegant collapsible display (Claude Code style)
 */
const ThinkingBlock = memo(function ThinkingBlock({
	thinking,
	isExpanded,
	onToggle,
}: {
	thinking: string;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	// Get first meaningful line for preview
	const preview = thinking.split('\n').find(l => l.trim())?.slice(0, 50) || '';

	return (
		<div className="my-1.5">
			<button
				onClick={onToggle}
				className={`
					group inline-flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-left
					transition-all duration-150
					${isExpanded
						? 'bg-[var(--color-claude)]/10 ring-1 ring-[var(--color-claude)]/25'
						: 'bg-[var(--surface-base)] hover:bg-[var(--color-claude)]/8 border border-transparent hover:border-[var(--color-claude)]/20'
					}
				`}
			>
				{/* Brain icon */}
				<span className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 bg-[var(--color-claude)]/15">
					<Brain className="w-3.5 h-3.5 text-[var(--color-claude)]" />
				</span>

				{/* Label + preview */}
				<span className="text-[11px] text-[var(--text-muted)]">
					<span className="font-medium">Thinking</span>
					{!isExpanded && preview && (
						<span className="italic ml-1.5 text-[var(--text-muted)]/70">
							{preview}{preview.length >= 50 ? '...' : ''}
						</span>
					)}
				</span>

				{/* Expand indicator */}
				<ChevronRight
					className={`w-3 h-3 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
				/>
			</button>

			{/* Expanded content */}
			{isExpanded && (
				<div className="mt-2 ml-2 pl-3.5 border-[var(--color-claude)]/30">
					<p className="text-[11px] text-[var(--text-tertiary)] whitespace-pre-wrap break-words leading-relaxed max-h-72 overflow-y-auto">
						{thinking}
					</p>
				</div>
			)}
		</div>
	);
});

/**
 * Text content block with copy button
 */
const TextBlock = memo(function TextBlock({ content }: { content: string; }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const parsedContent = useMemo(() => parseContentWithCodeBlocks(content), [content]);

	return (
		<div className="relative group/text">
			{/* Copy button - inline right, appears on hover */}
			<button
				onClick={handleCopy}
				className="absolute top-0 right-0 opacity-0 group-hover/text:opacity-100
          p-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-all duration-150"
				aria-label={copied ? 'Copied!' : 'Copy message'}
			>
				{copied ? (
					<Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
				) : (
					<Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				)}
			</button>
			<div className="text-[13px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words pr-8">
				{parsedContent}
			</div>
		</div>
	);
});

/**
 * Session boundary marker - shown between sessions in a conversation (Jan 2026)
 * Shows context reset with handoff message if available.
 */
function SessionBoundary({ event, handoffMessage }: { event: TranscriptEvent; handoffMessage?: string; }) {
	const [isExpanded, setIsExpanded] = useState(false);

	// Format the timestamp nicely
	const formatBoundaryTime = (ts: string) => {
		try {
			const date = new Date(ts);
			return date.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} catch {
			return '';
		}
	};

	const time = event.timestamp ? formatBoundaryTime(event.timestamp) : '';
	// Use handoff message if provided, fall back to event content
	const content = handoffMessage || event.content || '';

	// Extract handoff reason/summary from content
	const getHandoffSummary = (text: string): string => {
		// Try to extract reason from AUTO-HANDOFF format
		const reasonMatch = text.match(/Reason:\s*([^\n]+)/);
		if (reasonMatch) return reasonMatch[1].trim();

		// Try to extract from "Handoff:" prefix  
		const handoffMatch = text.match(/Handoff:\s*(\w+)/);
		if (handoffMatch) return handoffMatch[1].trim();

		// Try to extract session type (chief_cycle, etc)
		const sessionMatch = text.match(/SessionStart:\s*(\w+)/);
		if (sessionMatch) return sessionMatch[1].replace(/_/g, ' ');

		// Default: first meaningful line (skip brackets)
		const firstLine = text.split('\n').find(l => {
			const trimmed = l.trim();
			return trimmed && !trimmed.startsWith('[') && !trimmed.startsWith('<');
		});
		if (firstLine && firstLine.length < 60) return firstLine.trim();

		return '';
	};

	const summary = getHandoffSummary(content);
	const hasFullContent = content.length > 50; // Only expandable if substantial content

	return (
		<div className="py-4 my-2">
			{/* Main boundary indicator */}
			<div className="flex items-center gap-3">
				{/* Left gradient line */}
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border-default)]/50 to-[var(--border-default)]" />

				{/* Center badge - clickable if has content */}
				<button
					onClick={() => hasFullContent && setIsExpanded(!isExpanded)}
					disabled={!hasFullContent}
					className={`
						flex items-center gap-2 px-4 py-2 rounded-lg 
						bg-[var(--surface-muted)] border border-[var(--border-subtle)]
						${hasFullContent ? 'hover:bg-[var(--surface-accent)] hover:border-[var(--border-default)] cursor-pointer' : 'cursor-default'}
						transition-all duration-150
					`}
				>
					<RefreshCw className="w-3.5 h-3.5 text-[var(--color-warning)]" />
					<div className="flex flex-col items-start">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							Context Reset
						</span>
						{summary && (
							<span className="text-[11px] text-[var(--text-secondary)] max-w-[250px] truncate">
								{summary}
							</span>
						)}
					</div>
					{time && (
						<>
							<span className="w-1 h-1 rounded-full bg-[var(--text-muted)]/40" />
							<span className="text-[10px] text-[var(--text-muted)]">
								{time}
							</span>
						</>
					)}
					{hasFullContent && (
						<ChevronDown
							className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
						/>
					)}
				</button>

				{/* Right gradient line */}
				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[var(--border-default)]/50 to-[var(--border-default)]" />
			</div>

			{/* Expanded handoff content */}
			{isExpanded && content && (
				<div className="mt-3 mx-auto max-w-[500px]">
					<div className="bg-[var(--surface-base)] rounded-lg border border-[var(--border-subtle)] p-3">
						<pre className="text-[11px] text-[var(--text-tertiary)] whitespace-pre-wrap break-words font-mono leading-relaxed max-h-48 overflow-y-auto">
							{content}
						</pre>
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Complete turn: optional user message + assistant response with inline tools
 */
function TurnBlock({
	turn,
	roleIcon: RoleIcon,
	roleLabel,
	isFocused,
	onFocus,
}: {
	turn: Turn;
	roleIcon: LucideIcon;
	roleLabel: string;
	isFocused: boolean;
	onFocus: () => void;
}) {
	// Track which tools, batches, and thinking blocks are expanded
	const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
	const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
	const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());

	const toggleTool = (id: string) => {
		setExpandedTools(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleBatch = (id: string) => {
		setExpandedBatches(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleThinking = (id: string) => {
		setExpandedThinking(prev => {
			const next = new Set(prev);
			// Set contains expanded items (default collapsed)
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	// Check if this turn has any assistant response
	const hasResponse = turn.responseEvents.length > 0;

	// Group consecutive tool calls into batches
	const groupedEvents = useMemo(
		() => groupToolsIntoBatches(turn.responseEvents, turn.toolsWithResults),
		[turn.responseEvents, turn.toolsWithResults]
	);

	// Check if user message is actually a system injection
	const userContent = turn.userMessage?.content || '';
	const isSystem = turn.userMessage && isSystemMessage(userContent);

	return (
		<div className="mb-5" onClick={onFocus}>
			{/* User message or System message */}
			{turn.userMessage && (
				isSystem ? (
					<SystemMessage content={userContent} />
				) : (
					<UserMessage content={userContent} timestamp={turn.userMessage.timestamp} />
				)
			)}

			{/* Assistant response block - full width */}
			{hasResponse && (
				<div className="mb-3">
					{/* Role label - minimal */}
					<div className="flex items-center gap-1.5 mb-2.5">
						{roleLabel === 'Chief' ? (
							<ClaudeLogo className="w-4 h-4 text-[var(--color-claude)]" />
						) : (
							<RoleIcon className="w-4 h-4 text-[var(--color-claude)]" />
						)}
						<span className="text-[12px] font-medium text-[var(--text-muted)]">
							{roleLabel}
						</span>
					</div>

					{/* Content */}
					<div className="space-y-2 pl-0.5">
						{/* Render grouped events */}
						{groupedEvents.map((item, idx) => {
							// Handle batched tools
							if (isToolBatch(item)) {
								return (
									<ToolBatchDisplay
										key={item.id}
										batch={item}
										isExpanded={expandedBatches.has(item.id)}
										onToggle={() => toggleBatch(item.id)}
										expandedTools={expandedTools}
										onToggleTool={toggleTool}
									/>
								);
							}

							// Handle regular events
							const event = item;
							const key = event.uuid || `${turn.id}-${idx}`;

							if (event.type === 'text' && event.content) {
								return <TextBlock key={key} content={event.content} />;
							}

							if (event.type === 'thinking' && event.thinking) {
								return (
									<ThinkingBlock
										key={key}
										thinking={event.thinking}
										isExpanded={expandedThinking.has(key)} // In set = expanded (default collapsed)
										onToggle={() => toggleThinking(key)}
									/>
								);
							}

							if (event.type === 'tool_use') {
								const toolId = event.toolUseId || key;
								const result = event.toolUseId
									? turn.toolsWithResults.get(event.toolUseId)
									: undefined;

								return (
									<ToolOneLiner
										key={key}
										event={event}
										result={result}
										isExpanded={expandedTools.has(toolId)}
										onToggle={() => toggleTool(toolId)}
									/>
								);
							}

							return null;
						})}
					</div>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TranscriptViewer({ events, isConnected = false, role, activityIndicator, pagination, onLoadEarlier }: TranscriptViewerProps) {
	const roleConfig = getRoleConfig(role);
	const RoleIcon = roleConfig.icon;
	const containerRef = useRef<HTMLDivElement>(null);

	// Group events into turns
	const turns = useMemo(() => groupEventsIntoTurns(events), [events]);

	// Focus state
	const [focusedTurnIndex, setFocusedTurnIndex] = useState<number | null>(null);

	// Auto-scroll state: follow when at bottom, pause when scrolled up
	const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
	const [showScrollIndicator, setShowScrollIndicator] = useState(false);

	// Track scroll position to determine if at bottom
	const handleScroll = useCallback(() => {
		if (!containerRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
		setShouldAutoScroll(isAtBottom);
		setShowScrollIndicator(!isAtBottom && events.length > 0);
	}, [events.length]);

	// Auto-scroll when new events arrive (if at bottom)
	useEffect(() => {
		if (shouldAutoScroll && containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		} else if (!shouldAutoScroll && events.length > 0) {
			setShowScrollIndicator(true);
		}
	}, [events, shouldAutoScroll]);

	// Scroll to bottom button handler
	const scrollToBottom = useCallback(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
			setShouldAutoScroll(true);
			setShowScrollIndicator(false);
		}
	}, []);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle if no input is focused
			if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
				return;
			}

			switch (e.key) {
				case 'j':
				case 'ArrowDown':
					e.preventDefault();
					setFocusedTurnIndex(prev => {
						if (prev === null) return 0;
						return Math.min(prev + 1, turns.length - 1);
					});
					break;

				case 'k':
				case 'ArrowUp':
					e.preventDefault();
					setFocusedTurnIndex(prev => {
						if (prev === null) return turns.length - 1;
						return Math.max(prev - 1, 0);
					});
					break;

				case 'G':
					e.preventDefault();
					scrollToBottom();
					setFocusedTurnIndex(turns.length - 1);
					break;

				case 'z':
					e.preventDefault();
					// Collapse all - reset focus
					setFocusedTurnIndex(null);
					break;

				case 'Escape':
					e.preventDefault();
					setFocusedTurnIndex(null);
					break;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [turns.length, scrollToBottom]);

	// Scroll focused turn into view
	useEffect(() => {
		if (focusedTurnIndex !== null && containerRef.current) {
			const turnElements = containerRef.current.querySelectorAll('[data-turn-index]');
			const focusedElement = turnElements[focusedTurnIndex];
			if (focusedElement) {
				focusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		}
	}, [focusedTurnIndex]);

	// Empty state
	if (events.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
				{isConnected ? (
					<div className="flex flex-col items-center gap-4">
						<div className="p-4 rounded-2xl bg-[var(--color-claude)]/10 border border-[var(--color-claude)]/20">
							<RoleIcon className="w-7 h-7 text-[var(--color-claude)]" />
						</div>
						<div className="text-center">
							<p className="text-[13px] font-medium text-[var(--text-secondary)]">Ready</p>
							<p className="text-[12px] text-[var(--text-muted)] mt-0.5">Waiting for activity...</p>
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center gap-3">
						<Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
						<span className="text-[12px]">Connecting...</span>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="relative h-full">
			<div
				ref={containerRef}
				className="flex flex-col px-4 pt-4 pb-8 overflow-auto h-full"
				onScroll={handleScroll}
			>
				{/* Load earlier history button */}
				{pagination?.hasEarlier && onLoadEarlier && (
					<div className="flex justify-center mb-4">
						<button
							onClick={onLoadEarlier}
							disabled={pagination.isLoadingEarlier}
							className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium
								bg-[var(--surface-muted)] hover:bg-[var(--surface-accent)]
								text-[var(--text-secondary)] rounded-full
								border border-[var(--border-subtle)] hover:border-[var(--border-default)]
								transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{pagination.isLoadingEarlier ? (
								<>
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
									<span>Loading earlier...</span>
								</>
							) : (
								<>
									<RefreshCw className="w-3.5 h-3.5" />
									<span>Load earlier history</span>
									{pagination.totalSessionCount > pagination.loadedSessionCount && (
										<span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-accent)] px-1.5 py-0.5 rounded">
											{pagination.totalSessionCount - pagination.loadedSessionCount} more
										</span>
									)}
								</>
							)}
						</button>
					</div>
				)}

				{turns.map((turn, idx) => (
					<div key={turn.id} data-turn-index={idx}>
						{turn.type === 'session_boundary' ? (
							<SessionBoundary
								event={turn.boundaryEvent!}
								handoffMessage={turn.userMessage?.content}
							/>
						) : (
							<TurnBlock
								turn={turn}
								roleIcon={RoleIcon}
								roleLabel={roleConfig.label}
								isFocused={focusedTurnIndex === idx}
								onFocus={() => setFocusedTurnIndex(idx)}
							/>
						)}
					</div>
				))}

				{/* Activity indicator - shows thinking/tool execution inline with chat */}
				{activityIndicator && (
					<div className="mt-2 mb-4">
						{activityIndicator}
					</div>
				)}
			</div>

			{/* Scroll to bottom indicator */}
			{showScrollIndicator && (
				<button
					onClick={scrollToBottom}
					className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 
						bg-[var(--surface-muted)] hover:bg-[var(--surface-accent)] 
						text-[12px] font-medium text-[var(--text-secondary)] 
						rounded-full shadow-lg border border-[var(--border-default)] 
						transition-all duration-150 hover:shadow-xl"
				>
					<ArrowDown className="w-3.5 h-3.5" />
					<span>New messages</span>
				</button>
			)}
		</div>
	);
}

export default TranscriptViewer;
