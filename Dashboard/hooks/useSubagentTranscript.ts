'use client';

/**
 * useSubagentTranscript - Lazy-loading hook for subagent transcript data.
 *
 * Two clean modes:
 * 1. Running agent: discover agentId by prompt → connect SSE from beginning (replays all events)
 * 2. Completed agent: agentId from tool_result → fetch history via REST
 *
 * When an agent transitions from running to completed, SSE closes and history
 * is fetched once to get the final state. No race conditions between SSE and REST.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { TranscriptEvent } from './useConversation';

interface UseSubagentTranscriptOptions {
	sessionId: string | null;
	agentId: string | null;
	prompt?: string;
	enabled: boolean;
	isRunning?: boolean;  // Whether the parent Task is still running
}

interface SubagentTranscriptState {
	events: TranscriptEvent[];
	isLoading: boolean;
	isConnected: boolean;
	resolvedAgentId: string | null;
	error: string | null;
}

export function useSubagentTranscript({
	sessionId,
	agentId,
	prompt,
	enabled,
	isRunning = false,
}: UseSubagentTranscriptOptions): SubagentTranscriptState {
	const [events, setEvents] = useState<TranscriptEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [resolvedAgentId, setResolvedAgentId] = useState<string | null>(agentId);
	const [error, setError] = useState<string | null>(null);

	const eventSourceRef = useRef<EventSource | null>(null);
	const discoverIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// Track whether we need to do a final history fetch on completion
	const wasRunningRef = useRef(isRunning);
	const sseEverConnectedRef = useRef(false);

	// Update resolved agentId when prop changes (e.g., from tool_result)
	useEffect(() => {
		if (agentId && agentId !== resolvedAgentId) {
			setResolvedAgentId(agentId);
		}
	}, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

	// Discover subagent by prompt match (when agentId not yet known)
	useEffect(() => {
		if (!enabled || !sessionId || resolvedAgentId || !prompt || !isRunning) return;

		let attempts = 0;
		const maxAttempts = 30; // 30s window (agents can take a moment to create JSONL)

		const discover = async () => {
			try {
				const params = new URLSearchParams({ session_id: sessionId, prompt: prompt.slice(0, 200) });
				const res = await fetch(`${API_BASE}/api/sessions/subagents/discover?${params}`);
				const data = await res.json();
				if (data.matched) {
					setResolvedAgentId(data.matched);
					if (discoverIntervalRef.current) {
						clearInterval(discoverIntervalRef.current);
						discoverIntervalRef.current = null;
					}
				}
			} catch {
				// Silently retry
			}
			attempts++;
			if (attempts >= maxAttempts && discoverIntervalRef.current) {
				clearInterval(discoverIntervalRef.current);
				discoverIntervalRef.current = null;
			}
		};

		discover();
		discoverIntervalRef.current = setInterval(discover, 1000);

		return () => {
			if (discoverIntervalRef.current) {
				clearInterval(discoverIntervalRef.current);
				discoverIntervalRef.current = null;
			}
		};
	}, [enabled, sessionId, resolvedAgentId, prompt, isRunning]);

	// Fetch history (REST) — used for completed agents or final fetch after SSE
	const fetchHistory = useCallback(async (sid: string, aid: string) => {
		setIsLoading(true);
		setError(null);
		try {
			const params = new URLSearchParams({ session_id: sid });
			const res = await fetch(`${API_BASE}/api/sessions/subagents/${aid}/history?${params}`);
			if (!res.ok) {
				if (res.status === 404) {
					setError('Subagent transcript not found');
				} else {
					setError(`Failed to fetch: ${res.status}`);
				}
				return;
			}
			const data = await res.json();
			setEvents(data.events || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch history');
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Connect SSE stream from beginning — the sole data source while running.
	// SSE replays all events from start and polls for new ones (200ms).
	// No separate history fetch needed — SSE IS the history + live tail.
	const connectStream = useCallback((sid: string, aid: string) => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
		}

		// Clear events — SSE replays from beginning
		setEvents([]);
		setIsLoading(true);

		const params = new URLSearchParams({ session_id: sid });
		const es = new EventSource(`${API_BASE}/api/sessions/subagents/${aid}/stream?${params}`);
		eventSourceRef.current = es;

		const seenUuids = new Set<string>();

		es.onmessage = (msg) => {
			try {
				const event = JSON.parse(msg.data) as TranscriptEvent;
				if (event.type === 'connected') {
					setIsConnected(true);
					setIsLoading(false);
					sseEverConnectedRef.current = true;
					return;
				}
				if (event.type === 'error') {
					setError(event.message || 'Stream error');
					setIsLoading(false);
					return;
				}
				// Deduplicate within the stream itself
				if (event.uuid && seenUuids.has(event.uuid)) return;
				if (event.uuid) seenUuids.add(event.uuid);

				setEvents(prev => [...prev, event]);
			} catch {
				// Skip malformed events
			}
		};

		es.onerror = () => {
			setIsConnected(false);
			es.close();
			eventSourceRef.current = null;
		};
	}, []);

	// Main effect: choose data loading strategy based on state
	useEffect(() => {
		if (!enabled || !sessionId || !resolvedAgentId) return;

		if (isRunning) {
			// RUNNING: Use SSE as sole data source (replays from beginning + live tail)
			connectStream(sessionId, resolvedAgentId);
			wasRunningRef.current = true;
		} else {
			// COMPLETED: Close any SSE, fetch history once
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
				setIsConnected(false);
			}
			// Always fetch history when completed — either:
			// a) Agent was fast and we never got SSE data (discovery didn't resolve in time)
			// b) Agent just transitioned from running→completed, need final state
			// c) We're loading a historical transcript (was never running in this render)
			fetchHistory(sessionId, resolvedAgentId);
		}

		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			setIsConnected(false);
		};
	}, [enabled, sessionId, resolvedAgentId, isRunning, fetchHistory, connectStream]);

	// Cleanup on disable
	useEffect(() => {
		if (!enabled) {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			if (discoverIntervalRef.current) {
				clearInterval(discoverIntervalRef.current);
				discoverIntervalRef.current = null;
			}
			setIsConnected(false);
			wasRunningRef.current = false;
			sseEverConnectedRef.current = false;
		}
	}, [enabled]);

	return {
		events,
		isLoading,
		isConnected,
		resolvedAgentId,
		error,
	};
}
