'use client';

import { Loader2, Send, Square } from 'lucide-react';
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
	onSend: (message: string) => Promise<void>;
	onInterrupt: () => void;
}

export interface ChatInputHandle {
	focus: () => void;
	clear: () => void;
	getValue: () => string;
	setValue: (value: string) => void;
}

/**
 * Self-contained chat input component.
 * Manages its own state + per-conversation draft persistence in localStorage.
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
	{ sessionId, placeholder, onSend, onInterrupt },
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
			textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
		}
	}, []);

	// Handle send
	const handleSend = useCallback(async () => {
		const trimmed = value.trim();
		if (!trimmed || isSending) return;

		setIsSending(true);
		try {
			await onSend(trimmed);
			setValue('');
			if (sessionIdRef.current) writeDraft(sessionIdRef.current, '');
			if (textareaRef.current) {
				textareaRef.current.style.height = '32px';
			}
		} finally {
			setIsSending(false);
		}
	}, [value, isSending, onSend]);

	// Handle keyboard
	const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}, [handleSend]);

	const canSend = value.trim().length > 0 && !isSending;

	return (
		<div className="flex items-end gap-1.5">
			<textarea
				data-testid="chat-input"
				ref={textareaRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onInput={handleInput}
				placeholder={placeholder}
				disabled={isSending}
				rows={1}
				className="flex-1 resize-none px-2.5 py-1.5 text-xs bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#444] rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#888] focus:outline-none focus:border-gray-300 dark:focus:border-[#555] disabled:opacity-50 disabled:cursor-not-allowed"
				style={{ maxHeight: '100px', minHeight: '32px' }}
			/>
			<button
				data-testid="stop-button"
				onClick={onInterrupt}
				className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30 transition-all shrink-0"
				title="Stop (Esc)"
			>
				<Square className="w-3.5 h-3.5" />
			</button>
			<button
				data-testid="send-button"
				onClick={handleSend}
				disabled={!canSend}
				className="p-2 rounded-lg bg-gradient-to-b from-[#da7756] to-[#C15F3C] text-white hover:from-[#e08566] hover:to-[#d16f4c] disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
				title="Send (Enter)"
			>
				{isSending ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : (
					<Send className="w-3.5 h-3.5" />
				)}
			</button>
		</div>
	);
});

export default ChatInput;
