'use client';

/**
 * PlanCard — Block-level cards for EnterPlanMode and ExitPlanMode.
 *
 * EnterPlanMode: Claude wants to enter plan mode. Approve or reject.
 * ExitPlanMode: Claude has a plan ready. Approve, or give feedback.
 *
 * Same visual language as QuestionCard — orange header, inline status,
 * interactive buttons when waiting, compact answered state.
 */

import { fetchPlanFile } from '@/lib/api';
import {
	Check,
	Loader2,
	MessageSquare,
	Send,
	Workflow,
	X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ErrorBox, isErrorResult } from './shared';

interface PlanCardProps {
	resultContent?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTER PLAN MODE
// ─────────────────────────────────────────────────────────────────────────────

export function EnterPlanCard({ resultContent }: PlanCardProps) {
	const hasError = isErrorResult(resultContent);
	const isWaiting = !resultContent;
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string | null>(null);

	const isAnswered = (!isWaiting && !hasError) || sent != null;

	const handleAction = useCallback((action: 'approve' | 'reject') => {
		if (sending || sent) return;
		setSending(true);
		const keys = action === 'approve' ? ['Enter'] : ['Escape'];
		window.dispatchEvent(new CustomEvent('plan-mode-action', {
			detail: { keys }
		}));
		setSent(action);
		setTimeout(() => setSending(false), 500);
	}, [sending, sent]);

	return (
		<div className={`
			rounded-lg border overflow-hidden
			${isWaiting && !sent
				? 'border-[var(--color-claude)]/40 bg-[var(--color-claude)]/5'
				: 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
			}
		`}>
			{/* Header */}
			<div className={`
				flex items-center gap-2 px-3 py-2
				${isWaiting && !sent
					? 'bg-[var(--color-claude)]/10'
					: 'bg-[var(--surface-raised)]'
				}
			`}>
				<Workflow className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-claude)]" />
				<span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-claude)]">
					Plan Mode
				</span>

				{isAnswered && (
					<span className="ml-auto flex items-center gap-1.5 text-[10px]">
						<span className={`font-medium ${
							(sent === 'approve' || (!sent && !isWaiting))
								? 'text-[var(--color-success)]'
								: 'text-[var(--text-muted)]'
						}`}>
							{sent === 'reject' ? 'Rejected' : 'Approved'}
						</span>
						{(sent === 'approve' || (!sent && !isWaiting)) ? (
							<Check className="w-3 h-3 text-[var(--color-success)] flex-shrink-0" />
						) : (
							<X className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
						)}
					</span>
				)}
			</div>

			{/* Body */}
			<div className="px-3 py-2.5">
				<div className={`text-[12px] font-medium ${isAnswered ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
					Claude wants to enter plan mode to explore the codebase and design an approach before making changes.
				</div>

				{/* Action buttons — only when waiting */}
				{isWaiting && !sent && (
					<div className="flex items-center gap-2 mt-2.5">
						<button
							onClick={() => handleAction('approve')}
							disabled={sending}
							className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border transition-all duration-150 bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 disabled:opacity-50"
						>
							<Check className="w-3 h-3" />
							Approve
						</button>
						<button
							onClick={() => handleAction('reject')}
							disabled={sending}
							className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md border transition-all duration-150 bg-[var(--surface-base)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--surface-accent)] disabled:opacity-50"
						>
							<X className="w-3 h-3" />
							Reject
						</button>
					</div>
				)}

				{hasError && resultContent && <ErrorBox message={resultContent} />}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXIT PLAN MODE — Plan review + approval
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_APPROVE_KEYS = ['Down', 'Enter'] as const;
const PLAN_FEEDBACK_KEYS = ['Down', 'Down', 'Down', 'Down', 'Enter'] as const;

export function ExitPlanCard({ resultContent }: PlanCardProps) {
	const hasError = isErrorResult(resultContent);
	const isWaiting = !resultContent;
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string | null>(null);
	const [planContent, setPlanContent] = useState<string | null>(null);
	const [planLoading, setPlanLoading] = useState(false);
	const [planError, setPlanError] = useState<string | null>(null);
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedbackText, setFeedbackText] = useState('');

	const isAnswered = (!isWaiting && !hasError) || sent != null;
	const isFeedback = sent?.startsWith('Feedback:');

	// Fetch plan content when component mounts
	useEffect(() => {
		let cancelled = false;
		setPlanLoading(true);
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

	return (
		<div className={`
			rounded-lg border overflow-hidden
			${isWaiting && !sent
				? 'border-[var(--color-claude)]/40 bg-[var(--color-claude)]/5'
				: 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
			}
		`}>
			{/* Header */}
			<div className={`
				flex items-center gap-2 px-3 py-2
				${isWaiting && !sent
					? 'bg-[var(--color-claude)]/10'
					: 'bg-[var(--surface-raised)]'
				}
			`}>
				<Workflow className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-claude)]" />
				<span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-claude)]">
					Plan Review
				</span>

				{isAnswered && (
					<span className="ml-auto flex items-center gap-1.5 text-[10px] min-w-0">
						<span className={`truncate font-medium max-w-[200px] ${
							isFeedback ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'
						}`}>
							{isFeedback ? sent?.replace('Feedback: ', '') : 'Approved'}
						</span>
						{isFeedback ? (
							<MessageSquare className="w-3 h-3 text-[var(--color-warning)] flex-shrink-0" />
						) : (
							<Check className="w-3 h-3 text-[var(--color-success)] flex-shrink-0" />
						)}
					</span>
				)}
			</div>

			{/* Body */}
			<div className="px-3 py-2.5 space-y-2.5">
				{/* Plan content — always visible, no toggle */}
				{planContent && (
					<div className="max-h-[400px] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
						<ReactMarkdown
							components={{
								h1: ({ children }) => <h1 className="text-[12px] font-bold text-[var(--text-primary)] mt-0 mb-1.5">{children}</h1>,
								h2: ({ children }) => <h2 className="text-[11px] font-semibold text-[var(--text-primary)] mt-2 mb-1">{children}</h2>,
								h3: ({ children }) => <h3 className="text-[11px] font-medium text-[var(--text-secondary)] mt-1.5 mb-0.5">{children}</h3>,
								p: ({ children }) => <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-1.5">{children}</p>,
								ul: ({ children }) => <ul className="text-[11px] text-[var(--text-secondary)] list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
								ol: ({ children }) => <ol className="text-[11px] text-[var(--text-secondary)] list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
								li: ({ children }) => <li className="leading-relaxed">{children}</li>,
								code: ({ children }) => <code className="text-[10px] font-mono bg-[var(--surface-muted)] px-1 py-0.5 rounded">{children}</code>,
								strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
							}}
						>
							{planContent}
						</ReactMarkdown>
					</div>
				)}

				{planLoading && (
					<div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
						<Loader2 className="w-3 h-3 animate-spin" />
						Loading plan...
					</div>
				)}

				{planError && (
					<div className="text-[11px] text-[var(--color-error)]">{planError}</div>
				)}

				{/* Action buttons — only when waiting */}
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
									className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-claude)]/50"
								/>
								<button
									onClick={handleSendFeedback}
									disabled={!feedbackText.trim() || sending}
									className="p-1.5 rounded-md bg-[var(--color-claude)] text-white disabled:opacity-30 hover:bg-[var(--color-claude)]/80 transition-colors"
									title="Send feedback"
								>
									<Send className="w-3 h-3" />
								</button>
							</div>
						)}
					</div>
				)}

				{hasError && resultContent && <ErrorBox message={resultContent} />}
			</div>
		</div>
	);
}
