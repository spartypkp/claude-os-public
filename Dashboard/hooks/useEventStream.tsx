/**
 * EventStreamProvider - Single SSE connection for all Dashboard updates.
 * 
 * Jan 2026 Architecture Overhaul:
 * Instead of 33 polling intervals (200+ API calls/min), we have:
 * - 1 SSE connection to /api/events
 * - Server pushes changes as they happen
 * - Provider invalidates React Query cache on events
 * 
 * Usage:
 *   // In your app root
 *   <EventStreamProvider>
 *     <YourApp />
 *   </EventStreamProvider>
 * 
 *   // In components
 *   const { connected, lastEvent } = useEventStream();
 */

'use client';

import { eventToQueryKeys } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface EventStreamContextValue {
	/** Whether SSE is currently connected */
	connected: boolean;
	/** Last event received (for debugging) */
	lastEvent: SystemEvent | null;
	/** Number of events received this session */
	eventCount: number;
	/** Manually reconnect (useful after network issues) */
	reconnect: () => void;
}

interface SystemEvent {
	type: string;
	data: Record<string, unknown>;
	timestamp: string;
}

const EventStreamContext = createContext<EventStreamContextValue | null>(null);

interface EventStreamProviderProps {
	children: ReactNode;
}

export function EventStreamProvider({ children }: EventStreamProviderProps) {
	const queryClient = useQueryClient();
	const [connected, setConnected] = useState(false);
	const [lastEvent, setLastEvent] = useState<SystemEvent | null>(null);
	const [eventCount, setEventCount] = useState(0);

	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttempts = useRef(0);
	const isVisibleRef = useRef(true);

	const connect = () => {
		// Don't connect if tab is hidden
		if (!isVisibleRef.current) return;

		// Clean up existing connection
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
		}

		const eventSource = new EventSource(`${API_BASE}/api/events`);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			setConnected(true);
			reconnectAttempts.current = 0;
		};

		eventSource.onerror = () => {
			setConnected(false);
			eventSource.close();

			// Exponential backoff reconnect
			const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
			reconnectAttempts.current++;

			reconnectTimeoutRef.current = setTimeout(connect, delay);
		};

		// Handle all event types
		eventSource.onmessage = (e) => {
			try {
				const event: SystemEvent = JSON.parse(e.data);

				// Skip ping events
				if (event.type === 'ping' || event.type === 'connected') return;

				setLastEvent(event);
				setEventCount((c) => c + 1);

				// Invalidate relevant caches
				const queryKeys = eventToQueryKeys[event.type];
				if (queryKeys) {
					queryKeys.forEach((key) => {
						queryClient.invalidateQueries({ queryKey: key });
					});
				}
			} catch {
				// Ignore parse errors
			}
		};

		// Also listen for specific event types (SSE can send named events)
		const eventTypes = [
			'session.started', 'session.ended', 'session.state', 'session.status',
			'worker.created', 'worker.started', 'worker.completed', 'worker.acked', 'worker.cancelled', 'worker.output_updated',
			'priority.created', 'priority.updated', 'priority.completed', 'priority.deleted',
			'mission.created', 'mission.updated', 'mission.deleted', 'mission.started', 'mission.completed',
			'file.created', 'file.modified', 'file.deleted', 'file.moved',
			'email.sent', 'email.queued', 'email.cancelled', 'email.read',
			'email.flagged', 'email.deleted',
			'calendar.created', 'calendar.updated', 'calendar.deleted',
			'contact.created', 'contact.updated', 'contact.deleted',
			'message.sent', 'message.received',
		];

		eventTypes.forEach((eventType) => {
			eventSource.addEventListener(eventType, (e: MessageEvent) => {
				try {
					const event: SystemEvent = JSON.parse(e.data);

					setLastEvent(event);
					setEventCount((c) => c + 1);

					// Invalidate relevant caches
					const queryKeys = eventToQueryKeys[eventType];
					if (queryKeys) {
						queryKeys.forEach((key) => {
							queryClient.invalidateQueries({ queryKey: key });
						});
					}
				} catch {
					// Ignore parse errors
				}
			});
		});
	};

	const reconnect = () => {
		reconnectAttempts.current = 0;
		connect();
	};

	// Handle visibility changes - pause when tab hidden
	useEffect(() => {
		const handleVisibilityChange = () => {
			isVisibleRef.current = !document.hidden;

			if (document.hidden) {
				// Tab hidden - close connection to save resources
				if (eventSourceRef.current) {
					eventSourceRef.current.close();
					setConnected(false);
				}
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current);
				}
			} else {
				// Tab visible - reconnect and refresh stale data
				connect();
				// Mark all queries as stale to trigger background refetch
				queryClient.invalidateQueries();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [queryClient]);

	// Initial connection
	useEffect(() => {
		connect();

		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
		};
	}, []);

	return (
		<EventStreamContext.Provider value={{ connected, lastEvent, eventCount, reconnect }}>
			{children}
		</EventStreamContext.Provider>
	);
}

/**
 * Hook to access event stream status.
 * 
 * Usage:
 *   const { connected, lastEvent, eventCount, reconnect } = useEventStream();
 */
export function useEventStream() {
	const context = useContext(EventStreamContext);
	if (!context) {
		throw new Error('useEventStream must be used within EventStreamProvider');
	}
	return context;
}
