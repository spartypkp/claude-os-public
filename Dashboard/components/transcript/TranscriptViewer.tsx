'use client';

import { ToolChip, SystemEventChip, getToolConfig } from '@/components/transcript/tools';
import type { TranscriptEvent } from '@/hooks/useConversation';
import { getRoleConfig } from '@/lib/sessionUtils';
import {
	isSystemMessage,
	isSpecialistNotification,
	isSpecialistReply,
	isTeamMessage,
	isTeamRequest,
	isTaskNotification,
	isContextMessage,
	isCaptureMessage,
	parseSpecialistNotification,
	parseSpecialistReply,
	parseTeamMessage,
	parseTeamRequest,
	parseTaskNotification,
	parseContextPrefix,
	parseCapturePrefix,
	summarizeSystemMessage,
	parseSystemPrefix,
	normalizeMessageContent,
} from '@/lib/systemMessages';
import type { LucideIcon } from 'lucide-react';
import type { HandoffPhase } from '@/hooks/useHandoffState';
import {
	AlertTriangle,
	ArrowDown,
	ArrowRight,
	Bell,
	Brain,
	Bug,
	Calendar,
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	Copy,
	ExternalLink,
	Info,
	Lightbulb,
	Loader2,
	Mail,
	MessageCircle,
	Monitor,
	Play,
	RefreshCw,
	Send,
	Timer,
	User,
	UserPlus,
	X,
	Zap,
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
	/** Current handoff phase for this conversation */
	handoffPhase?: HandoffPhase;
}

interface ToolBatch {
	id: string;
	toolName: string;
	targetFile?: string;
	tools: { event: TranscriptEvent; result?: TranscriptEvent; }[];
}

interface Turn {
	id: string;
	type?: 'normal' | 'session_boundary' | 'conversation_ended';
	userMessage?: TranscriptEvent;
	responseEvents: TranscriptEvent[];
	toolsWithResults: Map<string, TranscriptEvent>; // toolUseId -> tool_result
	// Session boundary metadata (when type === 'session_boundary')
	boundaryEvent?: TranscriptEvent;
	// Which mode this turn belongs to (tracked from boundary events)
	sessionMode?: string;
}

import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';

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

/**
 * Extract just the filename from a path for display
 */
