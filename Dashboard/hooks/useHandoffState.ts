'use client';

/**
 * useHandoffState - Track handoff state per conversation via SSE events
 *
 * Maps session lifecycle events to conversation-level handoff phases:
 *   reset_initiated → 'resetting'
 *   handoff_generating → 'generating'
 *   handoff_complete → 'complete'
 *   respawned → null (clear)
 *
 * Auto-clears after 60s safety timeout.
 */

import { useEventStream } from '@/hooks/useEventStream';
import type { ActiveConversation } from '@/lib/types';
import { useEffect, useRef, useState } from 'react';

export type HandoffPhase = 'resetting' | 'generating' | 'complete' | null;

export function useHandoffState(conversations: ActiveConversation[]) {
  const { lastEvent } = useEventStream();
  const [handoffStates, setHandoffStates] = useState<Map<string, HandoffPhase>>(new Map());
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Build session_id → conversation_id lookup
  const sessionToConversation = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const conv of conversations) {
      // Map latest session and all known sessions
      if (conv.latest_session_id) {
        map.set(conv.latest_session_id, conv.conversation_id);
      }
      for (const session of conv.sessions || []) {
        map.set(session.session_id, conv.conversation_id);
      }
    }
    sessionToConversation.current = map;
  }, [conversations]);

  useEffect(() => {
    if (!lastEvent) return;

    const eventType = lastEvent.type;
    const data = lastEvent.data as Record<string, unknown>;
    const sessionId = data?.session_id as string | undefined;
    if (!sessionId) return;

    // Map session → conversation
    // For respawned events, the session_id is the NEW session (not in our map yet).
    // Use conversation_id directly or parent_session_id to find the conversation.
    let conversationId = sessionToConversation.current.get(sessionId);
    if (!conversationId && eventType === 'session.respawned') {
      // Try direct conversation_id from event data first
      const directConvId = data?.conversation_id as string | undefined;
      if (directConvId) {
        conversationId = directConvId;
      } else {
        // Fall back to parent session lookup
        const parentSessionId = data?.parent_session_id as string | undefined;
        if (parentSessionId) {
          conversationId = sessionToConversation.current.get(parentSessionId);
        }
      }
    }
    if (!conversationId) return;

    let phase: HandoffPhase = null;
    let shouldClear = false;

    switch (eventType) {
      case 'session.reset_initiated':
        phase = 'resetting';
        break;
      case 'session.handoff_generating':
        phase = 'generating';
        break;
      case 'session.handoff_complete':
        phase = 'complete';
        break;
      case 'session.respawned':
        shouldClear = true;
        break;
      default:
        return;
    }

    setHandoffStates(prev => {
      const next = new Map(prev);
      if (shouldClear) {
        next.delete(conversationId!);
      } else {
        next.set(conversationId!, phase);
      }
      return next;
    });

    // Clear any existing timeout for this conversation
    const existingTimeout = timeoutRefs.current.get(conversationId);
    if (existingTimeout) clearTimeout(existingTimeout);

    if (!shouldClear) {
      // 'complete' phase auto-clears faster (8s) — the respawned event should clear it
      // but if it doesn't arrive (race condition), don't leave it stuck forever.
      // Other phases use 60s safety net.
      const timeout = setTimeout(() => {
        setHandoffStates(prev => {
          const next = new Map(prev);
          next.delete(conversationId!);
          return next;
        });
        timeoutRefs.current.delete(conversationId!);
      }, phase === 'complete' ? 8000 : 60000);
      timeoutRefs.current.set(conversationId, timeout);
    } else {
      timeoutRefs.current.delete(conversationId);
    }
  }, [lastEvent]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  return {
    /** Get handoff phase for a specific conversation */
    getPhase: (conversationId: string): HandoffPhase => handoffStates.get(conversationId) || null,
    /** All active handoff states */
    handoffStates,
  };
}
