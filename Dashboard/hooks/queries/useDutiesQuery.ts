/**
 * Duties Query Hooks - Chief duties (critical scheduled Chief work).
 *
 * Jan 2026: Duties are separate from missions.
 * - Duties run IN Chief's context (force reset -> inject prompt)
 * - Missions spawn NEW specialist windows
 */

'use client';

import { queryKeys } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Types
export interface Duty {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	schedule_time: string; // "06:00" (HH:MM, Pacific)
	prompt_file: string;
	timeout_minutes: number;
	enabled: boolean;
	last_run: string | null;
	last_status: string | null;
	created_at: string;
	updated_at: string;
}

export interface DutyExecution {
	id: string;
	duty_id: string;
	duty_slug: string;
	started_at: string;
	ended_at: string | null;
	status: string;
	session_id: string | null;
	error_message: string | null;
	duration_seconds: number | null;
}

interface DutiesResponse {
	duties: Duty[];
}

interface DutyHistoryResponse {
	duty_slug: string;
	executions: DutyExecution[];
}

interface RunningDutiesResponse {
	executions: DutyExecution[];
}

// Fetchers
async function fetchDuties(): Promise<DutiesResponse> {
	const response = await fetch(`${API_BASE}/api/duties`);
	if (!response.ok) {
		throw new Error(`Failed to fetch duties: ${response.statusText}`);
	}
	return response.json();
}

async function fetchDutyHistory(slug: string): Promise<DutyHistoryResponse> {
	const response = await fetch(`${API_BASE}/api/duties/${slug}/history?limit=5`);
	if (!response.ok) {
		throw new Error(`Failed to fetch duty history: ${response.statusText}`);
	}
	return response.json();
}

async function fetchRunningDuties(): Promise<RunningDutiesResponse> {
	const response = await fetch(`${API_BASE}/api/duties/executions/running`);
	if (!response.ok) {
		throw new Error(`Failed to fetch running duties: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Hook to fetch all Chief duties.
 *
 * Jan 2026: NO polling - SSE events handle updates via duty.* events
 */
export function useDutiesQuery() {
	return useQuery({
		queryKey: queryKeys.duties,
		queryFn: fetchDuties,
		// NO polling - SSE handles updates
		refetchInterval: false,
	});
}

/**
 * Hook to fetch execution history for a specific duty.
 *
 * @param slug - Duty slug
 * @param enabled - Whether to fetch (false disables query)
 */
export function useDutyHistoryQuery(slug: string, enabled: boolean = true) {
	return useQuery({
		queryKey: queryKeys.dutyHistory(slug),
		queryFn: () => fetchDutyHistory(slug),
		enabled,
		// NO polling - SSE handles updates
		refetchInterval: false,
	});
}

/**
 * Hook to fetch currently running duty executions.
 */
export function useRunningDutiesQuery() {
	return useQuery({
		queryKey: queryKeys.dutiesRunning,
		queryFn: fetchRunningDuties,
		// NO polling - SSE handles updates
		refetchInterval: false,
	});
}