function getFileName(path: string): string {
	const parts = path.split('/');
	return parts[parts.length - 1] || path;
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
 * Map from Lucide icon key strings (returned by summarizeSystemMessage)
 * to actual Lucide components.
 */
const SYSTEM_ICON_MAP: Record<string, LucideIcon> = {
	'clock': Clock,
	'timer': Timer,
	'calendar': Calendar,
	'alert-triangle': AlertTriangle,
	'refresh-cw': RefreshCw,
	'bell': Bell,
	'zap': Zap,
	'info': Info,
	'arrow-right': ArrowRight,
	'user-plus': UserPlus,
	'check': Check,
	'x-circle': X,
	'play': Play,
	'brain': Brain,
	'arrow-down': ArrowDown,
	'bug': Bug,
	'lightbulb': Lightbulb,
	'external-link': ExternalLink,
	'message-circle': MessageCircle,
};

/**
 * Group events into turns. A turn = user message + all assistant events until next user message.
 * Jan 2026: Also handles session_boundary events for cross-session conversation history.
 * Merges handoff system messages into the boundary they follow.
 */
function groupEventsIntoTurns(events: TranscriptEvent[]): Turn[] {
	const turns: Turn[] = [];
	let currentTurn: Turn | null = null;
	let lastBoundaryTurn: Turn | null = null; // Track last boundary to absorb system injections
	let seenRealContent = false; // Track if we've seen any real (non-system) content
	let currentMode: string | undefined; // Track session mode from boundary events

	for (const event of events) {
		// Handle conversation ended
		if (event.type === 'conversation_ended') {
			if (currentTurn) {
				turns.push(currentTurn);
				currentTurn = null;
			}
			turns.push({
				id: event.uuid || `ended-${turns.length}`,
				type: 'conversation_ended',
				responseEvents: [],
				toolsWithResults: new Map(),
				boundaryEvent: event,
			});
			lastBoundaryTurn = null;
			continue;
		}

		// Handle session boundaries (conversation history across resets)
		if (event.type === 'session_boundary') {
			// Save current turn if exists
			if (currentTurn) {
				turns.push(currentTurn);
				currentTurn = null;
			}

			// Update current mode from boundary
			currentMode = event.mode || (event as any).mode;

			// Add boundary as a special turn
			const boundaryTurn: Turn = {
				id: event.uuid || `boundary-${turns.length}`,
				type: 'session_boundary',
				responseEvents: [],
				toolsWithResults: new Map(),
				boundaryEvent: event,
			};
			turns.push(boundaryTurn);
			lastBoundaryTurn = boundaryTurn; // Track for absorbing post-boundary system messages
		} else if (event.type === 'user_message') {
			const content = normalizeMessageContent(event.content || '');
			const isSysMsg = isSystemMessage(content);

			// First system message after a boundary → merge as handoff content
			if (isSysMsg && lastBoundaryTurn && !lastBoundaryTurn.userMessage) {
				lastBoundaryTurn.userMessage = event;
				continue; // Keep lastBoundaryTurn — absorb more system messages
			}

			// Additional system messages after a boundary → absorb silently
			// (SessionStart, session-role injections are plumbing, not content)
			if (isSysMsg && lastBoundaryTurn) {
				continue;
			}

			// First message in conversation is a system injection (no boundary before it)
			// → create a synthetic "session_start" boundary
			if (isSysMsg && !seenRealContent && turns.length === 0 && !currentTurn) {
				const startBoundary: Turn = {
					id: event.uuid || `start-${turns.length}`,
					type: 'session_boundary',
					responseEvents: [],
					toolsWithResults: new Map(),
					boundaryEvent: {
						...event,
						type: 'session_boundary',
						boundary_type: 'session_start',
					} as TranscriptEvent,
					userMessage: event,
				};
				turns.push(startBoundary);
				lastBoundaryTurn = startBoundary; // Absorb subsequent system injections
				continue;
			}

			// Additional system messages at conversation start (after synthetic boundary)
			if (isSysMsg && lastBoundaryTurn) {
				continue;
			}

			lastBoundaryTurn = null; // Real user message — stop absorbing
			seenRealContent = true;

			// Save current turn if exists
			if (currentTurn) {
				turns.push(currentTurn);
			}
			// Start new turn — stamp with current session mode
			currentTurn = {
				id: event.uuid || `turn-${turns.length}`,
				type: 'normal',
				userMessage: event,
				responseEvents: [],
				toolsWithResults: new Map(),
				sessionMode: currentMode,
			};
		} else if (event.type === 'tool_result') {
			lastBoundaryTurn = null; // Real content — stop absorbing
			seenRealContent = true;
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
					sessionMode: currentMode,
				};
				if (event.toolUseId) {
					currentTurn.toolsWithResults.set(event.toolUseId, event);
				}
			}
		} else if (event.type === 'text' || event.type === 'thinking' || event.type === 'tool_use') {
			lastBoundaryTurn = null; // Real content — stop absorbing
			seenRealContent = true;

			if (!currentTurn) {
				// Events before first user message - use unique ID
				currentTurn = {
					id: event.uuid || `orphan-event-${turns.length}-${Date.now()}`,
					type: 'normal',
					responseEvents: [],
					toolsWithResults: new Map(),
					sessionMode: currentMode,
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
					id: event.toolUseId || event.uuid || `batch-${result.length}`,
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
 * Parse and strip source prefix from user messages.
 * Matches "[Dashboard HH:MM] " or "[Telegram HH:MM] " at the START of the message only.
 * Returns the source type and the clean message content.
 */
function parseMessageSource(content: string): { source: 'dashboard' | 'telegram' | null; displayContent: string } {
	const match = content.match(/^\[(Dashboard|Telegram) \d{1,2}:\d{2}\] /);
	if (!match) return { source: null, displayContent: content };
	return {
		source: match[1].toLowerCase() as 'dashboard' | 'telegram',
		displayContent: content.slice(match[0].length),
	};
}

/**
 * User message bubble - right aligned with accent color
 */
const UserMessage = memo(function UserMessage({ content, timestamp }: { content: string; timestamp?: string; }) {
	const [copied, setCopied] = useState(false);
	const { source, displayContent } = parseMessageSource(content);

	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		navigator.clipboard.writeText(displayContent);
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

	const SourceIcon = source === 'telegram' ? Send : source === 'dashboard' ? Monitor : null;

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
					{displayContent}
				</div>
				{/* Timestamp + source icon */}
				{(formattedTime || SourceIcon) && (
					<div className="flex items-center justify-end gap-1 mt-1 mr-1">
						{SourceIcon && (
							<SourceIcon className="w-2.5 h-2.5 text-[var(--text-muted)] opacity-60" />
						)}
						{formattedTime && (
							<span className="text-[10px] text-[var(--text-muted)]">{formattedTime}</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
});

/**
 * Wake Divider — tiny inline timestamp, nearly invisible.
 * Replaces the full pill treatment for WAKE messages.
 */
function WakeDivider({ timestamp }: { timestamp?: string }) {
	const formattedTime = timestamp ? (() => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch { return ''; }
	})() : '';

	return (
		<div className="flex items-center gap-3 my-1 px-4">
			<div className="flex-1 h-px bg-[var(--border-subtle)] opacity-40" />
			<div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] opacity-50">
				<Clock className="w-2.5 h-2.5" />
				{formattedTime && <span>{formattedTime}</span>}
			</div>
			<div className="flex-1 h-px bg-[var(--border-subtle)] opacity-40" />
		</div>
	);
}

/**
 * Warning Message — amber/red accent for WARNING and FORCE-HANDOFF.
 * Demands attention. Uses AlertTriangle icon.
 */
function WarningMessage({ content, timestamp }: { content: string; timestamp?: string }) {
	const { summary } = summarizeSystemMessage(content);
	const parsed = parseSystemPrefix(content);
	const isForceHandoff = parsed?.type === 'FORCE-HANDOFF';
	const color = isForceHandoff ? '#ef4444' : '#f59e0b';

	const formattedTime = timestamp ? (() => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch { return ''; }
	})() : '';

	return (
		<div className="flex justify-center my-2">
			<div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
				style={{
					color,
					backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
					border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
				}}>
				<AlertTriangle className="w-3 h-3" />
				<span className="font-medium">{summary}</span>
				{formattedTime && (
					<span className="text-[10px] opacity-60 ml-1">{formattedTime}</span>
				)}
			</div>
		</div>
	);
}

/**
 * System message — center aligned, compact, muted.
 * For handoffs, wakes, worker notifications, session context.
 *
 * variant='plumbing' — extra muted for CRON, INFO, session plumbing.
 */
function SystemMessage({
	content,
	isExpanded,
	onToggle,
	variant = 'default',
}: {
	content: string;
	isExpanded?: boolean;
	onToggle?: () => void;
	variant?: 'default' | 'plumbing';
}) {
	const { icon: iconKey, summary } = summarizeSystemMessage(content);
	const IconComponent = SYSTEM_ICON_MAP[iconKey];

	if (variant === 'plumbing') {
		return (
			<div className="flex justify-center my-1">
				<div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-[var(--text-muted)] opacity-50">
					{IconComponent && <IconComponent className="w-2.5 h-2.5" />}
					<span>{summary}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-center my-2">
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
					{IconComponent ? (
						<IconComponent className="w-3 h-3" />
					) : (
						<span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
					)}
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
 * Specialist Report — renders specialist completion/failure notifications
 * as a report card rather than a generic system pill.
 *
 * Shows role icon, pass/fail status, summary text, and workspace path.
 * Left-aligned like assistant messages but in a distinct card.
 */
function SpecialistReport({ content, timestamp }: { content: string; timestamp?: string }) {
	const notification = parseSpecialistNotification(content);
	if (!notification) return <SystemMessage content={content} />;

	const { role, sessionId, passed, summary, workspace } = notification;
	const roleConfig = getRoleConfig(role);
	const RoleIcon = roleConfig.icon;

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

	// Truncate session ID for display
	const shortId = sessionId.length > 20 ? sessionId.slice(0, 20) + '...' : sessionId;

	return (
		<div className="my-3">
			<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 max-w-[90%]">
				{/* Header: role icon + name + status + time */}
				<div className="flex items-center gap-2 mb-2">
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, #da7756 12%, transparent)' }}
					>
						<RoleIcon className="w-3.5 h-3.5 text-[#da7756]" />
					</div>
					<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
						{roleConfig.label}
					</span>
					{passed ? (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
							<Check className="w-3 h-3" />
							Passed
						</span>
					) : (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
							<X className="w-3 h-3" />
							Failed
						</span>
					)}
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>

				{/* Summary body */}
				{summary && (
					<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
						{summary}
					</p>
				)}

				{/* Workspace footer */}
				{workspace && (
					<div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center gap-1.5">
						<span className="text-[10px] text-[var(--text-muted)] font-mono truncate">
							{workspace}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Specialist Reply — renders injected "Reply from {role}" messages
 * as a chat-style card from the specialist.
 */
function SpecialistReplyCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const reply = parseSpecialistReply(content);
	if (!reply) return <SystemMessage content={content} />;

	const { role, sessionId, message } = reply;
	const roleConfig = getRoleConfig(role);
	const RoleIcon = roleConfig.icon;

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
		<div className="my-3">
			<div className="max-w-[90%]">
				{/* Header: role icon + name + session ID */}
				<div className="flex items-center gap-2 mb-1.5">
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, #da7756 12%, transparent)' }}
					>
						<RoleIcon className="w-3.5 h-3.5 text-[#da7756]" />
					</div>
					<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
						{roleConfig.label}
					</span>
					<span className="text-[10px] font-mono text-[var(--text-muted)]">
						{sessionId.slice(0, 8)}
					</span>
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>

				{/* Message bubble */}
				<div className="ml-7 rounded-lg border border-[#da7756]/15 bg-[#da7756]/5 px-3 py-2">
					<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
						{message}
					</p>
				</div>
			</div>
		</div>
	);
}

/**
 * Team Message Card — renders direct team communication between sessions.
 * Shows from→to header with role icons and direction arrow.
 * Format: [TEAM → Target] from Source: message
 */
function TeamMessageCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseTeamMessage(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { sourceRole, targetRole, message } = parsed;
	const sourceConfig = getRoleConfig(sourceRole);
	const targetConfig = getRoleConfig(targetRole);
	const SourceIcon = sourceConfig.icon;
	const TargetIcon = targetConfig.icon;

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
		<div className="my-3">
			<div className="max-w-[90%]">
				{/* Header: source → target with role icons */}
				<div className="flex items-center gap-2 mb-1.5">
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, #da7756 12%, transparent)' }}
					>
						<SourceIcon className="w-3.5 h-3.5 text-[#da7756]" />
					</div>
					<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
						{sourceConfig.label}
					</span>
					<ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, #da7756 12%, transparent)' }}
					>
						<TargetIcon className="w-3.5 h-3.5 text-[#da7756]" />
					</div>
					<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
						{targetConfig.label}
					</span>
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>

				{/* Message bubble */}
				<div className="ml-7 rounded-lg border border-[#da7756]/15 bg-[#da7756]/5 px-3 py-2">
					<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
						{message}
					</p>
				</div>
			</div>
		</div>
	);
}

/**
 * Team Request Card — renders spawn requests from non-Chief specialists.
 * Shows requesting role and what they want spawned.
 * Format: [TEAM REQUEST: Role wants OtherRole for "purpose"]
 */
function TeamRequestCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseTeamRequest(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { requestingRole, requestedRole, purpose } = parsed;
	const reqConfig = getRoleConfig(requestingRole);
	const ReqIcon = reqConfig.icon;

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
		<div className="my-3">
			<div className="rounded-lg border border-[#da7756]/20 bg-[#da7756]/5 p-3 max-w-[90%]">
				{/* Header: requesting role + badge */}
				<div className="flex items-center gap-2 mb-2">
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, #da7756 12%, transparent)' }}
					>
						<ReqIcon className="w-3.5 h-3.5 text-[#da7756]" />
					</div>
					<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
						{reqConfig.label}
					</span>
					<span className="flex items-center gap-0.5 text-[10px] font-medium text-[#da7756] bg-[#da7756]/10 px-1.5 py-0.5 rounded-full">
						Spawn Request
					</span>
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>

				{/* Request details */}
				<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
					Wants <span className="font-semibold capitalize">{requestedRole}</span> for &ldquo;{purpose}&rdquo;
				</p>
			</div>
		</div>
	);
}

/**
 * Task Notification Card — renders subagent completion results.
 * Collapsible: shows summary + stats in header, expands to full markdown result.
 */
function TaskNotificationCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const notification = parseTaskNotification(content);
	const [isExpanded, setIsExpanded] = useState(false);

	if (!notification) return <SystemMessage content={content} />;

	const { status, summary, result, totalTokens, toolUses, durationMs } = notification;
	const isSuccess = status === 'completed';

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

	// Format duration
	const duration = durationMs ? (
		durationMs > 60000
			? `${Math.round(durationMs / 60000)}m`
			: `${Math.round(durationMs / 1000)}s`
	) : null;

	// Strip "Agent " prefix from summary for cleaner display
	const cleanSummary = summary.replace(/^Agent "/, '"');

	return (
		<div className="my-3">
			<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] max-w-[90%] overflow-hidden">
				{/* Header — always visible */}
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className="w-full flex items-center gap-2 p-3 text-left hover:bg-[var(--surface-accent)] transition-colors"
				>
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, #3b82f6 12%, transparent)' }}
					>
						<Zap className="w-3.5 h-3.5 text-[#3b82f6]" />
					</div>

					<span className="text-[12px] font-semibold text-[var(--text-secondary)] flex-1 truncate">
						{cleanSummary}
					</span>

					{/* Status badge */}
					{isSuccess ? (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
							<Check className="w-3 h-3" />
						</span>
					) : (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
							<X className="w-3 h-3" />
						</span>
					)}

					{/* Stats */}
					<div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] flex-shrink-0">
						{duration && <span>{duration}</span>}
						{toolUses !== undefined && <span>{toolUses} tools</span>}
						{formattedTime && (
							<>
								<span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)]" />
								<span>{formattedTime}</span>
							</>
						)}
					</div>

					<ChevronRight
						className={`w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
					/>
				</button>

				{/* Expanded result */}
				{isExpanded && result && (
					<div className="border-t border-[var(--border-subtle)] px-4 py-3 max-h-96 overflow-y-auto">
						<div className="text-[12px] text-[var(--text-secondary)] leading-relaxed prose prose-sm prose-invert max-w-none
							[&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2
							[&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
							[&_p]:my-1.5 [&_li]:my-0.5 [&_ul]:my-1 [&_ol]:my-1
							[&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1
							[&_code]:text-[11px] [&_code]:bg-[var(--surface-muted)] [&_code]:px-1 [&_code]:rounded
							[&_hr]:my-3 [&_hr]:border-[var(--border-subtle)]
							[&_a]:text-[var(--color-primary)] [&_a]:underline">
							<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
								{result}
							</ReactMarkdown>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Context Card — renders [CONTEXT:App] messages from AttachToChat.
 * Visually distinct from user/system messages: left-aligned, app-tinted accent.
 */
function ContextCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseContextPrefix(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { app, body } = parsed;

	const appConfig: Record<string, { icon: typeof Mail; color: string }> = {
		Email: { icon: Mail, color: '#3b82f6' },
		Calendar: { icon: Calendar, color: '#f59e0b' },
		Contact: { icon: User, color: '#8b5cf6' },
		Project: { icon: Zap, color: '#10b981' },
	};
	const config = appConfig[app] || { icon: ExternalLink, color: '#6b7280' };
	const AppIcon = config.icon;

	const formattedTime = timestamp ? (() => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch { return ''; }
	})() : '';

	return (
		<div className="my-2">
			<div className="max-w-[90%]">
				{/* Header: app icon + badge */}
				<div className="flex items-center gap-2 mb-1.5">
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
					>
						<AppIcon className="w-3.5 h-3.5" style={{ color: config.color }} />
					</div>
					<span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
						style={{ color: config.color, backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)` }}>
						{app}
					</span>
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>

				{/* Context body */}
				<div className="ml-7 rounded-lg border px-3 py-2"
					style={{ borderColor: `color-mix(in srgb, ${config.color} 15%, transparent)`, backgroundColor: `color-mix(in srgb, ${config.color} 5%, transparent)` }}>
					<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
						{body}
					</p>
				</div>
			</div>
		</div>
	);
}

/**
 * Capture Card — renders [CAPTURE:TYPE] messages (drop, bug, idea, dump).
 * Type-specific accent colors.
 */
function CaptureCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseCapturePrefix(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { type, body } = parsed;

	const typeConfig: Record<string, { icon: typeof Bug; color: string; label: string }> = {
		BUG: { icon: Bug, color: '#ef4444', label: 'Bug' },
		IDEA: { icon: Lightbulb, color: '#8b5cf6', label: 'Idea' },
		DROP: { icon: ArrowDown, color: '#6b7280', label: 'Drop' },
		DUMP: { icon: Zap, color: '#6b7280', label: 'Brain Dump' },
	};
	const config = typeConfig[type] || { icon: Zap, color: '#6b7280', label: type };
	const TypeIcon = config.icon;

	const formattedTime = timestamp ? (() => {
		try {
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch { return ''; }
	})() : '';

	return (
		<div className="my-2">
			<div
				className="rounded-lg border-l-2 px-3 py-2 max-w-[90%]"
				style={{ borderLeftColor: config.color, backgroundColor: `color-mix(in srgb, ${config.color} 5%, transparent)` }}
			>
				<div className="flex items-center gap-2">
					<TypeIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: config.color }} />
					<span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
						{config.label}
					</span>
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>
				<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mt-1 whitespace-pre-wrap">
					{body}
				</p>
			</div>
		</div>
	);
}

/**
 * Tool display wrapper — routes to ToolChip or SystemEventChip based on registry category.
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
	const config = getToolConfig(formattedName);
	const Icon = config.icon;
	const color = config.color;

	// System events render as full-width muted bars
	if (config.category === 'system') {
		return (
			<SystemEventChip
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

	// Regular tools render as inline colored chips
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
	const config = getToolConfig(formattedName);
	const Icon = config.icon;
	const color = config.color;
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
 * Format mode names for display
 */
function formatModeName(mode: string): string {
	const modeMap: Record<string, string> = {
		'preparation': 'Preparation',
		'implementation': 'Implementation',
		'verification': 'Verification',
		'interactive': 'Interactive',
	};
	return modeMap[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * Format the timestamp nicely for boundaries
 */
function formatBoundaryTime(ts: string): string {
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
}

/** Specialist phase ordering */
const PHASE_ORDER = ['preparation', 'implementation', 'verification'] as const;
type Phase = typeof PHASE_ORDER[number];

/**
 * Mode Transition Boundary — shows phase progression bar for autonomous specialist flows.
 * e.g. Preparation ✓ → Implementation ● → Verification ○
 */
function ModeTransitionBoundary({ event }: { event: TranscriptEvent }) {
	const prevMode = (event as any).prev_mode as string | undefined;
	const currMode = (event as any).mode as string | undefined;
	const time = event.timestamp ? formatBoundaryTime(event.timestamp) : '';

	// Determine which phase we're entering
	const currPhaseIdx = PHASE_ORDER.indexOf(currMode as Phase);

	return (
		<div className="py-4 my-2">
			<div className="flex items-center gap-3">
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#da7756]/15 to-[#da7756]/25" />

				<div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--surface-base)] border-[0.5px] border-[#da7756]/20">
					{/* Phase progression bar */}
					<div className="flex items-center gap-1">
						{PHASE_ORDER.map((phase, idx) => {
							const isCompleted = idx < currPhaseIdx;
							const isCurrent = idx === currPhaseIdx;
							const isFuture = idx > currPhaseIdx;

							// Phase colors
							const phaseColors: Record<string, string> = {
								preparation: '#60a5fa',    // blue
								implementation: '#f59e0b', // amber
								verification: '#34d399',   // green
							};
							const color = phaseColors[phase] || 'var(--text-muted)';

							return (
								<div key={phase} className="flex items-center gap-1">
									{/* Connector line (not before first) */}
									{idx > 0 && (
										<div
											className="w-4 h-px"
											style={{
												backgroundColor: isCompleted || isCurrent
													? color
													: 'var(--border-subtle)',
												opacity: isCompleted || isCurrent ? 0.6 : 0.3,
											}}
										/>
									)}

									{/* Phase indicator */}
									<div className="flex items-center gap-1">
										{isCompleted ? (
											<Check className="w-3 h-3" style={{ color }} />
										) : isCurrent ? (
											<div
												className="w-2 h-2 rounded-full"
												style={{ backgroundColor: color }}
											/>
										) : (
											<div
												className="w-2 h-2 rounded-full border"
												style={{ borderColor: 'var(--text-muted)', opacity: 0.3 }}
											/>
										)}
										<span
											className="text-[10px] font-medium"
											style={{
												color: isFuture ? 'var(--text-muted)' : color,
												opacity: isFuture ? 0.4 : 1,
											}}
										>
											{formatModeName(phase).slice(0, 4)}
										</span>
									</div>
								</div>
							);
						})}
					</div>

					{/* Timestamp */}
					{time && (
						<>
							<span className="w-1 h-1 rounded-full bg-[#da7756]/30" />
							<span className="text-[10px] text-[#da7756]/50">{time}</span>
						</>
					)}
				</div>

				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#da7756]/15 to-[#da7756]/25" />
			</div>
		</div>
	);
}

/**
 * Reset Boundary — shown when a session calls reset() for context handoff.
 * Simple inline marker — no expand/collapse.
 */
function ResetBoundary({ event }: { event: TranscriptEvent }) {
	const time = event.timestamp ? formatBoundaryTime(event.timestamp) : '';

	return (
		<div className="py-4 my-2">
			<div className="flex items-center gap-3">
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#da7756]/15 to-[#da7756]/25" />

				<div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-base)] border-[0.5px] border-[#da7756]/20">
					<RefreshCw className="w-3.5 h-3.5 text-[#da7756]" />
					<span className="text-[10px] font-semibold uppercase tracking-wider text-[#da7756]/80">
						Context reset
					</span>
					{time && (
						<>
							<span className="w-1 h-1 rounded-full bg-[#da7756]/30" />
							<span className="text-[10px] text-[#da7756]/50">{time}</span>
						</>
					)}
				</div>

				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#da7756]/15 to-[#da7756]/25" />
			</div>
		</div>
	);
}

/**
 * Session Start Boundary — first session in a conversation.
 * Clean marker showing when the session began.
 */
function SessionStartBoundary({ event }: { event: TranscriptEvent }) {
	const time = event.timestamp ? formatBoundaryTime(event.timestamp) : '';
	return (
		<div className="py-4 my-2">
			<div className="flex items-center gap-3">
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#da7756]/15 to-[#da7756]/25" />
				<div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-base)] border-[0.5px] border-[#da7756]/20">
					<ClaudeLogo className="w-3.5 h-3.5 text-[#da7756]" />
					<span className="text-[10px] font-semibold uppercase tracking-wider text-[#da7756]/80">
						Session started
					</span>
					{time && (
						<>
							<span className="w-1 h-1 rounded-full bg-[#da7756]/30" />
							<span className="text-[10px] text-[#da7756]/50">{time}</span>
						</>
					)}
				</div>
				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#da7756]/15 to-[#da7756]/25" />
			</div>
		</div>
	);
}

/**
 * Conversation Ended — final bar when a conversation closes (done() with no next mode).
 */
function ConversationEnded({ event }: { event: TranscriptEvent }) {
	const time = event.timestamp ? formatBoundaryTime(event.timestamp) : '';
	return (
		<div className="py-4 my-2">
			<div className="flex items-center gap-3">
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#da7756]/15 to-[#da7756]/25" />
				<div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-base)] border-[0.5px] border-[#da7756]/20">
					<Check className="w-3.5 h-3.5 text-[#da7756]" />
					<span className="text-[10px] font-semibold uppercase tracking-wider text-[#da7756]/80">
						Session complete
					</span>
					{time && (
						<>
							<span className="w-1 h-1 rounded-full bg-[#da7756]/30" />
							<span className="text-[10px] text-[#da7756]/50">{time}</span>
						</>
					)}
				</div>
				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#da7756]/15 to-[#da7756]/25" />
			</div>
		</div>
	);
}

