/**
 * useClaudeActivityState - Detects Claude's current activity state from transcript events.
 * 
 * Jan 2026 Architecture Overhaul:
 * Optimized the tick interval from 500ms to 2500ms - we only need to check
 * if 2 seconds of quiet has passed, not every 500ms.
 */

'use client';

import { useMemo, useEffect, useState, useRef } from 'react';
import type { TranscriptEvent } from './useTranscriptStream';

export type ClaudeActivityState =
  | { type: 'idle' }
  | { type: 'thinking' }
  | { type: 'tool_executing'; tools: { name: string; id: string }[] }
  | { type: 'complete' }
  | { type: 'timeout' };

interface ToolExecution {
  name: string;
  id: string;
}

/**
 * Detects Claude's current activity state from the transcript event stream.
 *
 * States:
 * - idle: No pending work
 * - thinking: Sent message, waiting for first event
 * - tool_executing: Tool use events without matching results
 * - complete: Last event was text and no pending tools
 * - timeout: No events for 30+ seconds while waiting
 */
export function useClaudeActivityState(
  events: TranscriptEvent[],
  isWaitingForResponse: boolean,
  eventCountAtSend: number
): ClaudeActivityState {
  const [timeoutReached, setTimeoutReached] = useState(false);
  const lastEventTimeRef = useRef(Date.now());
  
  // Track when we need to check for quiet period completion
  const [checkQuiet, setCheckQuiet] = useState(0);

  // Update timestamp when events change
  useEffect(() => {
    if (events.length > 0) {
      lastEventTimeRef.current = Date.now();
    }
  }, [events.length]);

  // Detect state from events
  const state = useMemo((): ClaudeActivityState => {
    // Not waiting - idle
    if (!isWaitingForResponse) {
      return { type: 'idle' };
    }

    // Timeout reached
    if (timeoutReached) {
      return { type: 'timeout' };
    }

    // No new events yet - thinking
    if (events.length <= eventCountAtSend) {
      return { type: 'thinking' };
    }

    // Find pending tools (tool_use without matching tool_result)
    const pendingTools: ToolExecution[] = [];
    const completedToolIds = new Set<string>();

    // First pass: collect completed tool IDs
    for (const event of events) {
      if (event.type === 'tool_result' && event.toolUseId) {
        completedToolIds.add(event.toolUseId);
      }
    }

    // Second pass: find pending tools
    for (const event of events) {
      if (event.type === 'tool_use' && event.toolUseId) {
        if (!completedToolIds.has(event.toolUseId)) {
          pendingTools.push({
            name: event.toolName || 'Tool',
            id: event.toolUseId,
          });
        }
      }
    }

    // If tools are pending, show tool execution state
    if (pendingTools.length > 0) {
      return { type: 'tool_executing', tools: pendingTools };
    }

    // Check for next user message (signals previous turn ended)
    const hasNewUserMessage = events.some((e, idx) =>
      idx > eventCountAtSend &&
      e.type === 'user_message' &&
      !e.toolUseId
    );

    // Check if we've been quiet for 2 seconds
    const timeSinceLastEvent = Date.now() - lastEventTimeRef.current;
    const quietFor2Seconds = timeSinceLastEvent > 2000;

    // Complete when:
    // 1. All tools resolved (no pending tools) AND
    // 2. We have new events AND
    // 3. (User sent next message OR 2s quiet period)
    if (events.length > eventCountAtSend &&
        (hasNewUserMessage || quietFor2Seconds)) {
      return { type: 'complete' };
    }

    // Still processing - default to thinking
    return { type: 'thinking' };
  }, [events, isWaitingForResponse, eventCountAtSend, timeoutReached, checkQuiet]);

  // Timeout detection - 30 seconds without new events
  useEffect(() => {
    if (!isWaitingForResponse) {
      setTimeoutReached(false);
      return;
    }

    // Don't start timeout if already complete or idle
    if (state.type === 'complete' || state.type === 'idle') {
      setTimeoutReached(false);
      return;
    }

    const timeout = setTimeout(() => {
      setTimeoutReached(true);
    }, 30000); // 30 seconds

    return () => {
      clearTimeout(timeout);
      setTimeoutReached(false);
    };
  }, [isWaitingForResponse, state.type, events.length]);

  // Check for quiet period completion - OPTIMIZED from 500ms to 2500ms
  // We only need to detect when 2 seconds of quiet has passed,
  // so checking every 2.5 seconds is sufficient
  useEffect(() => {
    if (!isWaitingForResponse || state.type === 'complete' || state.type === 'idle') {
      return;
    }

    // Only need to check once after 2.5 seconds of quiet
    const timeout = setTimeout(() => {
      setCheckQuiet(prev => prev + 1);
    }, 2500);

    return () => clearTimeout(timeout);
  }, [isWaitingForResponse, state.type, events.length]);

  return state;
}
