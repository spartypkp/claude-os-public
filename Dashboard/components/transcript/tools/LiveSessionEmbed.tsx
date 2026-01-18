'use client';

import { useWorkerStatusQuery } from '@/hooks/queries';
import {
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Loader2,
	Terminal,
	XCircle
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// =============================================================================
// LIVE WORKER EMBED
// =============================================================================

interface LiveWorkerEmbedProps {
	workerId: string;
	instructions?: string;
}

/**
 * Embeddable live worker view - shows real-time worker status and activity.
 * 
 * Jan 2026: Status now uses React Query + SSE events for instant updates.
 * Activity output still polls when expanded (streaming output, not events).
 */
export function LiveWorkerEmbed({ workerId, instructions }: LiveWorkerEmbedProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [activity, setActivity] = useState<string>('');
	const scrollRef = useRef<HTMLPreElement>(null);

	// Jan 2026: Use React Query instead of polling for status
	// SSE worker.* events automatically invalidate the cache
	const { data: workerData, error: queryError } = useWorkerStatusQuery(workerId);

	// Derive status from query data
	const status = workerData ? {
		status: workerData.status?.includes('complete') ? 'complete' as const :
			workerData.status?.includes('failed') ? 'failed' as const :
				workerData.status === 'pending' ? 'queued' as const : 'running' as const,
		title: workerData.title,
		report_summary: workerData.report_summary,
		created_at: workerData.created_at,
	} : null;

	const error = queryError ? 'Failed to fetch status' : null;

	// Fetch activity (output stream) - still needs polling when running
	// This is the actual worker output being generated, not status updates
	const fetchActivity = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE}/api/workers/${workerId}/output`);
			if (!res.ok) return;
			const data = await res.json();
			setActivity(data.activity || '');
		} catch { }
	}, [workerId]);

	// Fetch activity when expanded (only poll while running)
	useEffect(() => {
		if (!isExpanded) return;
		fetchActivity();
		// Only poll for activity output while worker is running
		if (status?.status === 'running' || status?.status === 'queued') {
			const interval = setInterval(fetchActivity, 1000);
			return () => clearInterval(interval);
		}
	}, [isExpanded, status?.status, fetchActivity]);

	// Auto-scroll
	useEffect(() => {
		if (scrollRef.current && status?.status === 'running') {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [activity, status?.status]);

	// Parse activity for preview
	const getLastActivity = (): string => {
		if (!activity) return '';
		const lines = activity.trim().split('\n');
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const event = JSON.parse(lines[i]);
				if (event.type === 'tool_start') return `🔧 ${event.name || 'tool'}`;
				if (event.type === 'progress') return `⏳ ${event.description || 'Working...'}`;
				if (event.type === 'text') return event.content?.slice(0, 50) || '';
			} catch {
				if (lines[i].trim()) return lines[i].trim().slice(0, 50);
			}
		}
		return '';
	};

	const isRunning = status?.status === 'running' || status?.status === 'queued';
	const lastActivity = getLastActivity();

	return (
		<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
			{/* Header */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--surface-muted)] transition-colors"
			>
				{/* Status icon */}
				{status?.status === 'running' ? (
					<Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin" />
				) : status?.status === 'complete' ? (
					<CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
				) : status?.status === 'failed' ? (
					<XCircle className="w-4 h-4 text-[var(--color-error)]" />
				) : (
					<Loader2 className="w-4 h-4 text-[var(--text-muted)] animate-spin" />
				)}

				{/* Worker info */}
				<div className="flex-1 min-w-0 text-left">
					<div className="flex items-center gap-2">
						<span className="text-[10px] font-mono text-[var(--text-muted)]">
							{workerId.slice(0, 8)}
						</span>
						<span className={`text-[10px] font-medium ${isRunning ? 'text-[var(--color-primary)]' : status?.status === 'complete' ? 'text-[var(--color-success)]' : 'text-[var(--text-muted)]'
							}`}>
							{status?.status || 'loading'}
						</span>
					</div>

					{/* Activity preview */}
					{!isExpanded && lastActivity && (
						<div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
							{lastActivity}
						</div>
					)}
				</div>

				{isExpanded ? (
					<ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				) : (
					<ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				)}
			</button>

			{/* Expanded content */}
			{isExpanded && (
				<div className="border-t border-[var(--border-subtle)]">
					{/* Instructions */}
					{instructions && (
						<div className="px-3 py-2 bg-[var(--surface-muted)]">
							<div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Instructions</div>
							<p className="text-[10px] text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-3">
								{instructions}
							</p>
						</div>
					)}

					{/* Activity log */}
					{activity && (
						<div className="p-2">
							<div className="flex items-center gap-1.5 mb-1">
								<Terminal className="w-3 h-3 text-[var(--text-muted)]" />
								<span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
									{isRunning ? 'Live Activity' : 'Activity Log'}
								</span>
								{isRunning && (
									<span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
								)}
							</div>
							<pre
								ref={scrollRef}
								className="text-[10px] text-[var(--text-secondary)] font-mono bg-[var(--surface-muted)] p-2 rounded max-h-[120px] overflow-y-auto whitespace-pre-wrap"
							>
								{activity}
							</pre>
						</div>
					)}

					{/* Report summary */}
					{status?.report_summary && (
						<div className="px-3 py-2 border-t border-[var(--border-subtle)]">
							<p className="text-[10px] text-[var(--text-secondary)]">
								{status.report_summary}
							</p>
						</div>
					)}

					{/* Error */}
					{error && (
						<div className="px-3 py-2 bg-[var(--color-error)]/10 text-[10px] text-[var(--color-error)]">
							{error}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default LiveWorkerEmbed;