/**
 * Session boundary marker - dispatches to the right boundary component
 * based on boundary_type from the event metadata.
 *
 * All boundaries share the same visual structure: horizontal line + chip.
 * Variations: session_start (claude logo), mode_transition (phase bar),
 * summarizer (brain icon), reset (simple marker).
 */
function SessionBoundary({ event }: { event: TranscriptEvent }) {
	const boundaryType = (event as any).boundary_type || (event as any).boundaryType;

	if (boundaryType === 'session_start') {
		return <SessionStartBoundary event={event} />;
	}

	if (boundaryType === 'mode_transition') {
		return <ModeTransitionBoundary event={event} />;
	}

	if (boundaryType === 'summarizer') {
		// Memory Agent is a mode — use same structure as other boundaries
		const time = event.timestamp ? formatBoundaryTime(event.timestamp) : '';
		return (
			<div className="py-4 my-2">
				<div className="flex items-center gap-3">
					<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#da7756]/15 to-[#da7756]/25" />
					<div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-base)] border-[0.5px] border-[#da7756]/20">
						<Brain className="w-3.5 h-3.5 text-[#da7756]" />
						<span className="text-[10px] font-semibold uppercase tracking-wider text-[#da7756]/80">
							Memory Agent
						</span>
						{time && (
							<>
								<span className="w-1 h-1 rounded-full bg-[#da7756]/30" />
								<span className="text-[10px] text-[#da7756]/50">{time}</span>
							</>
						)}
					</div>
					<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#da7756]/15 to-[#da7756]/25" />
				</div>
			</div>
		);
	}

	return <ResetBoundary event={event} />;
}

