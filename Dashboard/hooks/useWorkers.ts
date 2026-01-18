/**
 * useWorkers - Hook for worker data (queue, running, history).
 * 
 * Jan 2026 Architecture Overhaul:
 * This is now a thin wrapper around useWorkersQuery.
 * NO POLLING - SSE events automatically invalidate the cache.
 * 
 * The interface is preserved for backward compatibility.
 */

'use client';

import { fetchWorkerReport } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { WorkerReport } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useWorkersQuery } from './queries/useWorkersQuery';

// Unified worker item for display - covers all states
export interface WorkerListItem {
	id: string;
	title: string;
	worker_type: string;
	status: 'queued' | 'running' | 'complete' | 'failed';
	queue_reason?: 'waiting' | 'scheduled' | 'blocked';
	blocked_by?: string;
	execute_at?: string;
	isAcked: boolean;
	domain?: string;
	instructions?: string;
	report_summary?: string;
	created_at: string;
	completed_at?: string;
	workspace_path?: string;
}

export interface UseWorkersReturn {
	// Worker lists by state
	queuedWorkers: WorkerListItem[];
	runningWorkers: WorkerListItem[];
	readyForReview: WorkerListItem[];
	historyWorkers: WorkerListItem[];
	allWorkers: WorkerListItem[];

	// Counts
	queuedCount: number;
	runningCount: number;
	reviewCount: number;

	// Selected worker
	selectedWorkerId: string | null;
	selectedWorker: WorkerListItem | undefined;
	selectedReport: WorkerReport | null;

	// Loading states
	loading: boolean;
	loadingReport: boolean;
	error: string | null;

	// Actions
	selectWorker: (workerId: string | null) => void;
	refresh: () => Promise<void>;
}

/**
 * Hook for worker data with selection support.
 * 
 * Jan 2026: NO POLLING. Data is fetched once and automatically updated
 * when SSE events arrive via EventStreamProvider.
 */
export function useWorkers(): UseWorkersReturn {
	const queryClient = useQueryClient();
	const {
		queue,
		running,
		history,
		isLoading,
		isError,
		error,
	} = useWorkersQuery();

	// Selection state (kept local since it's UI state, not server state)
	const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
	const [selectedReport, setSelectedReport] = useState<WorkerReport | null>(null);
	const [loadingReport, setLoadingReport] = useState(false);

	// Transform queue data to WorkerListItem format
	const queuedWorkers: WorkerListItem[] = queue
		.filter(w => w.status !== 'running')
		.map(w => ({
			id: w.id,
			title: w.title,
			worker_type: w.worker_type,
			status: 'queued' as const,
			queue_reason: w.queue_reason as 'waiting' | 'scheduled' | 'blocked' | undefined,
			blocked_by: w.blocked_by,
			execute_at: w.execute_at,
			isAcked: true, // Jan 2026: Ack system removed, all workers considered "acked"
			domain: w.domain,
			instructions: w.instructions,
			created_at: w.created_at,
		}));

	// Jan 2026: Ack system removed - all completed workers go to history
	const historyWorkers: WorkerListItem[] = history.map(w => ({
		id: w.id,
		title: w.title,
		worker_type: w.worker_type,
		status: w.display_status === 'failed' ? 'failed' : 'complete',
		isAcked: true, // Ack system removed
		domain: w.domain,
		report_summary: w.report_summary,
		created_at: w.created_at,
		completed_at: w.completed_at,
	}));

	// No more "ready for review" - ack system removed
	const readyForReview: WorkerListItem[] = [];

	// Jan 2026: Running workers come from queue (status === 'running')
	const runningWorkers: WorkerListItem[] = running.map(w => ({
		id: w.id,
		title: w.title,
		worker_type: w.worker_type,
		status: 'running' as const,
		isAcked: false,
		domain: w.domain,
		created_at: w.created_at,
	}));

	// Load worker report when selected
	const loadReport = useCallback(async (workerId: string) => {
		setLoadingReport(true);
		try {
			const report = await fetchWorkerReport(workerId);
			setSelectedReport(report);
		} catch (err) {
			console.error('Error loading report:', err);
			setSelectedReport(null);
		} finally {
			setLoadingReport(false);
		}
	}, []);

	// Handle worker selection
	const selectWorker = useCallback((workerId: string | null) => {
		setSelectedWorkerId(workerId);
		if (workerId) {
			loadReport(workerId);
		} else {
			setSelectedReport(null);
		}
	}, [loadReport]);

	// Manual refresh
	const refresh = useCallback(async () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.workers });
	}, [queryClient]);

	// Computed values
	const allWorkers = [...queuedWorkers, ...runningWorkers, ...readyForReview, ...historyWorkers];
	const selectedWorker = allWorkers.find(w => w.id === selectedWorkerId);

	return {
		// Worker lists
		queuedWorkers,
		runningWorkers,
		readyForReview,
		historyWorkers,
		allWorkers,

		// Counts
		queuedCount: queuedWorkers.length,
		runningCount: runningWorkers.length,
		reviewCount: readyForReview.length,

		// Selected worker
		selectedWorkerId,
		selectedWorker,
		selectedReport,

		// Loading states
		loading: isLoading,
		loadingReport,
		error: isError ? (error instanceof Error ? error.message : 'Failed to load workers') : null,

		// Actions
		selectWorker,
		refresh,
	};
}

// Helper to format elapsed time
export function formatElapsedTime(createdAt: string): string {
	const start = new Date(createdAt).getTime();
	const now = Date.now();
	const elapsedMs = now - start;

	const seconds = Math.floor(elapsedMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}

// Helper to format scheduled time
export function formatScheduledTime(executeAt: string): string {
	try {
		const date = new Date(executeAt);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();

		if (diffMs < 0) return 'now';

		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffDays > 0) {
			return `in ${diffDays}d`;
		} else if (diffHours > 0) {
			return `in ${diffHours}h`;
		} else if (diffMins > 0) {
			return `in ${diffMins}m`;
		} else {
			return 'soon';
		}
	} catch {
		return '';
	}
}

export default useWorkers;
