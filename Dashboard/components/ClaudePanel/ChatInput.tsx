'use client';

import { ArrowUp, Loader2, Square } from 'lucide-react';
import { KeyboardEvent, useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

const DRAFT_KEY = 'claude-panel-drafts';

function readDraft(id: string): string {
	try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')[id] || ''; }
	catch { return ''; }
}

function writeDraft(id: string, text: string) {
	try {
		const drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
		if (text) { drafts[id] = text; } else { delete drafts[id]; }
		localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
	} catch { /* ignore */ }
}

interface ChatInputProps {
	sessionId: string | null;
	placeholder: string;
	onSend: (message: string) => Promise<boolean>;
	onInterrupt: () => void;
	disabled?: boolean;
	isProcessing?: boolean;
	/** Called on every value change with (value, cursorPosition) for mention detection */
	onMentionChange?: (value: string, cursorPos: number) => void;
	/** Called on keydown — return true to consume the event (for mention navigation) */
	onMentionKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

export interface ChatInputHandle {
	focus: () => void;
	clear: () => void;
	getValue: () => string;
	setValue: (value: string) => void;
	getTextarea: () => HTMLTextAreaElement | null;
}

/**
 * Self-contained chat input component.
 * Manages its own state + per-conversation draft persistence in localStorage.
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
	{ sessionId, placeholder, onSend, onInterrupt, disabled, isProcessing, onMentionChange, onMentionKeyDown },
	ref
) {
	const [value, setValue] = useState(() => sessionId ? readDraft(sessionId) : '');
	const [isSending, setIsSending] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Track current sessionId + value in refs for cleanup
	const sessionIdRef = useRef(sessionId);
	const valueRef = useRef(value);
	sessionIdRef.current = sessionId;
	valueRef.current = value;

	// Expose methods to parent via ref
	useImperativeHandle(ref, () => ({
		focus: () => textareaRef.current?.focus(),
		clear: () => setValue(''),
		getValue: () => value,
		setValue: (newValue: string) => setValue(newValue),
		getTextarea: () => textareaRef.current,
	}), [value]);

	// On session switch: flush old draft, load new draft
	useEffect(() => {
		const id = sessionId;
		setValue(id ? readDraft(id) : '');

		// Reset textarea height for new conversation
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}

		return () => {
			// Flush draft for the session we're leaving
			if (draftTimeoutRef.current) {
				clearTimeout(draftTimeoutRef.current);
				draftTimeoutRef.current = null;
			}
			if (id) writeDraft(id, valueRef.current);
		};
	}, [sessionId]);

	// Debounced draft save on typing
	useEffect(() => {
		if (!sessionId) return;
		if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);

		draftTimeoutRef.current = setTimeout(() => {
			writeDraft(sessionId, value);
		}, 500);

		return () => {
			if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
		};
	}, [value, sessionId]);

	// Auto-resize textarea
	const handleInput = useCallback(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
		}
	}, []);

	// Handle send
	const handleSend = useCallback(async () => {
		const trimmed = value.trim();
		if (!trimmed || isSending) return;

		setIsSending(true);
		try {
			const success = await onSend(trimmed);
			if (success) {
				setValue('');
				if (sessionIdRef.current) writeDraft(sessionIdRef.current, '');
				if (textareaRef.current) {
					textareaRef.current.style.height = 'auto';
				}
			}
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, onSend]);

	// Handle value change — notify mention hook
	const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const newValue = e.target.value;
		const cursorPos = e.target.selectionStart;
		setValue(newValue);
		onMentionChange?.(newValue, cursorPos);
	}, [onMentionChange]);

	// Handle keyboard
	const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
		// Let mention hook handle first (arrow keys, enter, escape when menu is open)
		if (onMentionKeyDown?.(e)) return;

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}, [handleSend, onMentionKeyDown]);

	const canSend = value.trim().length > 0 && !isSending && !disabled;

	return (
		<div className="relative">
			<textarea
				data-testid="chat-input"
				ref={textareaRef}
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onInput={handleInput}
				placeholder={placeholder}
				disabled={disabled || isSending}
				rows={1}
				className="w-full resize-none pl-3 pr-12 py-2 text-[13px] bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
				style={{ maxHeight: '120px', minHeight: '36px' }}
			/>
			{/* Action button — positioned inside textarea area */}
			<div className="absolute right-2 bottom-1.5 flex items-center">
				{isProcessing ? (
					<button
						data-testid="stop-button"
						onClick={onInterrupt}
						className="p-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/10 transition-colors"
						title="Stop (Esc)"
					>
						<Square className="w-3.5 h-3.5" fill="currentColor" />
					</button>
				) : (
					<button
						data-testid="send-button"
						onClick={handleSend}
						disabled={!canSend}
						className="p-1.5 rounded-lg bg-[var(--color-claude)] text-white hover:bg-[var(--color-claude-accent)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
						title="Send (Enter)"
					>
						{isSending ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
						)}
					</button>
				)}
			</div>
		</div>
	);
});

export default ChatInput;
