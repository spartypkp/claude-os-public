'use client';

/**
 * ClaudePanel - Main Claude Conversation Panel
 *
 * Orchestrator component that composes:
 * - ConversationList (conversation tabs)
 * - TranscriptViewer (conversation display)
 * - InputArea (chat input + attachments)
 * - MinimizedView (collapsed state)
 * - EmptyState (no session state)
 *
 * See SYSTEM-SPEC.md for architecture details.
 */

import { useChatPanel } from '@/components/context/ChatPanelContext';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { useChiefStatus } from '@/hooks/useChiefStatus';
import { useClaudeActivity } from '@/hooks/useClaudeActivity';
import { useClaudeSession } from '@/hooks/useClaudeConversation';
import { useClaudeActivityState } from '@/hooks/useClaudeActivityState';
import { useWorkers } from '@/hooks/useWorkers';
import { useEventStream } from '@/hooks/useEventStream';
import { AlertCircle, Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// Local components
import { ChatInputHandle } from './ChatInput';
import { ActiveTaskBanner } from './ClaudeActivityHeader';
import { ClaudeActivityIndicator } from './ClaudeActivityIndicator';
import { ContextWarningBanner } from './ContextWarningBanner';
import { EmptyState } from './EmptyState';
import { InputArea } from './InputArea';
import { MinimizedView } from './MinimizedView';
import { ConversationList } from './ConversationList';
import { TaskListPanel } from './TaskListPanel';

// Constants and hooks
import {
	API_BASE,
	MINIMIZED_PANEL_WIDTH,
	ROLE_NAMES,
} from './constants';
import { useAttachments, useDragDrop, usePanelResize } from './hooks';

// =============================================================================
// TYPES
// =============================================================================

interface ClaudePanelProps {
	isVisible: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClaudePanel({ isVisible }: ClaudePanelProps) {
	// ─────────────────────────────────────────────────────────────────────────
	// CONTEXT & EXTERNAL HOOKS
	// ─────────────────────────────────────────────────────────────────────────

	const {
		sessionId,
		sessionRole,
		openSession,
		closePanel,
		setSession,
	} = useChatPanel();

	const claudeActivity = useClaudeActivity();
	const chiefStatus = useChiefStatus();
	const { runningCount: activeWorkerCount } = useWorkers();
	const { connected: sseConnected } = useEventStream();
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	// Get conversation_id for the selected session (enables full history)
	const currentSession = sessionId
		? claudeActivity.sessions.find(s => s.session_id === sessionId)
		: null;
	const conversationId = currentSession?.conversation_id;

	// Unified session data
	const {
		events,
		activity,
		contextWarning,
		tasks,
		pagination,
		isConnected,
		isLoading,
		error: transcriptError,
		loadEarlierHistory,
	} = useClaudeSession(sessionId, {
		includeThinking: true,
		conversationId,
		hours: 24, // Load last 24 hours of conversation history
	});

	// ─────────────────────────────────────────────────────────────────────────
	// LOCAL STATE
	// ─────────────────────────────────────────────────────────────────────────

	const [sendError, setSendError] = useState<string | null>(null);
	const [hasInitialized, setHasInitialized] = useState(false);
	const [isPanelFocused, setIsPanelFocused] = useState(false);
	const [isMinimized, setIsMinimized] = useState(false);

	// Activity indicator state
	const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
	const [eventCountAtSend, setEventCountAtSend] = useState(0);

	const panelRef = useRef<HTMLElement>(null);
	const chatInputRef = useRef<ChatInputHandle>(null);

	// ─────────────────────────────────────────────────────────────────────────
	// EXTRACTED HOOKS
	// ─────────────────────────────────────────────────────────────────────────

	const { panelWidth, isResizing, startResize } = usePanelResize();

	const {
		attachedFiles,
		addAttachment,
		removeAttachment,
		togglePreview,
		clearAttachments,
		formatBytes,
	} = useAttachments({ sessionId });

	const {
		isDragOver,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
	} = useDragDrop({
		onAttach: addAttachment,
		onError: setSendError,
	});

	// ─────────────────────────────────────────────────────────────────────────
	// DERIVED STATE
	// ─────────────────────────────────────────────────────────────────────────

	const activeSessions = claudeActivity.sessions.filter(s => !s.ended_at);
	const roleName = sessionRole ? ROLE_NAMES[sessionRole] || sessionRole : 'Claude';
	const error = transcriptError || sendError;
	const hasAnySession = activeSessions.length > 0 || chiefStatus.isRunning;
	const currentWidth = !isVisible ? 0 : isMinimized ? MINIMIZED_PANEL_WIDTH : panelWidth;

	// Activity state from transcript event analysis
	const activityState = useClaudeActivityState(events, isWaitingForResponse, eventCountAtSend);

	// ─────────────────────────────────────────────────────────────────────────
	// SESSION SYNC EFFECTS
	// ─────────────────────────────────────────────────────────────────────────

	// Initialize from URL param on first load
	useEffect(() => {
		if (hasInitialized || activeSessions.length === 0) return;

		const urlConversationId = searchParams.get('conversation');
		if (urlConversationId) {
			// Match against conversation_id first, fall back to session_id
			const session = activeSessions.find(s =>
				s.conversation_id === urlConversationId || s.session_id === urlConversationId
			);
			if (session) {
				const role = session.role || session.session_subtype || 'chief';
				openSession(session.session_id, role);
				setHasInitialized(true);
				return;
			}
			// Session not found - clear the URL param
			const newParams = new URLSearchParams(searchParams.toString());
			newParams.delete('conversation');
			router.replace(`${pathname}${newParams.toString() ? `?${newParams.toString()}` : ''}`);
		}
		setHasInitialized(true);
	}, [hasInitialized, activeSessions, searchParams, openSession, router, pathname]);

	// Auto-select Chief if no session is selected and Chief is running
	useEffect(() => {
		if (!hasInitialized) return;
		if (!sessionId && activeSessions.length > 0) {
			const chiefSession = activeSessions.find(s =>
				s.role === 'chief' || s.session_subtype === 'chief' || s.session_subtype === 'main'
			);
			if (chiefSession) {
				openSession(chiefSession.session_id, 'chief');
			}
		}
	}, [hasInitialized, sessionId, activeSessions, openSession]);

	// If selected session ends, switch to Chief or clear selection
	useEffect(() => {
		if (!sessionId || claudeActivity.isLoading) return;
		const stillActive = activeSessions.some(s => s.session_id === sessionId);
		if (stillActive) return;

		const chiefSession = activeSessions.find(s =>
			s.role === 'chief' || s.session_subtype === 'chief' || s.session_subtype === 'main'
		);

		if (chiefSession) {
			openSession(chiefSession.session_id, 'chief');
		} else {
			setSession(null, null);
		}
	}, [sessionId, activeSessions, claudeActivity.isLoading, openSession, setSession]);

	// Update URL when session changes
	useEffect(() => {
		if (!hasInitialized) return;
		const currentUrlConversation = searchParams.get('conversation');
		// Use conversation_id if available, otherwise fall back to session_id
		const conversationParam = conversationId || sessionId;
		if (conversationParam !== currentUrlConversation) {
			const newParams = new URLSearchParams(searchParams.toString());
			if (conversationParam) {
				newParams.set('conversation', conversationParam);
			} else {
				newParams.delete('conversation');
			}
			router.replace(`${pathname}${newParams.toString() ? `?${newParams.toString()}` : ''}`, { scroll: false });
		}
	}, [sessionId, conversationId, hasInitialized, searchParams, router, pathname]);

	// ─────────────────────────────────────────────────────────────────────────
	// INPUT FOCUS & PANEL FOCUS EFFECTS
	// ─────────────────────────────────────────────────────────────────────────

	// Focus input when panel becomes visible or session changes
	useEffect(() => {
		if (isVisible && sessionId) {
			setTimeout(() => chatInputRef.current?.focus(), 100);
		}
	}, [isVisible, sessionId]);

	// Track whether the panel is focused (input or transcript)
	useEffect(() => {
		const panel = panelRef.current;
		if (!panel) return;

		const handleFocusIn = () => setIsPanelFocused(true);
		const handleFocusOut = () => {
			setTimeout(() => {
				const activeElement = document.activeElement;
				setIsPanelFocused(panel.contains(activeElement));
			}, 0);
		};

		panel.addEventListener('focusin', handleFocusIn);
		panel.addEventListener('focusout', handleFocusOut);
		return () => {
			panel.removeEventListener('focusin', handleFocusIn);
			panel.removeEventListener('focusout', handleFocusOut);
		};
	}, []);

	// ─────────────────────────────────────────────────────────────────────────
	// ASK CHIEF EVENT LISTENER
	// ─────────────────────────────────────────────────────────────────────────

	useEffect(() => {
		const handleAskChief = async (e: Event) => {
			const customEvent = e as CustomEvent<{ path: string; itemName: string; }>;
			const { path, itemName } = customEvent.detail;

			const chiefSession = activeSessions.find(s =>
				s.role === 'chief' || s.session_subtype === 'chief' || s.session_subtype === 'main'
			);

			if (chiefSession) {
				openSession(chiefSession.session_id, 'chief');
				if (path) {
					addAttachment(path);
				}
				setTimeout(() => {
					chatInputRef.current?.setValue(`Please explain "${itemName}" in more detail. What is it, how does it work, and how should I use it?`);
					chatInputRef.current?.focus();
				}, 100);
			} else {
				setSendError('Chief is not running. Start Chief first to ask questions.');
			}
		};

		window.addEventListener('ask-chief', handleAskChief);
		return () => window.removeEventListener('ask-chief', handleAskChief);
	}, [activeSessions, openSession, addAttachment]);

	// ─────────────────────────────────────────────────────────────────────────
	// SESSION HANDLERS
	// ─────────────────────────────────────────────────────────────────────────

	const handleSelectSession = useCallback((sid: string, role: string) => {
		openSession(sid, role);
	}, [openSession]);

	const handleEndSession = useCallback(async (sid: string) => {
		try {
			const response = await fetch(`${API_BASE}/api/system/sessions/${sid}/end`, { method: 'POST' });
			const data = await response.json();
			if (data.success) {
				claudeActivity.refresh();
				if (sid === sessionId) {
					const remaining = activeSessions.filter(s => s.session_id !== sid);
					if (remaining.length > 0) {
						const next = remaining[0];
						const nextRole = next.role || next.session_subtype || 'chief';
						openSession(next.session_id, nextRole);
					} else {
						closePanel();
					}
				}
			}
		} catch (err) {
			console.error('Failed to end session:', err);
		}
	}, [sessionId, activeSessions, claudeActivity, openSession, closePanel]);

	const handleForceHandoff = useCallback(async (sid: string) => {
		try {
			await fetch(`${API_BASE}/api/system/sessions/${sid}/force-handoff`, { method: 'POST' });
		} catch (err) {
			console.error('Failed to force handoff:', err);
		}
	}, []);

	const handleResetChief = useCallback(async () => {
		try {
			const response = await fetch(`${API_BASE}/api/chief/reset`, { method: 'POST' });
			const data = await response.json();
			if (data.success) {
				claudeActivity.refresh();
			}
		} catch (err) {
			console.error('Failed to reset Chief:', err);
		}
	}, [claudeActivity]);

	const handleSpawnChief = useCallback(async () => {
		await chiefStatus.spawnChief();
		claudeActivity.refresh();
	}, [chiefStatus, claudeActivity]);

	// ─────────────────────────────────────────────────────────────────────────
	// MESSAGE HANDLERS
	// ─────────────────────────────────────────────────────────────────────────

	const sendMessage = useCallback(async (message: string) => {
		if (!sessionId) return;
		setSendError(null);

		// Capture event count before sending
		setEventCountAtSend(events.length);
		setIsWaitingForResponse(true);

		try {
			const messageBlocks: string[] = [];
			if (attachedFiles.length > 0) {
				const attachmentLines = attachedFiles.map((item) => `@${item.path}`);
				messageBlocks.push(`[Attached Files]:\n${attachmentLines.join('\n')}`);
			}
			if (message.trim()) {
				messageBlocks.push(message.trim());
			}
			const fullMessage = messageBlocks.join('\n\n');

			const response = await fetch(`${API_BASE}/api/system/sessions/${sessionId}/say`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: fullMessage }),
			});

			const data = await response.json();
			if (!response.ok || !data.success) {
				throw new Error(data.error || data.detail || 'Failed to send message');
			}

			clearAttachments();
		} catch (err) {
			setSendError(err instanceof Error ? err.message : 'Failed to send message');
			setIsWaitingForResponse(false);
			throw err;
		}
	}, [sessionId, attachedFiles, clearAttachments, events.length]);

	const handleInterrupt = useCallback(async () => {
		if (!sessionId) return;
		try {
			const response = await fetch(`${API_BASE}/api/system/sessions/${sessionId}/interrupt`, {
				method: 'POST',
			});
			const data = await response.json();
			if (!data.success) {
				setSendError(data.error || 'Failed to interrupt session');
			}
		} catch (err) {
			setSendError(err instanceof Error ? err.message : 'Failed to interrupt session');
		}
	}, [sessionId]);

	// Global Escape key handler
	useEffect(() => {
		if (!isVisible || !sessionId) return;

		const handleGlobalEscape = (e: globalThis.KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			if (!isPanelFocused) return;

			const activeElement = document.activeElement;
			const isInModal = activeElement?.closest('[role="dialog"]');
			if (isInModal) return;

			e.preventDefault();
			handleInterrupt();
		};

		window.addEventListener('keydown', handleGlobalEscape);
		return () => window.removeEventListener('keydown', handleGlobalEscape);
	}, [isVisible, sessionId, isPanelFocused, handleInterrupt]);

	// Reset waiting state when activity completes
	useEffect(() => {
		if (activityState.type === 'complete' || activityState.type === 'idle') {
			setIsWaitingForResponse(false);
		}
	}, [activityState.type]);

	const handleCompact = useCallback(async () => {
		if (!sessionId) return;
		try {
			await fetch(`${API_BASE}/api/system/sessions/${sessionId}/say`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: '/compact' }),
			});
		} catch (err) {
			console.error('Failed to send /compact:', err);
		}
	}, [sessionId]);

	// ─────────────────────────────────────────────────────────────────────────
	// RENDER
	// ─────────────────────────────────────────────────────────────────────────

	return (
		<aside
			ref={panelRef}
			style={{ width: `${currentWidth}px` }}
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={`
				h-full relative flex flex-col shrink-0
				bg-[var(--surface-claude)]
				border-l border-[var(--border-claude)]
				shadow-[-4px_0_20px_rgba(0,0,0,0.15)]
				transition-all duration-200 ease-out overflow-hidden
				${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
			`}
		>
			{/* MINIMIZED STATE */}
			{isMinimized ? (
				<MinimizedView
					sessions={activeSessions}
					selectedSessionId={sessionId}
					onSelectSession={handleSelectSession}
					onExpand={() => setIsMinimized(false)}
					onSpawnChief={handleSpawnChief}
				/>
			) : (
				/* EXPANDED STATE */
				<>
					{/* Drag overlay */}
					{isDragOver && (
						<div className="absolute inset-2 z-20 rounded-xl border-2 border-dashed border-[var(--color-claude)] bg-[var(--color-claude-dim)] pointer-events-none flex items-center justify-center">
							<div className="text-center">
								<div className="text-xs font-medium text-[var(--color-claude)]">Drop to attach</div>
								<div className="text-[10px] text-[var(--color-claude)]/80 mt-1">External files import to Desktop/Inbox</div>
							</div>
						</div>
					)}

					{/* Resize handle */}
					<div
						onMouseDown={startResize}
						className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--surface-muted)] transition-colors z-10"
						title="Drag to resize"
					/>

					{/* Conversation list */}
					<div className="border-b border-[var(--border-subtle)] bg-[var(--surface-claude-raised)]">
						<ConversationList
							sessions={activeSessions}
							selectedSessionId={sessionId}
							onSelectSession={handleSelectSession}
							onEndSession={handleEndSession}
							onForceHandoff={handleForceHandoff}
							onResetChief={handleResetChief}
							onSpawnChief={handleSpawnChief}
							onRefresh={claudeActivity.refresh}
							isChiefRunning={chiefStatus.isRunning}
							onMinimize={() => setIsMinimized(true)}
							activeWorkerCount={activeWorkerCount}
							sseConnected={sseConnected}
						/>
					</div>
				</>
			)}

			{/* Context warning banner */}
			{!isMinimized && sessionId && contextWarning && (
				<ContextWarningBanner
					warning={contextWarning}
					onCompact={handleCompact}
					onReset={() => handleForceHandoff(sessionId)}
				/>
			)}

			{/* Task list panel */}
			{!isMinimized && sessionId && tasks.length > 0 && (
				<TaskListPanel tasks={tasks} />
			)}

			{/* Transcript area */}
			{!isMinimized && (
				<div className="flex-1 overflow-hidden bg-[var(--surface-claude)]">
					{!sessionId ? (
						<EmptyState
							hasAnySession={hasAnySession}
							onSpawnChief={handleSpawnChief}
						/>
					) : isLoading ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
							<span className="ml-2 text-xs text-[var(--text-tertiary)]">Loading...</span>
						</div>
					) : (
						<div className="h-full flex flex-col">
							<div className="flex-1 overflow-auto px-3 py-2" tabIndex={0} aria-label="Claude transcript">
								<TranscriptViewer
									events={events}
									isConnected={isConnected}
									role={sessionRole || undefined}
									activityIndicator={
										<ClaudeActivityIndicator
											state={activityState}
											roleName={roleName}
											role={sessionRole}
										/>
									}
									pagination={pagination}
									onLoadEarlier={loadEarlierHistory}
								/>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Error display */}
			{!isMinimized && error && (
				<div className="px-3 py-2 bg-[var(--color-error-dim)] border-t border-[var(--color-error)]/20">
					<div className="flex items-center gap-2 text-[10px] text-[var(--color-error)]">
						<AlertCircle className="w-3 h-3 shrink-0" />
						<span>{error}</span>
					</div>
				</div>
			)}

			{/* Active task banner */}
			{!isMinimized && sessionId && (
				<ActiveTaskBanner activity={activity} />
			)}

			{/* Input area */}
			{!isMinimized && sessionId && (
				<InputArea
					sessionId={sessionId}
					roleName={roleName}
					attachedFiles={attachedFiles}
					chatInputRef={chatInputRef}
					formatBytes={formatBytes}
					onSend={sendMessage}
					onInterrupt={handleInterrupt}
					onRemoveAttachment={removeAttachment}
					onTogglePreview={togglePreview}
				/>
			)}
		</aside>
	);
}

export default ClaudePanel;
