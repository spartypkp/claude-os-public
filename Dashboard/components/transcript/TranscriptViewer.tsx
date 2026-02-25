'use client';

import { ToolChip, SystemEventChip, getToolConfig } from '@/components/transcript/tools';
import { AgentSpawnCard } from '@/components/transcript/tools/AgentCard';
import { QuestionCard } from '@/components/transcript/tools/QuestionCard';
import { ExitPlanCard } from '@/components/transcript/tools/PlanCard';
import { ScheduleCard } from '@/components/transcript/tools/ScheduleCard';
import type { TranscriptEvent } from '@/hooks/useConversation';
import { getRoleConfig } from '@/lib/sessionUtils';
import { useWindowStore } from '@/store/windowStore';
import {
	isSystemMessage,
	normalizeMessageContent,
} from '@/lib/systemMessages';
import type { LucideIcon } from 'lucide-react';
import type { HandoffPhase } from '@/hooks/useHandoffState';
import {
	ArrowDown,
	Brain,
	Check,
	Clock,
	Copy,
	Loader2,
	Monitor,
	Paperclip,
	RefreshCw,
	Send,
	X,
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

import { MarkdownLink } from './MarkdownLink';
import { renderSystemMessage } from './SystemMessages';
import {
	SessionBoundary,
	ConversationEnded,
} from './SessionBoundaries';
import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';

/**
 * Shared ReactMarkdown config for consistent link handling
 */
const MARKDOWN_COMPONENTS = {
	a: MarkdownLink,
};

const INTERACTIVE_TOOLS = new Set(['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode']);

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
 * Parse [Attached Files] block from message content.
 * Returns { attachments: string[], messageContent: string }
 */
function parseAttachments(content: string): { attachments: string[]; messageContent: string } {
	const attachMatch = content.match(/^\[Attached Files\]:\n((?:@[^\n]+\n?)+)/);
	if (!attachMatch) return { attachments: [], messageContent: content };

	const attachBlock = attachMatch[1];
	const attachments = attachBlock
		.split('\n')
		.filter(line => line.startsWith('@'))
		.map(line => line.slice(1).trim());

	const messageContent = content.slice(attachMatch[0].length).trim();
	return { attachments, messageContent };
}

/**
 * Render attachment chips for sent messages — clickable to open on desktop
 */
function AttachmentChips({ paths }: { paths: string[] }) {
	const { openWindow } = useWindowStore();

	return (
		<div className="flex flex-wrap gap-1 mb-1.5">
			{paths.map((path) => {
				const name = path.split('/').pop() || path;
				const displayName = name.replace(/\.[^.]+$/, '');
				const ext = name.split('.').pop()?.toLowerCase() || '';

				return (
					<button
						key={path}
						onClick={(e) => {
							e.stopPropagation();
							openWindow(path, name);
						}}
						className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/15 hover:bg-white/25 transition-colors text-[10px] cursor-pointer"
					>
						<Paperclip className="w-2.5 h-2.5 opacity-70" />
						<span className="max-w-[120px] truncate">{displayName}</span>
						{ext && <span className="opacity-60 uppercase text-[9px]">{ext}</span>}
					</button>
				);
			})}
		</div>
	);
}

/**
 * User message bubble - right aligned with accent color
 */
const UserMessage = memo(function UserMessage({ content, timestamp, queued }: { content: string; timestamp?: string; queued?: boolean; }) {
	const [copied, setCopied] = useState(false);
	const { source, displayContent } = parseMessageSource(content);
	const { attachments, messageContent } = parseAttachments(displayContent);

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
				<div className={`px-4 py-2.5 text-[13px] leading-relaxed rounded-2xl rounded-br-md shadow-sm ${
					queued
						? 'bg-[var(--color-primary)] text-white opacity-50'
						: 'bg-[var(--color-primary)] text-white'
				}`}>
					{attachments.length > 0 && <AttachmentChips paths={attachments} />}
					{messageContent && (
						<div className="whitespace-pre-wrap break-words">{messageContent}</div>
					)}
				</div>
				{/* Timestamp + source icon + queued indicator */}
				{(formattedTime || SourceIcon || queued) && (
					<div className="flex items-center justify-end gap-1 mt-1 mr-1">
						{queued && (
							<>
								<Clock className="w-2.5 h-2.5 text-[var(--text-muted)] opacity-60" />
								<span className="text-[10px] text-[var(--text-muted)] opacity-60">Queued</span>
							</>
						)}
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

	// Interactive tools render as block-level cards (not chip + expanded)
	if (formattedName === 'AskUserQuestion') {
		return (
			<QuestionCard
				toolInput={event.toolInput as Record<string, unknown> | undefined}
				resultContent={result?.content}
			/>
		);
	}
	// EnterPlanMode renders as a normal chip (auto-approved, low importance)
	// ExitPlanMode renders as a block-level card (plan review is the real interaction)
	if (formattedName === 'ExitPlanMode') {
		return <ExitPlanCard resultContent={result?.content} />;
	}

	// Agent tools render as block-level cards (not inline chips)
	if (formattedName === 'Task') {
		return (
			<AgentSpawnCard
				toolInput={event.toolInput as Record<string, unknown> | undefined}
				resultContent={result?.content}
				agentId={result?.agentId}
				eventSessionId={event.session_id}
			/>
		);
	}
	// TaskOutput and TaskStop are hidden — AgentSpawnCard's transcript already shows the full output
	if (formattedName === 'TaskOutput' || formattedName === 'TaskStop') {
		return null;
	}

	// Schedule renders as a block-level card (not chip + expanded)
	if (formattedName === 'schedule') {
		return (
			<ScheduleCard
				toolInput={event.toolInput as Record<string, unknown> | undefined}
				resultContent={result?.content}
			/>
		);
	}

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
				<span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded flex-shrink-0">
					×{batch.tools.length}
				</span>

				{/* Error indicator */}
				{hasErrors && (
					<X className="w-3 h-3 text-[var(--color-error)] flex-shrink-0" />
				)}

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
 * Complete turn: optional user message + assistant response with inline tools
 * Memo-wrapped so past turns never re-render when new messages arrive.
 */
const TurnBlock = memo(function TurnBlock({
	turn,
	roleIcon: DefaultRoleIcon,
	roleLabel: defaultRoleLabel,
}: {
	turn: Turn;
	roleIcon: LucideIcon;
	roleLabel: string;
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

	// Auto-expand interactive tools when they're waiting for input
	useEffect(() => {
		for (const event of turn.responseEvents) {
			if (event.type === 'tool_use') {
				const name = formatToolName(event.toolName || '');
				if (INTERACTIVE_TOOLS.has(name) && event.toolUseId) {
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

	return (
		<div className="mb-5">
			{/* User message routing — shared renderer for system injections, inline for user messages */}
			{turn.userMessage && (
				isSystem ? (
					renderSystemMessage(userContent, turn.userMessage.timestamp)
				) : (
					<UserMessage content={userContent} timestamp={turn.userMessage.timestamp} queued={turn.userMessage.queued} />
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
});

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
				<div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-claude)]/20 to-[var(--color-claude)]/40" />

				<div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--surface-base)] border border-[var(--color-claude)]/20">
					{isComplete ? (
						<Check className="w-4 h-4 text-[var(--color-claude)] flex-shrink-0" />
					) : (
						<RefreshCw className="w-4 h-4 text-[var(--color-claude)] animate-spin flex-shrink-0" />
					)}
					<div className="flex flex-col">
						<span className="text-[12px] font-medium text-[var(--text-secondary)]">{text}</span>
						<span className="text-[10px] text-[var(--text-muted)]">{subtext}</span>
					</div>
				</div>

				<div className="flex-1 h-px bg-gradient-to-l from-transparent via-[var(--color-claude)]/20 to-[var(--color-claude)]/40" />
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

	// Auto-scroll state: follow when at bottom, pause when scrolled up
	const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
	const [showScrollIndicator, setShowScrollIndicator] = useState(false);

	// Track scroll position for auto-scroll
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
				{/* Load earlier session history button */}
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
					<div
						key={turn.id}
						data-turn-index={idx}
					>
						{turn.type === 'session_boundary' ? (
							<SessionBoundary
								boundaryType={(turn.boundaryEvent as any)?.boundary_type || (turn.boundaryEvent as any)?.boundaryType}
								mode={(turn.boundaryEvent as any)?.mode}
								timestamp={turn.boundaryEvent?.timestamp}
							/>
						) : turn.type === 'conversation_ended' ? (
							<ConversationEnded timestamp={turn.boundaryEvent?.timestamp} />
						) : (
							<TurnBlock
								turn={turn}
								roleIcon={RoleIcon}
								roleLabel={roleConfig.label}
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
