/**
 * Chief Query Hook - React Query replacement for useChiefStatus.
 * 
 * Jan 2026 Architecture Overhaul:
 * Before: Polled /api/chief/status every 5 seconds
 * After: Fetches once, SSE events invalidate cache automatically
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface ChiefStatus {
  session_exists: boolean;
  claude_running: boolean;
  active_window: string | null;
  session_id: string | null;
  timestamp: string;
}

async function fetchChiefStatus(): Promise<ChiefStatus> {
  const response = await fetch(`${API_BASE}/api/chief/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch chief status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Hook to fetch chief status.
 * 
 * Replaces useChiefStatus with React Query.
 * Cache is automatically invalidated by SSE events.
 */
export function useChiefQuery() {
  return useQuery({
    queryKey: queryKeys.chiefStatus,
    queryFn: fetchChiefStatus,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Convenience hook to check if chief is running.
 */
export function useIsChiefRunning() {
  const { data } = useChiefQuery();
  return data?.claude_running ?? false;
}

