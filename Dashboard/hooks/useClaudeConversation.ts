'use client';

import { useChatPanel } from '@/components/context/ChatPanelContext';
import type { TranscriptEvent } from '@/hooks/useTranscriptStream';
import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

/**
 * Activity state from Claude Code's tmux output
 */
export interface ClaudeActivity {
	isThinking: boolean;
	activeTask: string | null;
	lastTask: string | null; // From pane title - shows even when idle
	elapsedTime: string | null;
	tokenCount: string | null;
}

/**
 * Context warning from Claude Code
 */
export interface ContextWarning {
	percentRemaining: number;
	percentUsed: number;
	shouldWarn: boolean;
	shouldForceReset: boolean;
}

/**
 * Task item from Claude Code's todo list
 */
export interface TaskItem {
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
	activeForm?: string;
}

/**
 * Session metadata
 */
export interface SessionMeta {
	model: string | null;
	costUsd: number | null;
}

/**
 * Pagination state for conversation history
 */
export interface ConversationPagination {
	hasEarlier: boolean;
	earliestSessionId: string | null;
	totalSessionCount: number;
	loadedSessionCount: number;
	isLoadingEarlier: boolean;
}

/**
 * Complete Claude session state
 */
export interface ClaudeSessionState {
	// Transcript events
	events: TranscriptEvent[];

	// Real-time activity (from tmux)
	activity: ClaudeActivity;

	// Context warning (from Claude Code's native warning)
	contextWarning: ContextWarning | null;

	// Task list (from todo files)
	tasks: TaskItem[];

	// Session metadata
	meta: SessionMeta;

	// Pagination for conversation history
	pagination: ConversationPagination;

	// Connection status
	isConnected: boolean;
	isLoading: boolean;
	error: string | null;

	// Actions
	loadEarlierHistory: () => Promise<void>;
}

interface UseClaudeSessionOptions {
	includeThinking?: boolean;
	conversationId?: string | null;
	/** Only return sessions from last N hours (default 24, null for all) */
	hours?: number | null;
}

/**
 * Unified hook for Claude session data.
 * 
 * Combines:
 * - Transcript events (chat history)
 * - Real-time activity (thinking, active task)
 * - Context warnings
 * - Task list
 * - Session metadata (model, cost)
 * 
 * All from a single SSE connection to /activity-stream
 * 
 * @param sessionId - The session ID to connect to
 * @param options - Optional configuration
 */
