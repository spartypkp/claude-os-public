'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

export interface UsageData {
	session: {
		percentage: number;
		resetAt: string;
		used: number;
		total: number;
	};
	weekly?: {
		percentage: number;
		resetAt: string;
		used: number;
		total: number;
	} | null;
	model: string | null;
	plan: string | null;
	lastUpdated: string;
	status: 'success' | 'error' | 'no_data' | 'parsing_failed';
	error?: string;
	message?: string;
}

async function fetchUsage(): Promise<UsageData | null> {
	const response = await fetch(`${API_BASE}/api/analytics/usage/current`);
	if (!response.ok) return null;
	return response.json();
}

/**
 * Hook for usage battery data in menubar.
 * No SSE event for usage — uses 60s polling fallback.
 */
export function useUsageQuery() {
	return useQuery({
		queryKey: queryKeys.usage,
		queryFn: fetchUsage,
		refetchInterval: 60000,
	});
}

/**
 * Mutation to trigger a usage refresh.
 */
export function useRefreshUsage() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			await fetch(`${API_BASE}/api/analytics/usage/refresh`, { method: 'POST' });
			// Wait for backend to process the refresh
			await new Promise(resolve => setTimeout(resolve, 3000));
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.usage });
		},
	});
}
