'use client';

/**
 * useConversation - Conversation-first hook for Claude activity
 *
 * Primary interface for Claude conversation data. Takes conversation_id only.
 * Session management is internal - frontend never thinks about sessions.
 *
 * Architecture:
 * - REST: Fetch history by conversation_id
 * - SSE: Stream by conversation_id (server handles session transitions)
 * - Cache: Keyed by conversation_id (survives session resets)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// ============================================================================
// Types
// ============================================================================

/**
 * Transcript event types from the backend.
 */
export interface TranscriptEvent {
  type: 'connected' | 'user_message' | 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'error' | 'session_boundary' | 'conversation_ended';
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

  // For session_boundary events
  session_id?: string;
  role?: string;
  started_at?: string;
  ended_at?: string;
  is_reset?: boolean;
  boundary_type?: 'reset' | 'mode_transition' | 'session_start' | 'summarizer';
  mode?: string;
  prev_mode?: string;
}

export interface ConversationActivity {
  isThinking: boolean;
  activeTask: string | null;
  lastTask: string | null;
  elapsedTime: string | null;
  tokenCount: string | null;
}

export interface ContextWarning {
  percentRemaining: number;
  percentUsed: number;
  shouldWarn: boolean;
  shouldForceReset: boolean;
}

export interface TaskItem {
  id?: string;
  content: string;
  subject?: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  blockedBy?: string[];
}

export interface ConversationMeta {
  model: string | null;
  costUsd: number | null;
  role: string | null;
  mode: string | null;
  sessionCount: number;
}

export interface ConversationPagination {
  hasEarlier: boolean;
  earliestSessionId: string | null;
  totalSessionCount: number;
  loadedSessionCount: number;
  isLoadingEarlier: boolean;
}

export interface ConversationState {
  // Transcript events (combined from all sessions)
  events: TranscriptEvent[];

  // Real-time activity
  activity: ConversationActivity;

  // Context warning
  contextWarning: ContextWarning | null;

  // Task list
  tasks: TaskItem[];

  // Conversation metadata
  meta: ConversationMeta;

  // Pagination for loading earlier history
  pagination: ConversationPagination;

  // Connection status
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Active session info (internal, but exposed for sending messages)
  activeSessionId: string | null;

  // Actions
  loadEarlierHistory: () => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
}

interface ConversationCache {
  events: TranscriptEvent[];
  lastEventUuid: string | null;
  loadedAt: number;
}

interface UseConversationOptions {
  includeThinking?: boolean;
  hours?: number | null;
}

// ============================================================================
// Global cache (keyed by conversation_id)
// ============================================================================

const conversationCaches = new Map<string, ConversationCache>();

function getCache(conversationId: string): ConversationCache | undefined {
  return conversationCaches.get(conversationId);
}

function setCache(conversationId: string, cache: ConversationCache): void {
  conversationCaches.set(conversationId, cache);
}

