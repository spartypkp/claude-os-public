'use client';

/**
 * Claude Code Meta Tool Expanded Views
 *
 * Tools that are part of Claude Code itself (not MCP):
 * - AskUserQuestion (interactive prompts) — clickable options from Dashboard
 * - EnterPlanMode / ExitPlanMode (plan mode approval) — approve/reject from Dashboard
 * - TaskCreate/TaskUpdate/TaskList (task management)
 *
 * Note: Task is rendered as a block-level AgentSpawnCard in TranscriptViewer.
 * TaskOutput/TaskStop render as normal inline chips.
 */

import { sendKeystroke, fetchPlanFile } from '@/lib/api';
import {
	Check,
	FileText,
	Loader2,
	ListTodo,
	MessageSquare,
	Send,
	X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CodeBlock, ErrorBox, StatusBadge, isErrorResult } from '../shared';
import type { ToolExpandedProps } from '../types';

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
		window.dispatchEvent(new CustomEvent('answer-question', {
			detail: { steps: [{ text: String(optionIndex + 1), submit: true }] }
		}));
		setSent(String(optionIndex + 1));
		setTimeout(() => setSending(false), 500);
	}, [sending, sent]);

	// Send custom text ("Other" option)
	// Type the "Other" option number (no Enter), wait for TUI to switch
	// to text input mode, then type the custom text + Enter
	const handleSendCustom = useCallback(() => {
		if (sending || sent || !customText.trim()) return;
		const q = (questions as Array<{ options?: Array<unknown> }>)?.[0];
		const optionCount = q?.options?.length ?? 0;
		const otherNumber = String(optionCount + 1);
		setSending(true);
		window.dispatchEvent(new CustomEvent('answer-question', {
			detail: {
				steps: [
					{ text: otherNumber, submit: false, delayAfter: 500 },
					{ text: customText.trim(), submit: true },
				]
			}
		}));
		setSent(customText.trim());
		setTimeout(() => setSending(false), 1500);
	}, [sending, sent, customText, questions]);

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
						<span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] font-medium">
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
											<span className="flex items-center justify-center w-4 h-4 rounded-full border border-[var(--border-default)] text-[10px] font-mono text-[var(--text-muted)] flex-shrink-0 mt-0.5">
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
											<span className="flex items-center justify-center w-4 h-4 rounded-full border border-[var(--border-default)] text-[10px] font-mono text-[var(--text-muted)] flex-shrink-0 mt-0.5">
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

			{hasError && rawResult && <ErrorBox message={rawResult} />}
		</div>
	);
}

// =============================================================================
// ENTER PLAN MODE — Approval to enter planning phase
// =============================================================================

