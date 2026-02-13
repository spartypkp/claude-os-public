'use client';

/**
 * Claude Code Meta Tool Expanded Views
 *
 * Tools that are part of Claude Code itself (not MCP):
 * - Task (subagent spawning) — rich visual with agent type, status, result
 * - AskUserQuestion (interactive prompts) — clickable options from Dashboard
 * - TaskCreate/TaskUpdate/TaskList (task management)
 */

import { sendKeystroke } from '@/lib/api';
import {
	Check,
	ChevronDown,
	ChevronRight,
	Loader2,
	ListChecks,
	Send,
	Zap,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { AGENT_COLORS } from '../ToolChip';
import { CodeBlock, SectionHeader, StatusBadge, isErrorResult } from '../shared';
import type { ToolExpandedProps } from '../types';

export function TaskExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const [showPrompt, setShowPrompt] = useState(false);
	const [showResult, setShowResult] = useState(false);

	const description = rawInput?.description ? String(rawInput.description) : '';
	const subagentType = rawInput?.subagent_type ? String(rawInput.subagent_type) : '';
	const prompt = rawInput?.prompt ? String(rawInput.prompt) : '';
	const runInBg = Boolean(rawInput?.run_in_background);
	const model = rawInput?.model ? String(rawInput.model) : '';
	const hasError = isErrorResult(rawResult);
	const isRunning = !rawResult;
	const agentColor = AGENT_COLORS[subagentType] || 'var(--color-primary)';

	// Try to extract a meaningful summary from the result
	let resultSummary = '';
	let resultFull = rawResult || '';
	if (rawResult && !hasError) {
		// Take first 2 meaningful lines as summary
		const lines = rawResult.split('\n').filter(l => l.trim());
		resultSummary = lines.slice(0, 2).join('\n');
		if (resultSummary.length > 200) {
			resultSummary = resultSummary.slice(0, 197) + '...';
		}
	}

	return (
		<div className="space-y-2.5">
			{/* Agent header with type + status */}
			<div className="flex items-center gap-2 flex-wrap">
				{subagentType && (
					<span
						className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5"
						style={{
							backgroundColor: `color-mix(in srgb, ${agentColor} 15%, transparent)`,
							color: agentColor,
						}}
					>
						<Zap className="w-2.5 h-2.5" />
						{subagentType}
					</span>
				)}
				{model && (
					<span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
						{model}
					</span>
				)}
				{runInBg && (
					<span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
						background
					</span>
				)}
				{/* Status indicator */}
				{isRunning ? (
					<span className="text-[9px] text-[var(--color-warning)] flex items-center gap-1">
						<Loader2 className="w-2.5 h-2.5 animate-spin" />
						running
					</span>
				) : hasError ? (
					<StatusBadge label="error" color="var(--color-error)" />
				) : (
					<StatusBadge label="done" color="var(--color-success)" />
				)}
			</div>

			{/* Description */}
			{description && (
				<div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
					{description}
				</div>
			)}

			{/* Prompt (collapsible) */}
			{prompt && (
				<div>
					<button
						onClick={() => setShowPrompt(!showPrompt)}
						className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
					>
						{showPrompt ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
						<span>Prompt ({prompt.length} chars)</span>
					</button>
					{showPrompt && (
						<div className="mt-1">
							<CodeBlock code={prompt} maxHeight="200px" />
						</div>
					)}
				</div>
			)}

			{/* Result */}
			{rawResult && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">
							{rawResult.length > 500 ? rawResult.slice(0, 497) + '...' : rawResult}
						</code>
					</div>
				) : resultSummary ? (
					<div>
						<button
							onClick={() => setShowResult(!showResult)}
							className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
						>
							{showResult ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
							<span>Result ({resultFull.length} chars)</span>
						</button>
						{showResult ? (
							<div className="mt-1">
								<CodeBlock code={resultFull} maxHeight="250px" />
							</div>
						) : (
							<div className="mt-1 text-[11px] text-[var(--text-muted)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] whitespace-pre-wrap">
								{resultSummary}
							</div>
						)}
					</div>
				) : null
			)}
		</div>
	);
}

// =============================================================================
// ASK USER QUESTION — Interactive from Dashboard
// =============================================================================