function appendToCache(conversationId: string, event: TranscriptEvent): void {
  const existing = conversationCaches.get(conversationId);
  if (existing) {
    // Avoid duplicates
    if (event.uuid && existing.events.some(e => e.uuid === event.uuid)) {
      return;
    }
    conversationCaches.set(conversationId, {
      events: [...existing.events, event],
      lastEventUuid: event.uuid || existing.lastEventUuid, // Update cursor
      loadedAt: existing.loadedAt,
    });
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useConversation(
  conversationId: string | null,
  options?: UseConversationOptions
): ConversationState {
  // State
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [activity, setActivity] = useState<ConversationActivity>({
    isThinking: false,
    activeTask: null,
    lastTask: null,
    elapsedTime: null,
    tokenCount: null,
  });
  const [contextWarning, setContextWarning] = useState<ContextWarning | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [meta, setMeta] = useState<ConversationMeta>({
    model: null,
    costUsd: null,
    role: null,
    mode: null,
    sessionCount: 0,
  });
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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastEventUuid, setLastEventUuid] = useState<string | null>(null);

  // Refs
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);

  const MAX_RECONNECT_ATTEMPTS = 5;

  // Sync events from cache
  useEffect(() => {
    if (conversationId) {
      const cache = getCache(conversationId);
      if (cache) {
        setEvents(cache.events);
      }
    }
  }, [conversationId]);

  // Fetch conversation history (REST)
  const fetchHistory = useCallback(async (convId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const hoursParam = options?.hours !== undefined ? options.hours : 24;
      const hoursQuery = hoursParam !== null ? `&hours=${hoursParam}` : '';
      const url = `${API_BASE}/api/sessions/conversation/${convId}/transcript/history?include_thinking=${options?.includeThinking ?? true}${hoursQuery}`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to fetch history: ${res.status}`);
      }

      const data = await res.json();
      const historyEvents: TranscriptEvent[] = data.events || [];
      const lastEvent = historyEvents.at(-1);

      // Update cache
      setCache(convId, {
        events: historyEvents,
        lastEventUuid: lastEvent?.uuid || null,
        loadedAt: Date.now(),
      });

      setEvents(historyEvents);
      setPagination({
        hasEarlier: data.has_earlier || false,
        earliestSessionId: data.earliest_session_id || null,
        totalSessionCount: data.total_session_count || 0,
        loadedSessionCount: data.session_count || 0,
        isLoadingEarlier: false,
      });

    } catch (err) {
      console.error('[useConversation] History fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setIsLoading(false);
    }
  }, [options?.includeThinking, options?.hours]);

  // Fetch conversation status (REST)
  const fetchStatus = useCallback(async (convId: string) => {
    try {
      const url = `${API_BASE}/api/sessions/conversation/${convId}/status`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      setMeta(prev => ({
        ...prev,
        role: data.role || null,
        mode: data.mode || null,
        sessionCount: data.session_count || 0,
      }));

      if (data.active_session) {
        setActiveSessionId(data.active_session.session_id);
      }
    } catch (err) {
      console.error('[useConversation] Status fetch error:', err);
    }
  }, []);

  // Load earlier history (pagination)
  const loadEarlierHistory = useCallback(async () => {
    if (!conversationId || !pagination.hasEarlier || !pagination.earliestSessionId || pagination.isLoadingEarlier) {
      return;
    }

    setPagination(prev => ({ ...prev, isLoadingEarlier: true }));

    try {
      const url = `${API_BASE}/api/sessions/conversation/${conversationId}/transcript/history?include_thinking=${options?.includeThinking ?? true}&before_session=${pagination.earliestSessionId}&limit_sessions=5`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load earlier history: ${res.status}`);
      }

      const data = await res.json();
      const earlierEvents: TranscriptEvent[] = data.events || [];

      if (earlierEvents.length > 0) {
        const cache = getCache(conversationId);
        const existingEvents = cache?.events || [];
        const newEvents = [...earlierEvents, ...existingEvents];

        setCache(conversationId, {
          events: newEvents,
          lastEventUuid: cache?.lastEventUuid || null,
          loadedAt: Date.now(),
        });

        setEvents(newEvents);
      }

      setPagination(prev => ({
        ...prev,
        hasEarlier: data.has_earlier || false,
        earliestSessionId: data.earliest_session_id || null,
        loadedSessionCount: prev.loadedSessionCount + (data.session_count || 0),
        isLoadingEarlier: false,
      }));
    } catch (err) {
      console.error('[useConversation] Load earlier error:', err);
      setPagination(prev => ({ ...prev, isLoadingEarlier: false }));
    }
  }, [conversationId, options?.includeThinking, pagination.hasEarlier, pagination.earliestSessionId, pagination.isLoadingEarlier]);

  // Send message to active session
  const sendMessage = useCallback(async (message: string) => {
    if (!activeSessionId) {
      throw new Error('No active session');
    }

    const res = await fetch(`${API_BASE}/api/sessions/${activeSessionId}/say`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.detail || 'Failed to send message');
    }
  }, [activeSessionId]);

  // Connect to conversation SSE stream
  const connectSSE = useCallback((convId: string, afterUuid?: string | null) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams({
      include_thinking: String(options?.includeThinking ?? true),
    });

    // Cursor-based resumption: stream events after this UUID
    if (afterUuid) {
      params.set('after_uuid', afterUuid);
      console.log(`[SSE] Connecting with cursor after UUID ${afterUuid.slice(0, 8)}`);
    } else {
      console.log('[SSE] Connecting from end (new events only)');
    }

    const url = `${API_BASE}/api/sessions/conversation/${convId}/stream?${params}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        switch (data.type) {
          case 'connected':
            setIsConnected(true);
            setError(null);
            reconnectAttemptsRef.current = 0;
            console.log('[useConversation] Connected to conversation stream');
            break;

          case 'transcript':
            if (data.event && convId === conversationIdRef.current) {
              setEvents(prev => {
                const isDuplicate = data.event.uuid && prev.some(e => e.uuid === data.event.uuid);

                if (isDuplicate) {
                  return prev;
                }

                appendToCache(convId, data.event);
                // Track last UUID for cursor-based resumption
                if (data.event.uuid) {
                  setLastEventUuid(data.event.uuid);
                }
                return [...prev, data.event];
              });
            }
            break;

          case 'activity':
            if (data.data) {
              setActivity({
                isThinking: data.data.is_thinking || false,
                activeTask: data.data.active_task || null,
                lastTask: data.data.last_task || null,
                elapsedTime: data.data.elapsed_time || null,
                tokenCount: data.data.token_count || null,
              });
            }
            break;

          case 'context_warning':
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
            break;

          case 'tasks':
            if (data.data?.items) {
              setTasks(data.data.items.map((t: Record<string, unknown>) => ({
                id: t.id as string | undefined,
                content: (t.content as string) || (t.subject as string) || '',
                subject: t.subject as string | undefined,
                description: t.description as string | undefined,
                status: (t.status as string) || 'pending',
                activeForm: t.activeForm as string | undefined,
                blockedBy: t.blockedBy as string[] | undefined,
              })));
            }
            break;

          case 'session_meta':
            if (data.data) {
              setMeta(prev => ({
                ...prev,
                model: data.data.model || null,
                costUsd: data.data.cost_usd || null,
              }));
            }
            break;

          case 'session_boundary':
            // Session changed (reset or mode transition)
            // Server handles the switch - we just need to update metadata
            console.warn('[SESSION TRANSITION] Session boundary:', {
              old: data.old_session_id?.slice(0,8),
              new: data.new_session_id?.slice(0,8),
              reason: data.reason,
              eventsInState: events.length
            });
            if (data.new_session_id) {
              setActiveSessionId(data.new_session_id);
            }
            if (data.new_role) {
              setMeta(prev => ({ ...prev, role: data.new_role }));
            }
            if (data.new_mode) {
              setMeta(prev => ({ ...prev, mode: data.new_mode }));
            }
            // Add boundary event to transcript
            if (convId === conversationIdRef.current) {
              const boundaryEvent: TranscriptEvent = {
                type: 'session_boundary',
                timestamp: data.timestamp,
                uuid: `boundary-${data.new_session_id}`,
                session_id: data.new_session_id,
                role: data.new_role,
                is_reset: data.boundary_type === 'reset' || data.reason === 'reset',
                // Pass through enriched metadata for boundary rendering
                boundary_type: data.boundary_type,
                mode: data.mode || data.new_mode,
                prev_mode: data.prev_mode,
              };
              appendToCache(convId, boundaryEvent);
              setEvents(prev => [...prev, boundaryEvent]);
            }
            break;

          case 'conversation_ended':
            console.log('[useConversation] Conversation ended');
            setActiveSessionId(null);
            setActivity({
              isThinking: false,
              activeTask: null,
              lastTask: null,
              elapsedTime: null,
              tokenCount: null,
            });
            // Add ended event to transcript
            if (convId === conversationIdRef.current) {
              const endedEvent: TranscriptEvent = {
                type: 'conversation_ended',
                timestamp: data.timestamp || new Date().toISOString(),
                uuid: `ended-${data.last_session_id || Date.now()}`,
              };
              appendToCache(convId, endedEvent);
              setEvents(prev => [...prev, endedEvent]);
            }
            break;

          case 'error':
            setError(data.message || 'Stream error');
            break;
        }
      } catch (err) {
        console.error('[useConversation] Failed to parse event:', err);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current++;

        console.log(`[useConversation] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (conversationIdRef.current === convId) {
            connectSSE(convId);
          }
        }, delay);
      } else {
        setError('Connection lost. Please refresh.');
      }
    };
  }, [options?.includeThinking]);

  // Main effect: setup connection
  useEffect(() => {
    conversationIdRef.current = conversationId;

    if (!conversationId) {
      setIsConnected(false);
      setError(null);
      setIsLoading(false);
      setEvents([]);
      setActivity({ isThinking: false, activeTask: null, lastTask: null, elapsedTime: null, tokenCount: null });
      setContextWarning(null);
      setTasks([]);
      setMeta({ model: null, costUsd: null, role: null, mode: null, sessionCount: 0 });
      setPagination({ hasEarlier: false, earliestSessionId: null, totalSessionCount: 0, loadedSessionCount: 0, isLoadingEarlier: false });
      setActiveSessionId(null);
      return;
    }

    const existingCache = getCache(conversationId);

    const setup = async () => {
      // Fetch status first (to get active session)
      await fetchStatus(conversationId);

      let resumeUuid: string | null = null;

      // If no cache, fetch history and get last UUID
      if (!existingCache) {
        await fetchHistory(conversationId);
        // Get last UUID from the history we just fetched
        const cache = getCache(conversationId);
        resumeUuid = cache?.lastEventUuid || null;
      } else {
        // Use cached events and resume from last UUID
        setEvents(existingCache.events);
        resumeUuid = existingCache.lastEventUuid;
        setLastEventUuid(resumeUuid);
        console.log(`[CACHE] Resuming from cached state (${existingCache.events.length} events, last UUID: ${resumeUuid?.slice(0,8)})`);
      }

      // Connect to SSE stream with cursor-based resumption
      connectSSE(conversationId, resumeUuid);
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
  }, [conversationId, fetchHistory, fetchStatus, connectSSE]);

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
    activeSessionId,
    loadEarlierHistory,
    sendMessage,
  };
}

export default useConversation;
