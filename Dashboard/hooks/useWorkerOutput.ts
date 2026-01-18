/**
 * useWorkerOutput - Hook for live worker output during execution.
 *
 * Jan 2026 Worker Frontend Overhaul:
 * BEFORE: Manual polling every 500ms
 * AFTER: React Query + SSE-driven updates (worker.output_updated events)
 *
 * NO POLLING. The hook fetches once, then SSE events trigger refetch.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export interface WorkerOutput {
  id: string;
  status: string;
  activity: string;  // Tool trace (live_output)
  report: string;    // Final report (report_md)
  output: string;    // Legacy: report || activity
  is_complete: boolean;
  updated_at: string;
}

export interface UseWorkerOutputReturn {
  activity: string;   // Tool trace
  report: string;     // Final report
  output: string;     // Legacy field
  status: string;
  isComplete: boolean;
  isLoading: boolean;
  error: string | null;
  updatedAt: string | null;
}

/**
 * Fetch worker output from API.
 */
async function fetchWorkerOutput(workerId: string): Promise<WorkerOutput> {
  const res = await fetch(`${API_BASE}/api/workers/${workerId}/output`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Worker not found');
    }
    throw new Error('Failed to fetch worker output');
  }

  return res.json();
}

/**
 * Hook for worker output with SSE-driven updates.
 *
 * Jan 2026: NO POLLING. Data is fetched once, then SSE events
 * (worker.output_updated) automatically invalidate the cache and trigger refetch.
 *
 * @param workerId - Worker ID to fetch (null to disable)
 * @param isRunning - Whether the worker is currently running (unused, kept for compatibility)
 */
export function useWorkerOutput(
  workerId: string | null,
  isRunning: boolean = false
): UseWorkerOutputReturn {
  // Fetch output using React Query
  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['workers', workerId, 'output'],
    queryFn: () => fetchWorkerOutput(workerId!),
    enabled: !!workerId,
    // NO refetchInterval - SSE handles updates via worker.output_updated
    refetchInterval: false,
    // Placeholder to prevent flicker during refetch
    placeholderData: (previousData) => previousData,
  });

  return {
    activity: data?.activity || '',
    report: data?.report || '',
    output: data?.output || '',
    status: data?.status || '',
    isComplete: data?.is_complete || false,
    isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    updatedAt: data?.updated_at || null,
  };
}

export default useWorkerOutput;