export function AskUserQuestionExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const questions = rawInput?.questions;
	const hasError = isErrorResult(rawResult);
	const isWaiting = !rawResult;
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string | null>(null);
	const [customText, setCustomText] = useState('');

	// Parse the selected answer from result
	let selectedAnswers: Record<string, string> = {};
	if (rawInput?.answers && typeof rawInput.answers === 'object') {
		selectedAnswers = rawInput.answers as Record<string, string>;
	}

	// Send a selection via window event (ClaudePanel listens)
	const handleSelect = useCallback((optionIndex: number) => {
		if (sending || sent) return;
		setSending(true);
		// Dispatch event for ClaudePanel to handle (it has the session ID)
		window.dispatchEvent(new CustomEvent('answer-question', {
			detail: { text: String(optionIndex + 1) }
		}));
		setSent(String(optionIndex + 1));
		setTimeout(() => setSending(false), 500);
	}, [sending, sent]);

	// Send custom text ("Other" option)
	const handleSendCustom = useCallback(() => {
		if (sending || sent || !customText.trim()) return;
		setSending(true);
		window.dispatchEvent(new CustomEvent('answer-question', {
			detail: { text: customText.trim() }
		}));
		setSent(customText.trim());
		setTimeout(() => setSending(false), 500);
	}, [sending, sent, customText]);

	if (!Array.isArray(questions) || questions.length === 0) {
		return rawResult ? <CodeBlock code={rawResult} maxHeight="100px" /> : null;
	}

	return (
		<div className="space-y-3">
			{(questions as Array<{
				question?: string;
				header?: string;
				options?: Array<{ label?: string; description?: string }>;
				multiSelect?: boolean;
			}>).map((q, qIdx) => (
				<div key={qIdx} className="space-y-2">
					{/* Question header badge */}
					{q.header && (
						<span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] font-medium">
							{q.header}
						</span>
					)}

					{/* Question text */}
					{q.question && (
						<div className="text-[12px] font-medium text-[var(--text-primary)]">
							{q.question}
						</div>
					)}

					{/* Options — interactive when waiting, static when answered */}
					{q.options && q.options.length > 0 && (
						<div className="space-y-1">
							{q.options.map((opt, oIdx) => {
								const isSelected = Object.values(selectedAnswers).includes(opt.label || '');
								const wasSent = sent === String(oIdx + 1);

								// Interactive mode: show clickable buttons
								if (isWaiting && !sent) {
									return (
										<button
											key={oIdx}
											onClick={() => handleSelect(oIdx)}
											disabled={sending}
											className={`
												w-full flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-md border text-left
												transition-all duration-150
												bg-[var(--surface-base)] border-[var(--border-subtle)]
												hover:bg-[var(--color-primary)]/8 hover:border-[var(--color-primary)]/30
												disabled:opacity-50
											`}
										>
											<span className="flex items-center justify-center w-4 h-4 rounded-full border border-[var(--border-default)] text-[9px] font-mono text-[var(--text-muted)] flex-shrink-0 mt-0.5">
												{oIdx + 1}
											</span>
											<div className="flex-1">
												<div className="font-medium text-[var(--text-secondary)]">
													{opt.label}
												</div>
												{opt.description && (
													<div className="text-[var(--text-muted)] text-[10px] mt-0.5">
														{opt.description}
													</div>
												)}
											</div>
										</button>
									);
								}

								// Sent or answered state
								return (
									<div
										key={oIdx}
										className={`flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-md border transition-colors ${
											isSelected || wasSent
												? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30'
												: 'bg-[var(--surface-base)] border-[var(--border-subtle)] opacity-50'
										}`}
									>
										{(isSelected || wasSent) && <Check className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0 mt-0.5" />}
										{!isSelected && !wasSent && (
											<span className="flex items-center justify-center w-4 h-4 rounded-full border border-[var(--border-default)] text-[9px] font-mono text-[var(--text-muted)] flex-shrink-0 mt-0.5">
												{oIdx + 1}
											</span>
										)}
										<div className="flex-1">
											<div className={`font-medium ${(isSelected || wasSent) ? 'text-[var(--color-success)]' : 'text-[var(--text-muted)]'}`}>
												{opt.label}
											</div>
											{opt.description && (
												<div className="text-[var(--text-muted)] text-[10px] mt-0.5">
													{opt.description}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}

					{/* "Other" custom text input — only when waiting and not yet sent */}
					{isWaiting && !sent && (
						<div className="flex items-center gap-1.5 mt-1">
							<input
								type="text"
								value={customText}
								onChange={(e) => setCustomText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleSendCustom();
									}
								}}
								placeholder="Or type a custom answer..."
								className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)]/50"
							/>
							<button
								onClick={handleSendCustom}
								disabled={!customText.trim() || sending}
								className="p-1.5 rounded-md bg-[var(--color-primary)] text-white disabled:opacity-30 hover:bg-[var(--color-primary)]/80 transition-colors"
								title="Send"
							>
								<Send className="w-3 h-3" />
							</button>
						</div>
					)}

					{/* Sent confirmation */}
					{sent && isWaiting && (
						<div className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
							<Check className="w-3 h-3" />
							Sent answer
						</div>
					)}
				</div>
			))}

			{hasError && rawResult && (
				<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
					<code className="text-[11px] text-[var(--color-error)] font-mono">{rawResult}</code>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// TASK CREATE/UPDATE (todo-style task management)
// =============================================================================

export function TaskManagementExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const subject = rawInput?.subject ? String(rawInput.subject) : '';
	const description = rawInput?.description ? String(rawInput.description) : '';
	const status = rawInput?.status ? String(rawInput.status) : '';
	const taskId = rawInput?.taskId ? String(rawInput.taskId) : '';
	const hasError = isErrorResult(rawResult);

	const statusColors: Record<string, string> = {
		pending: 'var(--text-muted)',
		in_progress: 'var(--color-primary)',
		completed: 'var(--color-success)',
		deleted: 'var(--color-error)',
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<ListChecks className="w-3 h-3 text-[var(--color-primary)]" />
				{taskId && (
					<span className="text-[10px] font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
						#{taskId}
					</span>
				)}
				{status && (
					<StatusBadge label={status} color={statusColors[status] || 'var(--text-muted)'} />
				)}
			</div>

			{subject && (
				<div className="text-[11px] font-medium text-[var(--text-secondary)]">{subject}</div>
			)}

			{description && (
				<div className="text-[11px] text-[var(--text-muted)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
					{description.length > 200 ? description.slice(0, 197) + '...' : description}
				</div>
			)}

			{hasError && rawResult && (
				<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
					<code className="text-[11px] text-[var(--color-error)] font-mono">{rawResult}</code>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// TASK LIST — Shows actual task items from result
// =============================================================================

export function TaskListExpanded({ rawResult }: ToolExpandedProps) {
	if (!rawResult) return null;
	const hasError = isErrorResult(rawResult);
	if (hasError) {
		return (
			<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
				<code className="text-[11px] text-[var(--color-error)] font-mono">{rawResult}</code>
			</div>
		);
	}

	// Try parsing structured task data from result
	let tasks: Array<{ id?: string; subject?: string; status?: string; owner?: string; blockedBy?: string[] }> = [];
	try {
		const parsed = JSON.parse(rawResult);
		if (Array.isArray(parsed)) tasks = parsed;
		else if (parsed?.tasks) tasks = parsed.tasks;
	} catch {
		// Not JSON — render as formatted text
		return <CodeBlock code={rawResult} maxHeight="200px" />;
	}

	if (tasks.length === 0) {
		return <div className="text-[11px] text-[var(--text-muted)]">No tasks</div>;
	}

	const statusStyles: Record<string, { color: string; icon: string }> = {
		pending: { color: 'var(--text-muted)', icon: '○' },
		in_progress: { color: 'var(--color-primary)', icon: '●' },
		completed: { color: 'var(--color-success)', icon: '✓' },
	};

	return (
		<div className="space-y-1">
			{tasks.map((task, i) => {
				const style = statusStyles[task.status || ''] || statusStyles.pending;
				const isBlocked = task.blockedBy && task.blockedBy.length > 0;
				return (
					<div key={i} className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
						<span className="text-[10px] flex-shrink-0" style={{ color: style.color }}>
							{style.icon}
						</span>
						<span className="font-mono text-[9px] text-[var(--text-muted)] flex-shrink-0">#{task.id}</span>
						<span className={`truncate ${task.status === 'completed' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
							{task.subject}
						</span>
						{task.owner && (
							<span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1 py-0.5 rounded flex-shrink-0 ml-auto">
								{task.owner}
							</span>
						)}
						{isBlocked && (
							<span className="text-[9px] text-[var(--color-warning)] flex-shrink-0">blocked</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// =============================================================================
// EXPORT MAP
// =============================================================================

export const claudeCodeExpandedViews = {
	// Subagent
	Task: TaskExpanded,
	TaskOutput: TaskExpanded,
	TaskStop: TaskExpanded,

	// Interactive
	AskUserQuestion: AskUserQuestionExpanded,

	// Task management
	TaskCreate: TaskManagementExpanded,
	TaskUpdate: TaskManagementExpanded,
	TaskGet: TaskManagementExpanded,
	TaskList: TaskListExpanded,
};
