'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

interface ConnectionData {
	healthy: boolean;
	latencyMs: number | null;
}

interface SystemHealthData {
	backend: { healthy: boolean; latencyMs: number };
	scheduler: { running: boolean; entries: number };
	sessions: { active: number; chief: boolean };
}

async function fetchConnection(): Promise<ConnectionData> {
	try {
		const start = performance.now();
		const response = await fetch(`${API_BASE}/api/health`, {
			method: 'GET',
			signal: AbortSignal.timeout(3000),
		});
		const ms = Math.round(performance.now() - start);
		return { healthy: response.ok, latencyMs: ms };
	} catch {
		return { healthy: false, latencyMs: null };
	}
}

async function fetchSystemHealth(isHealthy: boolean, latencyMs: number | null): Promise<SystemHealthData> {
	const [scheduleRes, sessionsRes] = await Promise.all([
		fetch(`${API_BASE}/api/schedule`).then(r => r.json()).catch(() => null),
		fetch(`${API_BASE}/api/sessions/activity`).then(r => r.json()).catch(() => null),
	]);

	const activeSessions = sessionsRes?.sessions?.filter((s: { ended_at: string | null }) => !s.ended_at) || [];
	const hasChief = activeSessions.some((s: { role: string }) => s.role === 'chief');

	return {
		backend: { healthy: isHealthy, latencyMs: latencyMs ?? 0 },
		scheduler: {
			running: scheduleRes?.success ?? false,
			entries: scheduleRes?.entries?.length ?? 0,
		},
		sessions: { active: activeSessions.length, chief: hasChief },
	};
}

/**
 * Hook for basic connection health (healthy + latency).
 * No SSE event for health — uses 30s polling fallback.
 */
export function useConnectionQuery() {
	return useQuery({
		queryKey: queryKeys.health,
		queryFn: fetchConnection,
		refetchInterval: 30000,
	});
}

/**
 * Hook for detailed system health (popover data).
 * Enabled on demand when popover opens.
 */
export function useSystemHealthQuery(enabled: boolean, isHealthy: boolean, latencyMs: number | null) {
	return useQuery({
		queryKey: [...queryKeys.health, 'detailed'] as const,
		queryFn: () => fetchSystemHealth(isHealthy, latencyMs),
		enabled,
		staleTime: 0,
	});
}
