'use client';

/**
 * MiniTranscript - Compact embedded transcript viewer for subagent cards.
 *
 * NOT a full TranscriptViewer — much simpler. Shows tool calls, text output,
 * and thinking blocks in a compact format inside AgentSpawnCards.
 *
 * Uses ToolChip with compact={true} for scaled-down tool rendering that
 * preserves all functionality (click-to-open, one-liners, etc.).
 */

import { useEffect, useRef } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TranscriptEvent } from '@/hooks/useConversation';
import { ToolChip, getToolConfig } from '@/components/transcript/tools';
import { MarkdownLink } from '../MarkdownLink';
import { ErrorBox } from './shared';

interface MiniTranscriptProps {
	events: TranscriptEvent[];
	isLoading?: boolean;
	isConnected?: boolean;
	error?: string | null;
}

/**
 * Clean up tool name for display (same as TranscriptViewer).
 */
function formatToolName(toolName: string): string {
	if (toolName.startsWith('mcp__')) {
		const parts = toolName.split('__');
		return parts[parts.length - 1] || toolName;
	}
	return toolName;
}

export function MiniTranscript({ events, isLoading, isConnected, error }: MiniTranscriptProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new events arrive
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [events.length]);

	// Loading state
	if (isLoading && events.length === 0) {
		return (
			<div className="flex items-center gap-2 py-2 justify-center rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)]">
				<Loader2 className="w-2.5 h-2.5 animate-spin text-[var(--text-muted)]" />
				<span className="text-[10px] text-[var(--text-muted)]">Loading transcript...</span>
			</div>
		);
	}

	// Error state
	if (error) {
		return <ErrorBox message={error} />;
	}

	// Empty state
	if (events.length === 0) {
		return (
			<div className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)]">
				<span className="text-[10px] text-[var(--text-muted)]">No events yet</span>
			</div>
		);
	}

	// Build paired tool map (toolUseId -> result)
	const toolResults = new Map<string, TranscriptEvent>();
	for (const evt of events) {
		if (evt.type === 'tool_result' && evt.toolUseId) {
			toolResults.set(evt.toolUseId, evt);
		}
	}

	return (
		<div
			ref={scrollRef}
			className="max-h-[200px] overflow-y-auto space-y-1 p-2 rounded-md text-[10px] bg-[var(--surface-base)] border border-[var(--border-subtle)]"
		>
			{events.map((event, idx) => {
				const key = event.uuid ? `${event.uuid}-${idx}` : `mini-${idx}`;

				// Text output — render as markdown
				if (event.type === 'text' && event.content) {
					return (
						<div key={key} className="text-[10px] leading-relaxed text-[var(--text-secondary)] [&_p]:!my-1 [&_p]:!leading-relaxed [&_ul]:!my-1 [&_ol]:!my-1 [&_li]:!my-0.5 [&_code]:text-[10px] [&_code]:bg-[var(--surface-muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:text-[10px] [&_pre]:bg-[var(--surface-muted)] [&_pre]:p-1.5 [&_pre]:rounded [&_pre]:overflow-x-auto [&_h1]:text-[11px] [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-[10px] [&_h2]:font-semibold [&_h2]:mt-1.5 [&_h2]:mb-0.5 [&_h3]:text-[10px] [&_h3]:font-medium [&_h3]:mt-1 [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-subtle)] [&_blockquote]:pl-2 [&_blockquote]:text-[var(--text-muted)]">
								<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
									{event.content}
								</ReactMarkdown>
						</div>
					);
				}

				// Thinking blocks
				if (event.type === 'thinking' && event.thinking) {
					return (
						<div key={key} className="flex items-center gap-1 py-0.5">
							<Brain className="w-2.5 h-2.5 text-[var(--color-claude)]/50" />
							<span className="text-[10px] text-[var(--text-muted)] italic">Thinking...</span>
						</div>
					);
				}

				// Tool calls — compact ToolChip with full functionality
				if (event.type === 'tool_use') {
					const toolName = event.toolName || 'Unknown';
					const formattedName = formatToolName(toolName);
					const config = getToolConfig(formattedName);
					const result = event.toolUseId ? toolResults.get(event.toolUseId) : undefined;

					return (
						<div key={key}>
							<ToolChip
								toolName={toolName}
								formattedName={formattedName}
								icon={config.icon}
								color={config.color}
								toolInput={event.toolInput as Record<string, unknown> | undefined}
								resultContent={result?.content}
								isExpanded={false}
								onToggle={() => {}}
								compact
							/>
						</div>
					);
				}

				// Skip user_message, tool_result (paired with tool_use), system, connected, etc.
				return null;
			})}

			{/* Streaming indicator */}
			{isConnected && (
				<div className="flex items-center gap-1 pt-0.5">
					<Loader2 className="w-2 h-2 animate-spin text-[var(--text-muted)]" />
					<span className="text-[10px] text-[var(--text-muted)]">Streaming...</span>
				</div>
			)}
		</div>
	);
}