export function EnterPlanModeExpanded({ rawResult }: ToolExpandedProps) {
	const isWaiting = !rawResult;
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string | null>(null);

	const handleAction = useCallback((action: 'approve' | 'reject') => {
		if (sending || sent) return;
		setSending(true);

		// EnterPlanMode approval: Enter to approve, Escape to reject
		const keys = action === 'approve' ? ['Enter'] : ['Escape'];
		window.dispatchEvent(new CustomEvent('plan-mode-action', {
			detail: { keys }
		}));
		setSent(action);
		setTimeout(() => setSending(false), 500);
	}, [sending, sent]);

	// Already approved/rejected
	if (!isWaiting && !sent) {
		return (
			<div className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
				<Check className="w-3 h-3" />
				Plan mode entered
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="text-[12px] text-[var(--text-secondary)]">
				Claude wants to enter plan mode to explore the codebase and design an implementation approach before making changes.
			</div>

			{isWaiting && !sent && (
				<div className="flex items-center gap-2">
					<button
						onClick={() => handleAction('approve')}
						disabled={sending}
						className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-[var(--color-info)]/15 text-[var(--color-info)] border border-[var(--color-info)]/30 hover:bg-[var(--color-info)]/25 transition-colors disabled:opacity-50"
					>
						<Check className="w-3 h-3" />
						Approve
					</button>
					<button
						onClick={() => handleAction('reject')}
						disabled={sending}
						className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-[var(--surface-base)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:bg-[var(--surface-accent)] transition-colors disabled:opacity-50"
					>
						<X className="w-3 h-3" />
						Reject
					</button>
				</div>
			)}

			{sent && isWaiting && (
				<div className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
					{sent === 'approve' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
					{sent === 'approve' ? 'Plan mode approved' : 'Plan mode rejected'}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// EXIT PLAN MODE — Plan review + approval
// =============================================================================

// Claude OS manages its own context — only "keep context" approve makes sense
const PLAN_APPROVE_KEYS = ['Down', 'Enter'] as const;
// Feedback: navigate to last option in the menu, select, then type
const PLAN_FEEDBACK_KEYS = ['Down', 'Down', 'Down', 'Down', 'Enter'] as const;

export function ExitPlanModeExpanded({ rawResult }: ToolExpandedProps) {
	const isWaiting = !rawResult;
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string | null>(null);
	const [planContent, setPlanContent] = useState<string | null>(null);
	const [planLoading, setPlanLoading] = useState(false);
	const [planError, setPlanError] = useState<string | null>(null);
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedbackText, setFeedbackText] = useState('');
	const [planExpanded, setPlanExpanded] = useState(true);

	// Fetch plan content when component mounts
	useEffect(() => {
		let cancelled = false;
		setPlanLoading(true);
		// Session ID doesn't matter for plan-file endpoint (reads most recent)
		// Use a placeholder — the endpoint ignores it
		fetchPlanFile('current')
			.then(data => {
				if (!cancelled) {
					setPlanContent(data.content);
					setPlanLoading(false);
				}
			})
			.catch(err => {
				if (!cancelled) {
					setPlanError(err.message);
					setPlanLoading(false);
				}
			});
		return () => { cancelled = true; };
	}, []);

	const handleApprove = useCallback(() => {
		if (sending || sent) return;
		setSending(true);
		window.dispatchEvent(new CustomEvent('plan-mode-action', {
			detail: { keys: [...PLAN_APPROVE_KEYS] }
		}));
		setSent('Approved');
		setTimeout(() => setSending(false), 500);
	}, [sending, sent]);

	const handleSendFeedback = useCallback(() => {
		if (sending || sent || !feedbackText.trim()) return;
		setSending(true);
		window.dispatchEvent(new CustomEvent('plan-mode-action', {
			detail: {
				keys: [...PLAN_FEEDBACK_KEYS],
				followUpText: feedbackText.trim(),
			}
		}));
		setSent('Feedback: ' + feedbackText.trim());
		setTimeout(() => setSending(false), 500);
	}, [sending, sent, feedbackText]);

	// Already approved
	if (!isWaiting && !sent) {
		return (
			<div className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
				<Check className="w-3 h-3" />
				Plan approved
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{/* Plan content */}
			<div>
				<button
					onClick={() => setPlanExpanded(!planExpanded)}
					className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-1"
				>
					<FileText className="w-3 h-3 text-[var(--color-success)]" />
					Plan
				</button>
				{planExpanded && (
					<div className="max-h-[400px] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
						{planLoading && (
							<div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
								<Loader2 className="w-3 h-3 animate-spin" />
								Loading plan...
							</div>
						)}
						{planError && (
							<div className="text-[11px] text-[var(--color-error)]">{planError}</div>
						)}
						{planContent && (
							<pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
								{planContent}
							</pre>
						)}
					</div>
				)}
			</div>

			{/* Approval options — only when waiting */}
			{isWaiting && !sent && (
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<button
							onClick={handleApprove}
							disabled={sending}
							className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border transition-all duration-150 bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 disabled:opacity-50"
						>
							<Check className="w-3 h-3" />
							Approve
						</button>
						{!showFeedback && (
							<button
								onClick={() => setShowFeedback(true)}
								disabled={sending}
								className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md border transition-all duration-150 bg-[var(--surface-base)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--color-warning)]/8 hover:border-[var(--color-warning)]/30 disabled:opacity-50"
							>
								<MessageSquare className="w-3 h-3" />
								Give feedback
							</button>
						)}
					</div>
					{showFeedback && (
						<div className="flex items-center gap-1.5">
							<input
								type="text"
								value={feedbackText}
								onChange={(e) => setFeedbackText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleSendFeedback();
									}
								}}
								placeholder="Tell Claude what to change..."
								autoFocus
								className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-warning)]/50"
							/>
							<button
								onClick={handleSendFeedback}
								disabled={!feedbackText.trim() || sending}
								className="p-1.5 rounded-md bg-[var(--color-warning)] text-white disabled:opacity-30 hover:bg-[var(--color-warning)]/80 transition-colors"
								title="Send feedback"
							>
								<Send className="w-3 h-3" />
							</button>
						</div>
					)}
				</div>
			)}

			{/* Sent confirmation */}
			{sent && isWaiting && (
				<div className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
					<Check className="w-3 h-3" />
					{sent}
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
				<ListTodo className="w-3 h-3 text-[#10b981]" />
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

			{hasError && rawResult && <ErrorBox message={rawResult} />}
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
		return <ErrorBox message={rawResult} />;
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
						<span className="font-mono text-[10px] text-[var(--text-muted)] flex-shrink-0">#{task.id}</span>
						<span className={`truncate ${task.status === 'completed' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
							{task.subject}
						</span>
						{task.owner && (
							<span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1 py-0.5 rounded flex-shrink-0 ml-auto">
								{task.owner}
							</span>
						)}
						{isBlocked && (
							<span className="text-[10px] text-[var(--color-warning)] flex-shrink-0">blocked</span>
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
	// Interactive prompts
	AskUserQuestion: AskUserQuestionExpanded,

	// Plan mode
	EnterPlanMode: EnterPlanModeExpanded,
	ExitPlanMode: ExitPlanModeExpanded,

	// Task management
	TaskCreate: TaskManagementExpanded,
	TaskUpdate: TaskManagementExpanded,
	TaskGet: TaskManagementExpanded,
	TaskList: TaskListExpanded,
};
