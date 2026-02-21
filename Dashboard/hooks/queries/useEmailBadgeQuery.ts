'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

interface EmailBadgeData {
	unread_count: number;
}

async function fetchEmailBadge(): Promise<EmailBadgeData> {
	const res = await fetch(`${API_BASE}/api/email/triage`);
	if (!res.ok) return { unread_count: 0 };
	const data = await res.json();
	return { unread_count: data.unread_count || 0 };
}

/**
 * Hook for email unread badge in menubar.
 * SSE-invalidated via email.* events.
 */
export function useEmailBadgeQuery() {
	return useQuery({
		queryKey: queryKeys.emailTriage,
		queryFn: fetchEmailBadge,
	});
}
