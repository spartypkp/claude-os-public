'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

interface ClaudeStatusData {
	statusText: string | null;
}

async function fetchClaudeStatus(): Promise<ClaudeStatusData> {
	const res = await fetch(`${API_BASE}/api/sessions/activity`);
	if (!res.ok) return { statusText: null };
	const data = await res.json();

	const chief = data.sessions?.find(
		(s: { role: string; ended_at: string | null; status_text: string | null }) =>
			s.role === 'chief' && !s.ended_at && s.status_text
	);
	return { statusText: chief?.status_text ?? null };
}

/**
 * Hook for Claude status text in menubar.
 * SSE-invalidated via session.status events.
 */
export function useClaudeStatusQuery() {
	return useQuery({
		queryKey: [...queryKeys.sessionsActivity, 'status'] as const,
		queryFn: fetchClaudeStatus,
	});
}
