'use client';

/**
 * FileEventProvider + useFileEvents
 *
 * Feb 2026: Consolidated from N EventSource connections (one per hook call)
 * to a single shared SSE connection via React context.
 *
 * Before: Each useFileEvents() call opened its own EventSource to /api/files/events.
 * Desktop + TrashIcon + Finder + 2 editors = 5 concurrent SSE connections.
 *
 * After: FileEventProvider maintains one connection. useFileEvents subscribes
 * to the provider's event bus. All existing call sites work unchanged.
 */

import { API_BASE } from '@/lib/api';
import { createContext, ReactNode, useContext, useEffect, useRef, useState, useCallback } from 'react';

/**
 * File change event from SSE stream.
 */
export interface FileChangeEvent {
	path: string;      // Relative path: 'Desktop/TODAY.md'
	mtime: string;     // ISO timestamp
	dest_path?: string; // For move events
}

export type FileEventType = 'created' | 'modified' | 'deleted' | 'moved';

type FileEventHandler = (event: FileChangeEvent) => void;

interface FileEventSubscription {
	id: number;
	onCreated?: FileEventHandler;
	onModified?: FileEventHandler;
	onDeleted?: FileEventHandler;
	onMoved?: FileEventHandler;
}

interface FileEventContextValue {
	connected: boolean;
	subscribe: (handlers: Omit<FileEventSubscription, 'id'>) => number;
	unsubscribe: (id: number) => void;
}

const FileEventContext = createContext<FileEventContextValue | null>(null);

let nextSubscriptionId = 0;

// ============================================================================
// Provider — one SSE connection, dispatches to all subscribers
// ============================================================================

export function FileEventProvider({ children }: { children: ReactNode }) {
	const [connected, setConnected] = useState(false);
	const subscriptionsRef = useRef<Map<number, FileEventSubscription>>(new Map());
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const isVisibleRef = useRef(true);

	const dispatch = useCallback((eventType: FileEventType, data: FileChangeEvent) => {
		for (const sub of subscriptionsRef.current.values()) {
			switch (eventType) {
				case 'created': sub.onCreated?.(data); break;
				case 'modified': sub.onModified?.(data); break;
				case 'deleted': sub.onDeleted?.(data); break;
				case 'moved': sub.onMoved?.(data); break;
			}
		}
	}, []);

	const connect = useCallback(() => {
		if (!isVisibleRef.current) return;

		if (eventSourceRef.current) {
			eventSourceRef.current.close();
		}

		const eventSource = new EventSource(`${API_BASE}/api/files/events`);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			setConnected(true);
			reconnectAttemptsRef.current = 0;
		};

		const handleSSE = (eventType: FileEventType) => (e: Event) => {
			try {
				const data: FileChangeEvent = JSON.parse((e as MessageEvent).data);
				dispatch(eventType, data);
			} catch (err) {
				console.error(`Failed to parse SSE ${eventType} event:`, err);
			}
		};

		eventSource.addEventListener('created', handleSSE('created'));
		eventSource.addEventListener('modified', handleSSE('modified'));
		eventSource.addEventListener('deleted', handleSSE('deleted'));
		eventSource.addEventListener('moved', handleSSE('moved'));

		// Heartbeat events keep connection alive
		eventSource.addEventListener('heartbeat', () => {});

		eventSource.onerror = () => {
			setConnected(false);
			eventSource.close();

			const attempt = reconnectAttemptsRef.current;
			if (attempt < 10) {
				const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
				reconnectAttemptsRef.current++;
				reconnectTimeoutRef.current = setTimeout(connect, delay);
			}
		};
	}, [dispatch]);

	// Handle tab visibility — pause SSE when hidden
	useEffect(() => {
		const handleVisibility = () => {
			isVisibleRef.current = !document.hidden;
			if (document.hidden) {
				eventSourceRef.current?.close();
				setConnected(false);
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current);
				}
			} else {
				reconnectAttemptsRef.current = 0;
				connect();
			}
		};

		document.addEventListener('visibilitychange', handleVisibility);
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	}, [connect]);

	// Initial connection
	useEffect(() => {
		connect();
		return () => {
			eventSourceRef.current?.close();
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
		};
	}, [connect]);

	const subscribe = useCallback((handlers: Omit<FileEventSubscription, 'id'>) => {
		const id = nextSubscriptionId++;
		subscriptionsRef.current.set(id, { id, ...handlers });
		return id;
	}, []);

	const unsubscribe = useCallback((id: number) => {
		subscriptionsRef.current.delete(id);
	}, []);

	return (
		<FileEventContext.Provider value={{ connected, subscribe, unsubscribe }}>
			{children}
		</FileEventContext.Provider>
	);
}

