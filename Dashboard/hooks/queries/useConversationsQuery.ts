/**
 * Conversations Query Hook - Groups sessions by conversation_id.
 *
 * Jan 2026 Session → Conversation Migration:
 * Sessions are technical units (Claude Code processes).
 * Conversations are logical units (continuous threads across resets).
 *
 * A conversation contains multiple sessions when Chief resets throughout the day.
 * Chief conversation: chief-2026-01-09 (one per day)
 * Specialist conversation: system-abc123 (one per task)
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { ActiveConversation, ActiveSession, ActiveWorker, SessionState } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface Worker {
  id: string;
  type: string;
  status: string;
  title: string;
  created_at: string;
}

interface Session {
  session_id: string;
  role: string;
  mode: string;
  session_type: string;
  session_subtype: string | null;
  mission_execution_id: string | null;
  conversation_id: string | null;
  parent_session_id: string | null;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  current_state: string | null;
  last_tool: string | null;
  cwd: string | null;
  tmux_pane: string | null;
  description: string | null;
  status_text: string | null;
  workers: Worker[];
}

interface Mission {
  id: string;
  name: string;
  type: string;
  prompt_file: string | null;
  started_at: string;
  status: string;
  workers: Worker[];
}

interface ActivityResponse {
  sessions: Session[];
  missions: Mission[];
  error?: string;
}

async function fetchActivity(): Promise<ActivityResponse> {
  const response = await fetch(`${API_BASE}/api/system/sessions/activity`);
  if (!response.ok) {
    throw new Error(`Failed to fetch activity: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Group sessions by conversation_id into conversations.
 *
 * Each conversation represents a logical thread of work:
 * - Chief: one conversation per day (chief-2026-01-09)
 * - Specialists: one conversation per task (system-abc123)
 *
 * Multiple sessions in one conversation = resets within that conversation.
 */
function groupSessionsIntoConversations(sessions: Session[]): ActiveConversation[] {
  // Group sessions by conversation_id
  const conversationMap = new Map<string, Session[]>();

  for (const session of sessions) {
    const convId = session.conversation_id || session.session_id; // Fallback to session_id if no conversation_id

    if (!conversationMap.has(convId)) {
      conversationMap.set(convId, []);
    }
    conversationMap.get(convId)!.push(session);
  }

  // Convert each group into an ActiveConversation
  const conversations: ActiveConversation[] = [];

  for (const [conversationId, sessionsInConv] of conversationMap.entries()) {
    // Sort sessions by started_at (oldest first)
    const sortedSessions = sessionsInConv.sort((a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );

    // Latest session = most recent
    const latestSession = sortedSessions[sortedSessions.length - 1];

    // First session = earliest in this conversation
    const firstSession = sortedSessions[0];

    // Aggregate workers from all sessions in this conversation
    const allWorkers = sortedSessions.flatMap((s) => s.workers) as ActiveWorker[];

    // Determine if conversation is ended (latest session ended)
    const isEnded = !!latestSession.ended_at;

    conversations.push({
      conversation_id: conversationId,
      role: (latestSession.role || latestSession.session_subtype || 'chief') as any,
      mode: (latestSession.mode || 'interactive') as any,
      latest_session_id: latestSession.session_id,
      description: latestSession.description ?? undefined,
      status_text: latestSession.status_text ?? undefined,
      current_state: latestSession.current_state as SessionState | undefined,
      last_tool: latestSession.last_tool ? JSON.parse(latestSession.last_tool) : undefined,
      started_at: firstSession.started_at,
      last_seen_at: latestSession.last_seen_at,
      ended_at: isEnded ? latestSession.ended_at ?? undefined : undefined,
      session_count: sortedSessions.length,
      sessions: sortedSessions as unknown as ActiveSession[],
      workers: allWorkers,
    });
  }

  // Sort conversations by most recent activity
  return conversations.sort((a, b) =>
    new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
  );
}

/**
 * Hook to fetch raw sessions and missions.
 * Use useConversationsQuery for grouped view.
 */
export function useSessionsQuery() {
  return useQuery({
    queryKey: queryKeys.sessionsActivity,
    queryFn: fetchActivity,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to fetch Claude activity as conversations (grouped by conversation_id).
 *
 * Returns conversations instead of raw sessions.
 * Each conversation may contain multiple sessions (from resets).
 */
export function useConversationsQuery() {
  const { data, ...rest } = useSessionsQuery();

  const conversations = data?.sessions ? groupSessionsIntoConversations(data.sessions) : [];

  return {
    ...rest,
    data: {
      conversations,
      missions: data?.missions ?? [],
      error: data?.error,
    },
  };
}

/**
 * Convenience hook to get just active conversations.
 */
export function useActiveConversations() {
  const { data, ...rest } = useConversationsQuery();

  const activeConversations = data.conversations.filter((c) => !c.ended_at);

  return {
    ...rest,
    data: activeConversations,
  };
}

/**
 * Convenience hook to get chief conversation if active.
 */
export function useChiefConversation() {
  const { data: conversations } = useActiveConversations();
  return conversations?.find((c) => c.role === 'chief') ?? null;
}

/**
 * Legacy: Get active sessions (not grouped).
 */
export function useActiveSessions() {
  const { data, ...rest } = useSessionsQuery();

  const activeSessions = data?.sessions.filter((s) => !s.ended_at) ?? [];

  return {
    ...rest,
    data: activeSessions,
  };
}

/**
 * Legacy: Get chief session if active.
 */
export function useChiefSession() {
  const { data: sessions } = useActiveSessions();
  return sessions?.find((s) => s.role === 'chief') ?? null;
}