/**
 * Complete turn: optional user message + assistant response with inline tools
 */
function TurnBlock({
	turn,
	roleIcon: DefaultRoleIcon,
	roleLabel: defaultRoleLabel,
	isFocused,
	onFocus,
}: {
	turn: Turn;
	roleIcon: LucideIcon;
	roleLabel: string;
	isFocused: boolean;
	onFocus: () => void;
}) {
	// Override icon/label for summarizer sessions (Memory Agent mode)
	const isSummarizer = turn.sessionMode === 'summarizer';
	const RoleIcon = isSummarizer ? Brain : DefaultRoleIcon;
	const roleLabel = isSummarizer ? 'Memory Agent' : defaultRoleLabel;
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

	// Auto-expand AskUserQuestion when it's waiting for input
	useEffect(() => {
		for (const event of turn.responseEvents) {
			if (event.type === 'tool_use') {
				const name = formatToolName(event.toolName || '');
				if (name === 'AskUserQuestion' && event.toolUseId) {
					const hasResult = turn.toolsWithResults.has(event.toolUseId);
					if (!hasResult) {
						setExpandedTools(prev => {
							if (prev.has(event.toolUseId!)) return prev;
							const next = new Set(prev);
							next.add(event.toolUseId!);
							return next;
						});
					}
				}
			}
		}
	}, [turn.responseEvents, turn.toolsWithResults]);

	// Check if this turn has any assistant response
	const hasResponse = turn.responseEvents.length > 0;

	// Group consecutive tool calls into batches
	const groupedEvents = useMemo(
		() => groupToolsIntoBatches(turn.responseEvents, turn.toolsWithResults),
		[turn.responseEvents, turn.toolsWithResults]
	);

	// Check if user message is actually a system injection
	const userContent = normalizeMessageContent(turn.userMessage?.content || '');
	const isSystem = turn.userMessage && isSystemMessage(userContent);
	const isContextMsg = isSystem && isContextMessage(userContent);
	const isCaptureMsg = isSystem && !isContextMsg && isCaptureMessage(userContent);
	const isSpecialistComplete = isSystem && !isContextMsg && !isCaptureMsg && isSpecialistNotification(userContent);
	const isReply = isSystem && !isContextMsg && !isCaptureMsg && !isSpecialistComplete && isSpecialistReply(userContent);
	const isTeamMsg = isSystem && !isContextMsg && !isCaptureMsg && !isSpecialistComplete && !isReply && isTeamMessage(userContent);
	const isTeamReq = isSystem && !isContextMsg && !isCaptureMsg && !isSpecialistComplete && !isReply && !isTeamMsg && isTeamRequest(userContent);
	const isTaskNotif = isSystem && !isContextMsg && !isCaptureMsg && !isSpecialistComplete && !isReply && !isTeamMsg && !isTeamReq && isTaskNotification(userContent);

	// Type-aware system message routing (WAKE, WARNING, plumbing)
	const isGenericSystem = isSystem && !isContextMsg && !isCaptureMsg && !isSpecialistComplete && !isReply && !isTeamMsg && !isTeamReq && !isTaskNotif;
	const systemParsed = isGenericSystem ? parseSystemPrefix(userContent) : null;
	const isWake = systemParsed?.type === 'WAKE';
	const isWarning = !!(systemParsed && (systemParsed.type === 'WARNING' || systemParsed.type === 'FORCE-HANDOFF'));
	const isPlumbingMsg = !!(systemParsed && ['CRON', 'INFO', 'LATE', 'HANDOFF'].includes(systemParsed.type));

	return (
		<div className="mb-5" onClick={onFocus}>
			{/* User message routing — type-specific renderers for system injections */}
			{turn.userMessage && (
				isContextMsg ? (
					<ContextCard content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isCaptureMsg ? (
					<CaptureCard content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isSpecialistComplete ? (
					<SpecialistReport content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isReply ? (
					<SpecialistReplyCard content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isTeamMsg ? (
					<TeamMessageCard content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isTeamReq ? (
					<TeamRequestCard content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isTaskNotif ? (
					<TaskNotificationCard content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isWake ? (
					<WakeDivider timestamp={turn.userMessage.timestamp} />
				) : isWarning ? (
					<WarningMessage content={userContent} timestamp={turn.userMessage.timestamp} />
				) : isPlumbingMsg ? (
					<SystemMessage content={userContent} variant="plumbing" />
				) : isSystem ? (
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
							const key = (event.type === 'tool_use' && event.toolUseId)
							? event.toolUseId
							: (event.uuid ? `${event.uuid}-${idx}` : `${turn.id}-${idx}`);

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

/**
 * HandoffProgress - Inline indicator during session handoff
 * Shows at the bottom of the transcript during reset/handoff process
 */
function HandoffProgress({ phase }: { phase: HandoffPhase }) {
	if (!phase) return null;

	const phaseConfig = {
		resetting: { text: 'Resetting session...', subtext: 'Preparing context for handoff' },
		generating: { text: 'Generating memory handoff...', subtext: 'Summarizing conversation for successor' },
		complete: { text: 'Handoff complete', subtext: 'Spawning fresh session...' },
	};

	const { text, subtext } = phaseConfig[phase];
	const isComplete = phase === 'complete';

	return (
		<div className="py-4 my-2">
			<div className="flex items-center gap-3">
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#da7756]/20 to-[#da7756]/40" />

				<div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--surface-base)] border border-[#da7756]/20">
					{isComplete ? (
						<Check className="w-4 h-4 text-[#da7756] flex-shrink-0" />
					) : (
						<RefreshCw className="w-4 h-4 text-[#da7756] animate-spin flex-shrink-0" />
					)}
					<div className="flex flex-col">
						<span className="text-[12px] font-medium text-[var(--text-secondary)]">{text}</span>
						<span className="text-[10px] text-[var(--text-muted)]">{subtext}</span>
					</div>
				</div>

				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#da7756]/20 to-[#da7756]/40" />
			</div>
		</div>
	);
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TranscriptViewer({ events, isConnected = false, role, activityIndicator, pagination, onLoadEarlier, handoffPhase }: TranscriptViewerProps) {
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
							<SessionBoundary event={turn.boundaryEvent!} />
						) : turn.type === 'conversation_ended' ? (
							<ConversationEnded event={turn.boundaryEvent!} />
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

				{/* Handoff progress indicator */}
				{handoffPhase && <HandoffProgress phase={handoffPhase} />}

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