// ============================================================================
// Hook — subscribes to the shared provider
// ============================================================================

export interface UseFileEventsOptions {
	/** Called when a file is created in Desktop/ */
	onCreated?: (event: FileChangeEvent) => void;
	/** Called when a file is modified in Desktop/ */
	onModified?: (event: FileChangeEvent) => void;
	/** Called when a file is deleted from Desktop/ */
	onDeleted?: (event: FileChangeEvent) => void;
	/** Called when a file is moved in Desktop/ */
	onMoved?: (event: FileChangeEvent) => void;
	/** Called on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Enable the subscription (default: true) */
	enabled?: boolean;
}

/**
 * Hook to listen for real-time file change events.
 *
 * Subscribes to the shared FileEventProvider SSE connection.
 * All existing call sites work unchanged — same API as before.
 *
 * @example
 * ```tsx
 * useFileEvents({
 *   onModified: (event) => {
 *     if (event.path === currentFile) {
 *       setHasConflict(true);
 *     }
 *   },
 *   onDeleted: (event) => {
 *     // Handle deleted file
 *   }
 * });
 * ```
 */
export function useFileEvents(options: UseFileEventsOptions = {}) {
	const {
		onCreated,
		onModified,
		onDeleted,
		onMoved,
		onConnectionChange,
		enabled = true,
	} = options;

	const context = useContext(FileEventContext);

	// Use refs so handler changes don't cause re-subscriptions
	const handlersRef = useRef({ onCreated, onModified, onDeleted, onMoved });
	handlersRef.current = { onCreated, onModified, onDeleted, onMoved };

	// Connection state callback
	const prevConnectedRef = useRef<boolean | null>(null);
	useEffect(() => {
		if (!context || !onConnectionChange) return;
		if (prevConnectedRef.current !== context.connected) {
			prevConnectedRef.current = context.connected;
			onConnectionChange(context.connected);
		}
	}, [context?.connected, onConnectionChange]);

	useEffect(() => {
		if (!context || !enabled) return;

		const subId = context.subscribe({
			onCreated: (e) => handlersRef.current.onCreated?.(e),
			onModified: (e) => handlersRef.current.onModified?.(e),
			onDeleted: (e) => handlersRef.current.onDeleted?.(e),
			onMoved: (e) => handlersRef.current.onMoved?.(e),
		});

		return () => context.unsubscribe(subId);
	}, [context, enabled]);
}

/**
 * Convenience hook that returns file events as state.
 * Useful for components that need to react to any file change.
 */
export function useFileEventState() {
	const lastEventRef = useRef<{ type: FileEventType; event: FileChangeEvent; } | null>(null);

	useFileEvents({
		onCreated: (e) => { lastEventRef.current = { type: 'created', event: e }; },
		onModified: (e) => { lastEventRef.current = { type: 'modified', event: e }; },
		onDeleted: (e) => { lastEventRef.current = { type: 'deleted', event: e }; },
		onMoved: (e) => { lastEventRef.current = { type: 'moved', event: e }; },
	});

	return lastEventRef;
}
