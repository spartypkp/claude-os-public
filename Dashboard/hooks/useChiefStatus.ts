/**
 * useChiefStatus - Hook for Chief session status.
 * 
 * Jan 2026 Architecture Overhaul:
 * This is now a thin wrapper around useChiefQuery.
 * NO POLLING - SSE events automatically invalidate the cache.
 * 
 * The interface is preserved for backward compatibility.
 */

'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChiefQuery } from './queries/useChiefQuery';
import { queryKeys } from '@/lib/queryClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export interface ChiefStatus {
  session_exists: boolean;
  window_exists: boolean;
  claude_running: boolean;
  active_window: string;
}

/**
 * Hook for Chief session status.
 * 
 * Jan 2026: NO POLLING. Data is fetched once and automatically updated
 * when SSE events arrive via EventStreamProvider.
 * 
 * @param _pollInterval - DEPRECATED: Polling is no longer used
 */
export function useChiefStatus(_pollInterval?: number) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useChiefQuery();

  const status: ChiefStatus | null = data ? {
    session_exists: data.session_exists,
    window_exists: true, // Derived from session_exists
    claude_running: data.claude_running,
    active_window: data.active_window || '',
  } : null;

  // Manual refresh
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Spawn Chief - invalidates cache on success
  const spawnChief = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chief/spawn`, { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        // Invalidate cache to trigger refetch
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.chief });
        }, 2000);
      }
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to spawn' };
    }
  }, [queryClient]);

  // Wake Chief
  const wakeChief = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chief/wake`, { method: 'POST' });
      return await response.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to wake' };
    }
  }, []);

  return {
    status,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch status') : null,
    refresh,
    spawnChief,
    wakeChief,
    isRunning: status?.claude_running ?? false,
    isWindowReady: status?.session_exists ?? false,
  };
}

export default useChiefStatus;
