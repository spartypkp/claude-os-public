'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatPanel } from '@/components/context/ChatPanelContext';
import type { TranscriptEvent } from '@/hooks/useTranscriptStream';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface UseTranscriptWithHistoryResult {
  events: TranscriptEvent[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook that combines transcript history with live SSE streaming.
 *
 * Pattern:
 * 1. On first load: Fetch full history via REST
 * 2. Store in context cache with last UUID
 * 3. Connect SSE with after_uuid to get only new events
 * 4. On reconnect: Resume from cache's last UUID
 *
 * This ensures chat persistence across panel open/close cycles.
 * 
 * Jan 2026: Supports conversation_id for cross-session history.
 * When conversationId is provided, fetches history from all sessions
 * in that conversation, showing the full conversation across resets.
 */
export function useTranscriptWithHistory(
  sessionId: string | null,
  includeThinking: boolean = false,
  conversationId?: string | null,
): UseTranscriptWithHistoryResult {
  const { getSessionCache, setSessionCache, appendToCache } = useChatPanel();

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const fetchedSessionRef = useRef<string | null>(null);

  const MAX_RECONNECT_ATTEMPTS = 5;

  // Get current events from cache
  const cache = sessionId ? getSessionCache(sessionId) : undefined;
  const events = cache?.events || [];

  // Fetch history for a session (or entire conversation if conversationId provided)
  const fetchHistory = useCallback(async (sid: string, convId?: string | null) => {
    setIsLoading(true);
    setError(null);

    try {
      // Use conversation endpoint if conversationId is provided
      // This returns combined history from all sessions in the conversation
      const url = convId
        ? `${API_BASE}/api/system/sessions/conversation/${convId}/transcript/history?include_thinking=${includeThinking}`
        : `${API_BASE}/api/system/sessions/${sid}/transcript/history?include_thinking=${includeThinking}`;
      
      const response = await fetch(url);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to fetch history: ${response.status}`);
      }

      const data = await response.json();
      const historyEvents: TranscriptEvent[] = data.events || [];

      // Store in cache (keyed by session_id for SSE, but includes conversation history)
      const lastEvent = historyEvents.at(-1);
      setSessionCache(sid, {
        events: historyEvents,
        lastEventUuid: lastEvent?.uuid || null,
        loadedAt: Date.now(),
      });

      return lastEvent?.uuid || null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [includeThinking, setSessionCache]);

  // Connect to SSE for live updates
  const connectSSE = useCallback((sid: string, afterUuid: string | null) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams({
      include_thinking: String(includeThinking),
    });
    if (afterUuid) {
      params.set('after_uuid', afterUuid);
    }

    const url = `${API_BASE}/api/system/sessions/${sid}/transcript?${params}`;
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
          console.log('[TranscriptWithHistory] Connected:', data.transcript_path);
        } else if (data.type === 'error') {
          setError(data.message || data.error || 'Unknown error');
        } else {
          // Append new event to cache
          appendToCache(sid, data);
        }
      } catch (e) {
        console.error('[TranscriptWithHistory] Failed to parse event:', e);
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

        // Get current last UUID from cache for reconnection
        const currentCache = getSessionCache(sid);
        const resumeUuid = currentCache?.lastEventUuid || null;

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`[TranscriptWithHistory] Reconnecting (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
          connectSSE(sid, resumeUuid);
        }, delay);
      } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError('Connection lost. Please close and reopen the panel.');
      }
    };
  }, [includeThinking, appendToCache, getSessionCache]);

  // Main effect: Load history if needed, then connect SSE
  useEffect(() => {
    if (!sessionId) {
      setIsConnected(false);
      setError(null);
      setIsLoading(false);
      return;
    }

    const existingCache = getSessionCache(sessionId);

    const setup = async () => {
      let afterUuid: string | null = null;

      if (existingCache) {
        // We have a cache - use its last UUID
        afterUuid = existingCache.lastEventUuid;
        console.log('[TranscriptWithHistory] Using cached history, resuming from:', afterUuid);
      } else {
        // No cache - fetch history first
        // If conversationId provided, fetch full conversation history (across resets)
        console.log('[TranscriptWithHistory] Fetching history for:', sessionId, conversationId ? `(conversation: ${conversationId})` : '');
        afterUuid = await fetchHistory(sessionId, conversationId);
        fetchedSessionRef.current = sessionId;
      }

      // Connect SSE with the last UUID (SSE is always for current session)
      connectSSE(sessionId, afterUuid);
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
  }, [sessionId, conversationId, getSessionCache, fetchHistory, connectSSE]);

  return {
    events,
    isConnected,
    isLoading,
    error,
  };
}

export default useTranscriptWithHistory;
