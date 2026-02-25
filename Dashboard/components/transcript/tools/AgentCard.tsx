'use client';

/**
 * AgentCard — Block-level card for agent (subagent) spawning.
 *
 * AgentSpawnCard (Task) is the unified card for all agent types.
 * TaskOutput and TaskStop render as inline chips via the registry.
 * Transcript is expanded by default — no separate Result section needed.
 */

import { useState } from 'react';
import {
	Check,
	ChevronRight,
	Loader2,
	X,
	Zap,
} from 'lucide-react';
import type { TranscriptEvent } from '@/hooks/useConversation';
import { AGENT_COLOR, AGENT_ICONS, AGENT_CATEGORIES } from './ToolChip';
import { CodeBlock, ErrorBox, isErrorResult } from './shared';
import { MiniTranscript } from './MiniTranscript';
import { useSubagentTranscript } from '@/hooks/useSubagentTranscript';
import { useTranscriptSession } from '../TranscriptContext';

// =============================================================================
// SHARED
// =============================================================================

interface AgentCardProps {
	toolInput?: Record<string, unknown>;
	resultContent?: string;
	/** agentId from tool_result event (for resolved agents) */
	agentId?: string;
	/** Session ID override (from history event's session_id) */
	eventSessionId?: string;
	/** Mock transcript events for UI testing — bypasses the useSubagentTranscript hook */
	mockTranscriptEvents?: TranscriptEvent[];
}

// =============================================================================
// AGENT SPAWN CARD (Task)
// =============================================================================

export function AgentSpawnCard({ toolInput, resultContent, agentId: agentIdProp, eventSessionId, mockTranscriptEvents }: AgentCardProps) {
	const [promptExpanded, setPromptExpanded] = useState(false);
	const { activeSessionId } = useTranscriptSession();

	const agentType = toolInput?.subagent_type ? String(toolInput.subagent_type) : '';
	const description = toolInput?.description ? String(toolInput.description) : '';
	const prompt = toolInput?.prompt ? String(toolInput.prompt) : '';
	const model = toolInput?.model ? String(toolInput.model) : '';
	const runInBg = Boolean(toolInput?.run_in_background);
	const AgentIcon = AGENT_ICONS[agentType] || Zap;
	const agentCategory = AGENT_CATEGORIES[agentType];
	const isForeground = agentCategory === 'foreground';

	const isRunning = !resultContent;
	const hasError = isErrorResult(resultContent);

	const isMocked = !!mockTranscriptEvents;

	// Resolve agentId from prop (passed from tool_result event) or by regex from result content
	let resolvedAgentId = agentIdProp || null;
	if (!resolvedAgentId && resultContent) {
		const match = resultContent.match(/agentId:\s*([a-f0-9]+)/);
		if (match) resolvedAgentId = match[1];
	}

	// Session ID: prefer event's session_id (for history), fall back to active session
	const sessionId = eventSessionId || activeSessionId;

	// Subagent transcript hook — skipped when mock data provided
	const subagent = useSubagentTranscript({
		sessionId,
		agentId: resolvedAgentId,
		prompt,
		enabled: !isMocked,
		isRunning: isRunning && !isMocked,
	});

	// Use mock events when provided, otherwise use hook data
	const transcriptEvents = isMocked ? mockTranscriptEvents : subagent.events;
	const transcriptLoading = isMocked ? false : subagent.isLoading;
	const transcriptConnected = isMocked ? false : subagent.isConnected;
	const transcriptError = isMocked ? null : subagent.error;

	return (
		<div className="my-2">
			<div
				className="rounded-lg border p-3 max-w-[95%]"
				style={{
					borderColor: `color-mix(in srgb, ${AGENT_COLOR} 20%, transparent)`,
					backgroundColor: `color-mix(in srgb, ${AGENT_COLOR} 4%, transparent)`,
				}}
			>
				{/* Header row */}
				<div className="flex items-center gap-2 flex-wrap">
					{/* AGENT label */}
					<span
						className="text-[10px] uppercase tracking-wider font-bold flex-shrink-0"
						style={{ color: AGENT_COLOR }}
					>
						agent
					</span>

					{/* Agent type with icon */}
					<span
						className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md font-medium flex-shrink-0"
						style={{
							backgroundColor: `color-mix(in srgb, ${AGENT_COLOR} 12%, transparent)`,
							color: AGENT_COLOR,
						}}
					>
						{isRunning ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<AgentIcon className="w-3 h-3" />
						)}
						{agentType || 'agent'}
					</span>

					{/* Model badge */}
					{model && (
						<span
							className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
								model === 'sonnet'
									? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium'
									: model === 'opus'
										? 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 font-medium'
										: 'text-[var(--text-muted)] bg-[var(--surface-muted)]'
							}`}
						>
							{model}
						</span>
					)}

					{/* Foreground (MCP) badge */}
					{isForeground && (
						<span className="text-[10px] text-[var(--color-info)] bg-[var(--color-info)]/10 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
							mcp
						</span>
					)}

					{/* Background badge */}
					{runInBg && (
						<span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded flex-shrink-0">
							bg
						</span>
					)}

					{/* Status indicator — right aligned */}
					<span className="ml-auto flex-shrink-0">
						{isRunning ? (
							<span className="text-[10px] text-[var(--color-warning)] flex items-center gap-1">
								<Loader2 className="w-3 h-3 animate-spin" />
								running
							</span>
						) : hasError ? (
							<span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-error)] bg-[var(--color-error)]/10 px-1.5 py-0.5 rounded">
								<X className="w-3 h-3" />
								error
							</span>
						) : (
							<span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded">
								<Check className="w-3 h-3" />
								done
							</span>
						)}
					</span>
				</div>

				{/* Description */}
				{description && (
					<div className="mt-2 text-[12px] text-[var(--text-secondary)] leading-relaxed">
						{description}
					</div>
				)}

				{/* Sections */}
				<div className="mt-2 space-y-2">
					{/* Prompt — collapsed by default */}
					{prompt && (
						<div>
							<button
								onClick={() => setPromptExpanded(!promptExpanded)}
								className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium hover:text-[var(--text-secondary)] transition-colors"
							>
								<ChevronRight className={`w-3 h-3 transition-transform duration-150 ${promptExpanded ? 'rotate-90' : ''}`} />
								Prompt
							</button>
							{promptExpanded && (
								<div className="mt-1">
									<CodeBlock code={prompt} maxHeight="200px" />
								</div>
							)}
						</div>
					)}

					{/* Transcript — hide when agent was rejected (has result but no agentId) */}
					{(sessionId || isMocked) && (isRunning || resolvedAgentId) && (
						<div>
							<div className="flex items-center gap-1.5 mb-1">
								<span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Transcript</span>
								{transcriptEvents.length > 0 && (
									<span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1 py-0.5 rounded">
										{transcriptEvents.length}
									</span>
								)}
							</div>
							<MiniTranscript
								events={transcriptEvents}
								isLoading={transcriptLoading}
								isConnected={transcriptConnected}
								error={transcriptError}
							/>
						</div>
					)}

					{/* Error display */}
					{resultContent && hasError && (
						<ErrorBox message={resultContent.length > 500 ? resultContent.slice(0, 497) + '...' : resultContent} />
					)}
				</div>
			</div>
		</div>
	);
}

