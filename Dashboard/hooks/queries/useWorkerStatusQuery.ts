/**
 * Worker Status Query Hook - For individual worker status polling.
 * 
 * Jan 2026 Architecture Overhaul:
 * This replaces manual polling in WorkerInlineCard.
 * When worker.completed event fires, React Query will refetch.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface WorkerStatus {
	id: string;
	status: string;
	worker_type?: string;
	title?: string;
	report_md?: string;
	report_summary?: string;
	created_at?: string;
}

async function fetchWorkerStatus(workerId: string): Promise<WorkerStatus> {
	const response = await fetch(`${API_BASE}/api/workers/${workerId}/report`);
	if (!response.ok) {
		throw new Error(`Failed to fetch worker status: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Hook to fetch individual worker status.
 * 
 * @param workerId - The worker ID to fetch
 * @param enabled - Whether to fetch (false disables the query)
 */
export function useWorkerStatusQuery(workerId: string, enabled: boolean = true) {
	return useQuery({
		queryKey: ['workers', workerId, 'status'],
		queryFn: () => fetchWorkerStatus(workerId),
		enabled,
		// Jan 2026: NO polling - SSE events handle updates via worker.* events
		// The query key ['workers', workerId] matches queryKeys.workers prefix
		refetchInterval: false,
		placeholderData: (previousData) => previousData,
	});
}

