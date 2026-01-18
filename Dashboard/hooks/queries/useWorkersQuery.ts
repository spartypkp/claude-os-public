/**
 * Workers Query Hooks - React Query replacement for useWorkers.
 * 
 * Jan 2026 Architecture Overhaul:
 * Before: Polled /api/workers/queue, /api/workers/history every 2 seconds
 * After: Fetches once, SSE events invalidate cache automatically
 */

'use client';

import { useQuery, useQueries } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface Worker {
  id: string;
  worker_type: string;
  title: string;
  status: string;
  domain?: string;
  instructions?: string;
  queue_reason?: string;
  blocked_by?: string;
  execute_at?: string;
  created_at: string;
  completed_at?: string;
  report_summary?: string;
  display_status?: string;
}

interface QueueResponse {
  timestamp: string;
  workers: Worker[];
  total: number;
}

interface HistoryResponse {
  timestamp: string;
  workers: Worker[];
  total: number;
}

// Fetch queued workers
async function fetchQueue(): Promise<QueueResponse> {
  const response = await fetch(`${API_BASE}/api/workers/queue`);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker queue: ${response.statusText}`);
  }
  return response.json();
}

// Fetch worker history
async function fetchHistory(): Promise<HistoryResponse> {
  const response = await fetch(`${API_BASE}/api/workers/history`);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker history: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Hook to fetch worker queue.
 */
export function useWorkersQueueQuery() {
  return useQuery({
    queryKey: queryKeys.workersQueue,
    queryFn: fetchQueue,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to fetch worker history.
 */
export function useWorkersHistoryQuery() {
  return useQuery({
    queryKey: queryKeys.workersHistory,
    queryFn: fetchHistory,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Combined hook to fetch all worker data at once.
 * 
 * Replaces useWorkers with React Query.
 * Cache is automatically invalidated by SSE events.
 */
export function useWorkersQuery() {
  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.workersQueue,
        queryFn: fetchQueue,
      },
      {
        queryKey: queryKeys.workersHistory,
        queryFn: fetchHistory,
      },
    ],
  });

  const [queueResult, historyResult] = results;
  
  const queue = queueResult.data?.workers ?? [];
  const history = historyResult.data?.workers ?? [];

  // Categorize queue by status
  const queued = queue.filter((w) => w.queue_reason === 'waiting');
  const scheduled = queue.filter((w) => w.queue_reason === 'scheduled');
  const blocked = queue.filter((w) => w.queue_reason === 'blocked');

  // Get running workers (status === 'running' in history would be wrong,
  // but queue might have them if polling caught them mid-transition)
  const running = queue.filter((w) => w.status === 'running');

  // Jan 2026: Ack system removed (Phase 3 status simplification)
  // All completed workers shown in history, no "ready for review" concept
  const readyForReview: Worker[] = [];

  return {
    // Loading states
    isLoading: queueResult.isLoading || historyResult.isLoading,
    isFetching: queueResult.isFetching || historyResult.isFetching,
    isError: queueResult.isError || historyResult.isError,
    error: queueResult.error || historyResult.error,
    
    // Categorized data
    queue,
    queued,
    scheduled,
    blocked,
    running,
    history,
    readyForReview,
    
    // Counts
    queueCount: queue.length,
    historyCount: history.length,
    pendingReviewCount: readyForReview.length,
  };
}

