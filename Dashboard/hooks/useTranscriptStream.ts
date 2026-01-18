'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

/**
 * Transcript event types from the backend.
 */
export interface TranscriptEvent {
  type: 'connected' | 'user_message' | 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'error' | 'session_boundary';
  timestamp?: string;
  uuid?: string;
  parentUuid?: string;

  // For user_message and text events
  content?: string;

  // For thinking events
  thinking?: string;

  // For tool_use events
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown> | { _truncated: boolean; preview: string };

  // For assistant messages
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };

  // For connected event
  transcript_path?: string;

  // For error event
  message?: string;
  error?: string;
  
  // For session_boundary events (Jan 2026 - conversation history across resets)
  session_id?: string;  // Session this event belongs to
  role?: string;        // Session role at boundary
  started_at?: string;  // When the new session started
  ended_at?: string;    // When previous session ended
  is_reset?: boolean;   // True if this is a reset boundary
}

interface UseTranscriptStreamResult {
  events: TranscriptEvent[];
  isConnected: boolean;
  error: string | null;
  clearEvents: () => void;
}

/**
 * Hook to stream transcript events via SSE from the backend.
 *
 * Uses the new /api/sessions/{id}/transcript endpoint which reads
 * directly from Claude Code's transcript files for real-time structured output.
 *
 * @param sessionId - The session ID to stream transcript from
 * @param includeThinking - If true, include thinking blocks (default: false)
 * @returns Array of transcript events, connection status, and error state
 */
export function useTranscriptStream(
  sessionId: string | null,
  includeThinking: boolean = false
): UseTranscriptStreamResult {
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const MAX_RECONNECT_ATTEMPTS = 5;

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Connect to SSE endpoint
  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      setIsConnected(false);
      setError(null);
      return;
    }

    const connect = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `${API_BASE}/api/system/sessions/${sessionId}/transcript?include_thinking=${includeThinking}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      // Handle all event types
      const handleEvent = (event: MessageEvent) => {
        try {
          const data: TranscriptEvent = JSON.parse(event.data);

          if (data.type === 'connected') {
            setIsConnected(true);
            setError(null);
            reconnectAttemptsRef.current = 0;
            console.log('[TranscriptStream] Connected:', data.transcript_path);
          } else if (data.type === 'error') {
            setError(data.message || data.error || 'Unknown error');
          } else {
            // Append new event
            setEvents(prev => [...prev, data]);
          }
        } catch (e) {
          console.error('[TranscriptStream] Failed to parse event:', e);
        }
      };

      // Listen for all event types
      es.addEventListener('connected', handleEvent);
      es.addEventListener('user_message', handleEvent);
      es.addEventListener('text', handleEvent);
      es.addEventListener('tool_use', handleEvent);
      es.addEventListener('tool_result', handleEvent);
      es.addEventListener('thinking', handleEvent);
      es.addEventListener('system', handleEvent);
      es.addEventListener('error', handleEvent);

      es.onerror = () => {
        setIsConnected(false);
        es.close();

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[TranscriptStream] Reconnecting (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Connection lost. Please close and reopen the panel.');
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [sessionId, includeThinking]);

  return {
    events,
    isConnected,
    error,
    clearEvents,
  };
}

export default useTranscriptStream;
