'use client';

/**
 * QuestionCard — Block-level card for AskUserQuestion.
 *
 * Renders as a self-contained card (not chip + expanded view).
 * Shows question text, clickable options when waiting, selected answer when done.
 * "Other" custom text input at the bottom.
 */

import { CircleHelp, Check, Send } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ErrorBox, isErrorResult } from './shared';

interface QuestionCardProps {
	toolInput?: Record<string, unknown>;
	resultContent?: string;
}

type QuestionOption = { label?: string; description?: string };
type Question = {
	question?: string;
	header?: string;
	options?: QuestionOption[];
	multiSelect?: boolean;
};

export function QuestionCard({ toolInput, resultContent }: QuestionCardProps) {
	const questions = toolInput?.questions as Question[] | undefined;
	const hasError = isErrorResult(resultContent);
	const isWaiting = !resultContent;
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string | null>(null);
	const [customText, setCustomText] = useState('');

	// Parse the selected answer from result
	let selectedAnswers: Record<string, string> = {};
	if (toolInput?.answers && typeof toolInput.answers === 'object') {
		selectedAnswers = toolInput.answers as Record<string, string>;
	}

	// Determine selected option from resultContent
	const allOptions = questions?.[0]?.options ?? [];
	const selectedOptionIndex = resultContent
		? allOptions.findIndex(opt => opt.label && resultContent.includes(opt.label))
		: -1;

	// Extract clean answer text for display
	// Priority: local sent state > matched option label > regex-extracted > raw result
	const answerDisplayText = (() => {
		if (sent && !Number.isFinite(Number(sent))) return sent; // custom text from local state
		if (sent) {
			const idx = Number(sent) - 1;
			if (allOptions[idx]?.label) return allOptions[idx].label;
		}
		if (selectedOptionIndex >= 0) return allOptions[selectedOptionIndex].label;
		if (resultContent) {
			const match = resultContent.match(/="([^"]+)"/);
			if (match) return match[1];
		}
		return null;
	})();

	const isAnswered = (!isWaiting && !hasError) || (sent != null);

	// Send a numbered option
	const handleSelect = useCallback((optionIndex: number) => {
		if (sending || sent) return;
		setSending(true);
		window.dispatchEvent(new CustomEvent('answer-question', {
			detail: { steps: [{ text: String(optionIndex + 1), submit: true }] }
		}));
		setSent(String(optionIndex + 1));
		setTimeout(() => setSending(false), 500);
	}, [sending, sent]);

	// Send custom "Other" text
	const handleSendCustom = useCallback(() => {
		if (sending || sent || !customText.trim()) return;
		const optionCount = questions?.[0]?.options?.length ?? 0;
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
		return null;
	}

	return (
		<div className={`
			rounded-lg border overflow-hidden
			${isWaiting && !sent
				? 'border-[var(--color-claude)]/40 bg-[var(--color-claude)]/5'
				: 'border-[var(--border-subtle)] bg-[var(--surface-base)]'
			}
		`}>
			{/* Header — QUESTION always orange, answer text inline on right */}
			<div className={`
				flex items-center gap-2 px-3 py-2
				${isWaiting && !sent
					? 'bg-[var(--color-claude)]/10'
					: 'bg-[var(--surface-raised)]'
				}
			`}>
				<CircleHelp className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-claude)]" />
				<span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-claude)]">
					Question
				</span>

				{/* Answer display — inline in header */}
				{isAnswered && answerDisplayText && (
					<span className="ml-auto flex items-center gap-1.5 text-[10px] min-w-0">
						<span className="truncate text-[var(--text-secondary)] font-medium max-w-[200px]">
							{answerDisplayText}
						</span>
						<Check className="w-3 h-3 text-[var(--color-success)] flex-shrink-0" />
					</span>
				)}
				{isAnswered && !answerDisplayText && (
					<span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--color-success)]">
						<Check className="w-3 h-3" />
					</span>
				)}
			</div>

			{/* Body */}
			<div className="px-3 py-2.5 space-y-3">
				{questions.map((q, qIdx) => (
					<div key={qIdx} className="space-y-2">
						{/* Question text — always visible */}
						{q.question && (
							<div className={`text-[12px] font-medium ${isAnswered ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
								{q.question}
							</div>
						)}

						{/* Options */}
						{q.options && q.options.length > 0 && (
							<div className="space-y-1">
								{q.options.map((opt, oIdx) => {
									const isSelected = Object.values(selectedAnswers).includes(opt.label || '');
									const wasSent = sent === String(oIdx + 1);
									const isMatch = isSelected || wasSent || selectedOptionIndex === oIdx;

									// Interactive: clickable buttons
									if (isWaiting && !sent) {
										return (
											<button
												key={oIdx}
												onClick={() => handleSelect(oIdx)}
												disabled={sending}
												className="w-full flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-md border text-left transition-all duration-150 bg-[var(--surface-base)] border-[var(--border-subtle)] hover:bg-[var(--color-claude)]/8 hover:border-[var(--color-claude)]/30 disabled:opacity-50"
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

									// Answered: compact, highlight selected, dim rest
									return (
										<div
											key={oIdx}
											className={`flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-md ${
												isMatch
													? 'bg-[var(--color-success)]/10 border border-[var(--color-success)]/30'
													: 'opacity-40'
											}`}
										>
											{isMatch ? (
												<Check className="w-3 h-3 text-[var(--color-success)] flex-shrink-0" />
											) : (
												<span className="flex items-center justify-center w-3 h-3 rounded-full border border-[var(--border-default)] text-[9px] font-mono text-[var(--text-muted)] flex-shrink-0">
													{oIdx + 1}
												</span>
											)}
											<span className={`font-medium ${isMatch ? 'text-[var(--color-success)]' : 'text-[var(--text-muted)]'}`}>
												{opt.label}
											</span>
										</div>
									);
								})}

								{/* Custom answer row in the options list */}
								{isAnswered && answerDisplayText && selectedOptionIndex === -1 && (
									<div className="flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-md bg-[var(--color-success)]/10 border border-[var(--color-success)]/30">
										<Check className="w-3 h-3 text-[var(--color-success)] flex-shrink-0" />
										<span className="font-medium text-[var(--color-success)]">
											{answerDisplayText}
										</span>
									</div>
								)}
							</div>
						)}

						{/* "Other" custom text input — only when waiting */}
						{isWaiting && !sent && (
							<div className="flex items-center gap-1.5">
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
									className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-claude)]/50"
								/>
								<button
									onClick={handleSendCustom}
									disabled={!customText.trim() || sending}
									className="p-1.5 rounded-md bg-[var(--color-claude)] text-white disabled:opacity-30 hover:bg-[var(--color-claude)]/80 transition-colors"
									title="Send"
								>
									<Send className="w-3 h-3" />
								</button>
							</div>
						)}
					</div>
				))}

				{hasError && resultContent && <ErrorBox message={resultContent} />}
			</div>
		</div>
	);
}