export function useClaudeSession(
	sessionId: string | null,
	options?: UseClaudeSessionOptions
): ClaudeSessionState {
	const { getSessionCache, setSessionCache, appendToCache } = useChatPanel();

	const [activity, setActivity] = useState<ClaudeActivity>({
		isThinking: false,
		activeTask: null,
		lastTask: null,
		elapsedTime: null,
		tokenCount: null,
	});

	const [contextWarning, setContextWarning] = useState<ContextWarning | null>(null);
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [meta, setMeta] = useState<SessionMeta>({ model: null, costUsd: null });

	const [pagination, setPagination] = useState<ConversationPagination>({
		hasEarlier: false,
		earliestSessionId: null,
		totalSessionCount: 0,
		loadedSessionCount: 0,
		isLoadingEarlier: false,
	});

	const [isConnected, setIsConnected] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttemptsRef = useRef(0);

	const MAX_RECONNECT_ATTEMPTS = 5;

	// Get cached events
	const cache = sessionId ? getSessionCache(sessionId) : undefined;
	const events = cache?.events || [];

	// Fetch initial status (REST endpoint)
	const fetchInitialStatus = useCallback(async (sid: string, convId?: string | null) => {
		setIsLoading(true);
		setError(null);

		try {
			// If we have a conversation ID, first fetch conversation history (bounded by hours)
			if (convId) {
				const hoursParam = options?.hours !== undefined ? options.hours : 24;
				const hoursQuery = hoursParam !== null ? `&hours=${hoursParam}` : '';
				const historyUrl = `${API_BASE}/api/system/sessions/conversation/${convId}/transcript/history?include_thinking=${options?.includeThinking ?? true}${hoursQuery}`;
				const historyRes = await fetch(historyUrl);
				if (historyRes.ok) {
					const historyData = await historyRes.json();
					const historyEvents: TranscriptEvent[] = historyData.events || [];
					const lastEvent = historyEvents.at(-1);
					setSessionCache(sid, {
						events: historyEvents,
						lastEventUuid: lastEvent?.uuid || null,
						loadedAt: Date.now(),
					});
					// Update pagination state
					setPagination({
						hasEarlier: historyData.has_earlier || false,
						earliestSessionId: historyData.earliest_session_id || null,
						totalSessionCount: historyData.total_session_count || 0,
						loadedSessionCount: historyData.session_count || 0,
						isLoadingEarlier: false,
					});
				}
			}

			// Then fetch current activity status
			const statusUrl = `${API_BASE}/api/system/sessions/${sid}/activity-status?include_thinking=${options?.includeThinking ?? true}`;
			const statusRes = await fetch(statusUrl);

			if (!statusRes.ok) {
				const data = await statusRes.json().catch(() => ({}));
				throw new Error(data.detail || `Failed to fetch status: ${statusRes.status}`);
			}

			const data = await statusRes.json();

			// Update cache with events if we didn't fetch conversation history
			if (!convId && data.events?.length) {
				const lastEvent = data.events.at(-1);
				setSessionCache(sid, {
					events: data.events,
					lastEventUuid: lastEvent?.uuid || null,
					loadedAt: Date.now(),
				});
			}

			// Update activity state
			if (data.activity) {
				setActivity({
					isThinking: data.activity.is_thinking || false,
					activeTask: data.activity.active_task || null,
					lastTask: data.activity.last_task || null,
					elapsedTime: data.activity.elapsed_time || null,
					tokenCount: data.activity.token_count || null,
				});
			}

			// Update context warning
			if (data.context_warning?.should_warn) {
				setContextWarning({
					percentRemaining: data.context_warning.percent_remaining,
					percentUsed: data.context_warning.percent_used,
					shouldWarn: true,
					shouldForceReset: data.context_warning.should_force_reset || false,
				});
			} else {
				setContextWarning(null);
			}

			// Update tasks
			if (data.tasks) {
				setTasks(data.tasks.map((t: Record<string, unknown>) => ({
					content: t.content as string || '',
					status: (t.status as string) || 'pending',
					activeForm: t.activeForm as string | undefined,
				})));
			}

			// Update meta
			if (data.session_meta) {
				setMeta({
					model: data.session_meta.model || null,
					costUsd: data.session_meta.cost_usd || null,
				});
			}

		} catch (err) {
			console.error('[useClaudeSession] Initial fetch error:', err);
			setError(err instanceof Error ? err.message : 'Failed to fetch status');
		} finally {
			setIsLoading(false);
		}
	}, [options?.includeThinking, options?.hours, setSessionCache]);

	// Load earlier history (pagination)
	const loadEarlierHistory = useCallback(async () => {
		const convId = options?.conversationId;
		if (!convId || !pagination.hasEarlier || !pagination.earliestSessionId || pagination.isLoadingEarlier) {
			return;
		}

		setPagination(prev => ({ ...prev, isLoadingEarlier: true }));

		try {
			const url = `${API_BASE}/api/system/sessions/conversation/${convId}/transcript/history?include_thinking=${options?.includeThinking ?? true}&before_session=${pagination.earliestSessionId}&limit_sessions=5`;
			const res = await fetch(url);
			if (!res.ok) {
				throw new Error(`Failed to load earlier history: ${res.status}`);
			}

			const data = await res.json();
			const earlierEvents: TranscriptEvent[] = data.events || [];

			if (earlierEvents.length > 0 && sessionId) {
				// Prepend events to cache
				const existingCache = getSessionCache(sessionId);
				const existingEvents = existingCache?.events || [];
				setSessionCache(sessionId, {
					events: [...earlierEvents, ...existingEvents],
					lastEventUuid: existingCache?.lastEventUuid || null,
					loadedAt: Date.now(),
				});
			}

			setPagination(prev => ({
				...prev,
				hasEarlier: data.has_earlier || false,
				earliestSessionId: data.earliest_session_id || null,
				loadedSessionCount: prev.loadedSessionCount + (data.session_count || 0),
				isLoadingEarlier: false,
			}));
		} catch (err) {
			console.error('[useClaudeSession] Load earlier history error:', err);
			setPagination(prev => ({ ...prev, isLoadingEarlier: false }));
		}
	}, [options?.conversationId, options?.includeThinking, pagination.hasEarlier, pagination.earliestSessionId, pagination.isLoadingEarlier, sessionId, getSessionCache, setSessionCache]);

	// Connect to SSE activity stream
	const connectSSE = useCallback((sid: string) => {
		// Close existing connection
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
		}

		const params = new URLSearchParams({
			include_thinking: String(options?.includeThinking ?? true),
		});

		const url = `${API_BASE}/api/system/sessions/${sid}/activity-stream?${params}`;
		const es = new EventSource(url);
		eventSourceRef.current = es;

		// Handle connected event
		es.addEventListener('connected', () => {
			setIsConnected(true);
			setError(null);
			reconnectAttemptsRef.current = 0;
			console.log('[useClaudeSession] Connected to activity stream');
		});

		// Handle transcript events
		es.addEventListener('transcript', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.event) {
					appendToCache(sid, data.event);
				}
			} catch (err) {
				console.error('[useClaudeSession] Failed to parse transcript event:', err);
			}
		});

		// Handle activity events
		es.addEventListener('activity', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.data) {
					setActivity({
						isThinking: data.data.is_thinking || false,
						activeTask: data.data.active_task || null,
						lastTask: data.data.last_task || null,
						elapsedTime: data.data.elapsed_time || null,
						tokenCount: data.data.token_count || null,
					});
				}
			} catch (err) {
				console.error('[useClaudeSession] Failed to parse activity event:', err);
			}
		});

		// Handle context warning events
		es.addEventListener('context_warning', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.data?.should_warn) {
					setContextWarning({
						percentRemaining: data.data.percent_remaining,
						percentUsed: data.data.percent_used,
						shouldWarn: true,
						shouldForceReset: data.data.should_force_reset || false,
					});
				} else {
					setContextWarning(null);
				}
			} catch (err) {
				console.error('[useClaudeSession] Failed to parse warning event:', err);
			}
		});

		// Handle task list events
		es.addEventListener('tasks', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.data?.items) {
					setTasks(data.data.items.map((t: Record<string, unknown>) => ({
						content: t.content as string || '',
						status: (t.status as string) || 'pending',
						activeForm: t.activeForm as string | undefined,
					})));
				}
			} catch (err) {
				console.error('[useClaudeSession] Failed to parse tasks event:', err);
			}
		});

		// Handle session meta events
		es.addEventListener('session_meta', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.data) {
					setMeta({
						model: data.data.model || null,
						costUsd: data.data.cost_usd || null,
					});
				}
			} catch (err) {
				console.error('[useClaudeSession] Failed to parse meta event:', err);
			}
		});

		// Handle errors
		es.addEventListener('error', (e) => {
			try {
				// Try to parse error data if available
				const messageEvent = e as MessageEvent;
				if (messageEvent.data) {
					const data = JSON.parse(messageEvent.data);
					setError(data.message || 'Stream error');
				}
			} catch {
				// Generic error
			}
		});

		es.onerror = () => {
			setIsConnected(false);
			es.close();

			// Attempt reconnection with exponential backoff
			if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
				const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
				reconnectAttemptsRef.current++;

				console.log(`[useClaudeSession] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

				reconnectTimeoutRef.current = setTimeout(() => {
					connectSSE(sid);
				}, delay);
			} else {
				setError('Connection lost. Please close and reopen the panel.');
			}
		};
	}, [options?.includeThinking, appendToCache]);

	// Main effect: setup connection
	useEffect(() => {
		if (!sessionId) {
			setIsConnected(false);
			setError(null);
			setIsLoading(false);
			setActivity({ isThinking: false, activeTask: null, lastTask: null, elapsedTime: null, tokenCount: null });
			setContextWarning(null);
			setTasks([]);
			setMeta({ model: null, costUsd: null });
			setPagination({ hasEarlier: false, earliestSessionId: null, totalSessionCount: 0, loadedSessionCount: 0, isLoadingEarlier: false });
			return;
		}

		const existingCache = getSessionCache(sessionId);

		const setup = async () => {
			// If no cache, fetch initial status
			if (!existingCache) {
				await fetchInitialStatus(sessionId, options?.conversationId);
			}

			// Connect to SSE stream
			connectSSE(sessionId);
		};

		setup();

		return () => {
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
			}
		};
	}, [sessionId, options?.conversationId, getSessionCache, fetchInitialStatus, connectSSE]);

	return {
		events,
		activity,
		contextWarning,
		tasks,
		meta,
		pagination,
		isConnected,
		isLoading,
		error,
		loadEarlierHistory,
	};
}

// Alias for semantic consistency (this hook still operates on individual sessions)
export const useClaudeConversation = useClaudeSession;

export default useClaudeSession;

