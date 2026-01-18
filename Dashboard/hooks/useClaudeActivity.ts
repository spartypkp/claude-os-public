/**
 * useClaudeActivity - Hook for Claude activity (sessions and missions).
 * 
 * Jan 2026 Architecture Overhaul:
 * This is now a thin wrapper around useSessionsQuery.
 * NO POLLING - SSE events automatically invalidate the cache.
 * 
 * The interface is preserved for backward compatibility.
 */

'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessionsQuery } from './queries';  // Now exported from useConversationsQuery
import { queryKeys } from '@/lib/queryClient';
import { ActiveSession, ActiveMission } from '@/lib/types';

export interface UseClaudeActivityReturn {
  /** All active sessions */
  sessions: ActiveSession[];
  /** All running missions */
  missions: ActiveMission[];
  /** Total active Claude instances (sessions + missions) */
  totalActive: number;
  /** Whether there's any Claude activity */
  hasActivity: boolean;
  /** Whether the data is still loading initially */
  isLoading: boolean;
  /** Any error from the last fetch */
  error: string | null;
  /** Force refresh the activity data */
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch Claude activity (sessions and missions) for sidebar display.
 *
 * Jan 2026: NO POLLING. Data is fetched once and automatically updated
 * when SSE events arrive via EventStreamProvider.
 * 
 * @param _pollInterval - DEPRECATED: Polling is no longer used
 */
export function useClaudeActivity(_pollInterval?: number): UseClaudeActivityReturn {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useSessionsQuery();

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Also provide a way to invalidate the cache
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionsActivity });
  }, [queryClient]);

  const sessions = (data?.sessions || []) as unknown as ActiveSession[];
  const missions = (data?.missions || []) as unknown as ActiveMission[];

  return {
    sessions,
    missions,
    totalActive: sessions.length + missions.length,
    hasActivity: sessions.length > 0 || missions.length > 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch activity') : null,
    refresh,
  };
}

export default useClaudeActivity;
