'use client';

import { API_BASE } from '@/lib/api';
import { useEffect, useRef } from 'react';

/**
 * File change event from SSE stream.
 */
export interface FileChangeEvent {
	path: string;      // Relative path: 'Desktop/TODAY.md'
	mtime: string;     // ISO timestamp
	dest_path?: string; // For move events
}

export type FileEventType = 'created' | 'modified' | 'deleted' | 'moved';

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
	/** Enable the SSE connection (default: true) */
	enabled?: boolean;
}

/**
 * Hook to listen for real-time file change events via SSE.
 *
 * Connects to /api/files/events and dispatches events to handlers.
 * Handles reconnection with exponential backoff.
 *
 * @example
 * ```tsx
 * useFileEvents({
 *   onModified: (event) => {
 *     if (event.path === currentFile) {
 *       // File we're editing changed externally
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

	// Use refs to avoid reconnection on handler changes
	const handlersRef = useRef({ onCreated, onModified, onDeleted, onMoved, onConnectionChange });
	handlersRef.current = { onCreated, onModified, onDeleted, onMoved, onConnectionChange };

	useEffect(() => {
		if (!enabled) return;

		let eventSource: EventSource | null = null;
		let reconnectTimeout: NodeJS.Timeout | null = null;
		let reconnectAttempts = 0;
		const MAX_RECONNECT_ATTEMPTS = 10;
		let mounted = true;

		const handleEvent = (eventType: FileEventType, e: MessageEvent) => {
			try {
				const data: FileChangeEvent = JSON.parse(e.data);
				const handlers = handlersRef.current;

				switch (eventType) {
					case 'created':
						handlers.onCreated?.(data);
						break;
					case 'modified':
						handlers.onModified?.(data);
						break;
					case 'deleted':
						handlers.onDeleted?.(data);
						break;
					case 'moved':
						handlers.onMoved?.(data);
						break;
				}
			} catch (err) {
				console.error(`Failed to parse SSE ${eventType} event:`, err);
			}
		};

		const connect = () => {
			if (!mounted) return;

			if (eventSource) {
				eventSource.close();
			}

			eventSource = new EventSource(`${API_BASE}/api/files/events`);

			eventSource.onopen = () => {
				if (!mounted) return;
				reconnectAttempts = 0;
				handlersRef.current.onConnectionChange?.(true);
			};

			// Listen for specific event types
			eventSource.addEventListener('created', (e) => handleEvent('created', e as MessageEvent));
			eventSource.addEventListener('modified', (e) => handleEvent('modified', e as MessageEvent));
			eventSource.addEventListener('deleted', (e) => handleEvent('deleted', e as MessageEvent));
			eventSource.addEventListener('moved', (e) => handleEvent('moved', e as MessageEvent));

			// Heartbeat events just keep connection alive, no handler needed
			eventSource.addEventListener('heartbeat', () => {
				// Connection is alive
			});

			eventSource.onerror = () => {
				if (!mounted) return;

				handlersRef.current.onConnectionChange?.(false);
				eventSource?.close();

				// Exponential backoff reconnection
				if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
					const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
					reconnectAttempts++;

					reconnectTimeout = setTimeout(() => {
						if (mounted) {
							console.log(`Reconnecting to file events SSE... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
							connect();
						}
					}, delay);
				} else {
					console.error('Max reconnection attempts reached for file events SSE.');
				}
			};
		};

		connect();

		return () => {
			mounted = false;
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
			}
			eventSource?.close();
		};
	}, [enabled]);
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
