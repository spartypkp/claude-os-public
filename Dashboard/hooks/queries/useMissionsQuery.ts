/**
 * Missions Query Hooks - SSE-driven, no polling.
 * 
 * Jan 2026 Architecture:
 * - Data fetched via React Query
 * - Cache invalidated by SSE events (mission.*)
 * - No polling - updates are instant
 */

'use client';

import { queryKeys } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Types
// Note (Jan 2026): After Duties overhaul, missions only spawn specialists.
// Chief work is handled by duties. The 'protected' field has been removed.
export interface Mission {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	source: 'core_default' | 'custom_app' | 'user';  // No more 'core_protected'
	app_slug: string | null;
	prompt_type: string;
	prompt_file: string | null;
	prompt_inline: string | null;
	schedule_type: string | null;
	schedule_cron: string | null;
	schedule_time: string | null;
	schedule_days: string[] | null;
	trigger_type: string | null;
	trigger_config: Record<string, unknown> | null;
	timeout_minutes: number;
	role: string;  // Cannot be 'chief' - Chief work handled by duties
	mode: string;
	enabled: boolean;
	next_run: string | null;
	last_run: string | null;
	last_status: string | null;
	created_at: string;
	updated_at: string;
	is_scheduled: boolean;
	is_triggered: boolean;
	is_recurring: boolean;
}

export interface MissionExecution {
	id: string;
	mission_id: string;
	mission_slug: string;
	started_at: string;
	ended_at: string | null;
	status: string;
	session_id: string | null;
	transcript_path: string | null;
	output_summary: string | null;
	error_message: string | null;
	duration_seconds: number | null;
}

interface MissionsResponse {
	missions: Mission[];
	total: number;
}

interface RunningResponse {
	running: MissionExecution[];
	count: number;
}

interface HistoryResponse {
	mission: Mission;
	executions: MissionExecution[];
	total: number;
}

// Fetchers
async function fetchMissions(): Promise<MissionsResponse> {
	const response = await fetch(`${API_BASE}/api/missions`);
	if (!response.ok) {
		throw new Error(`Failed to fetch missions: ${response.statusText}`);
	}
	return response.json();
}

async function fetchRunningMissions(): Promise<RunningResponse> {
	const response = await fetch(`${API_BASE}/api/missions/running`);
	if (!response.ok) {
		throw new Error(`Failed to fetch running missions: ${response.statusText}`);
	}
	return response.json();
}

async function fetchMissionHistory(slug: string): Promise<HistoryResponse> {
	const response = await fetch(`${API_BASE}/api/missions/${slug}/history?limit=5`);
	if (!response.ok) {
		throw new Error(`Failed to fetch mission history: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Hook to fetch all missions.
 * 
 * Jan 2026: NO polling - SSE events handle updates via mission.* events
 */
export function useMissionsQuery() {
	return useQuery({
		queryKey: queryKeys.missions,
		queryFn: fetchMissions,
		// NO polling - SSE handles updates
		refetchInterval: false,
	});
}

/**
 * Hook to fetch currently running mission executions.
 * 
 * Jan 2026: NO polling - SSE events handle updates
 */
export function useRunningMissionsQuery() {
	return useQuery({
		queryKey: queryKeys.missionsRunning,
		queryFn: fetchRunningMissions,
		// NO polling - SSE handles updates
		refetchInterval: false,
	});
}

/**
 * Hook to fetch execution history for a specific mission.
 * 
 * @param slug - Mission slug
 * @param enabled - Whether to fetch (false disables query)
 */
export function useMissionHistoryQuery(slug: string, enabled: boolean = true) {
	return useQuery({
		queryKey: queryKeys.missionHistory(slug),
		queryFn: () => fetchMissionHistory(slug),
		enabled,
		// NO polling - SSE handles updates
		refetchInterval: false,
	});
}

