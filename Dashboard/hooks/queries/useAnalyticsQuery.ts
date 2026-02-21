'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

// ==========================================
// Types
// ==========================================

export interface WorkRhythmEntry {
  day: number;   // 0-6 (Sun-Sat)
  hour: number;  // 0-23
  count: number;
}

export interface SessionStat {
  count: number;
  avg_duration_mins: number;
}

export interface WeeklyComparison {
  this_week: { sessions: number; priorities_completed: number };
  last_week: { sessions: number; priorities_completed: number };
}

export interface PatternsData {
  work_rhythm: WorkRhythmEntry[];
  session_stats: Record<string, SessionStat>;
  app_distribution: { app: string; minutes: number; percentage: number }[];
  weekly_comparison: WeeklyComparison;
}

export interface OverviewData {
  drift_days: number | null;
  completion_rates: Record<string, number>;
  claude_time_today: number;
  priorities_today: Record<string, { total: number; completed: number }>;
}

export interface SystemData {
  database: {
    size_bytes: number;
    wal_size_bytes: number;
    tables: Record<string, number>;
  };
}

export interface SpecialistRoleData {
  tasks: number;
  passed: number;
  pass_rate: number | null;
  avg_impl_iterations: number | null;
  avg_duration_min: number | null;
}

export interface SpecialistsData {
  summary: {
    total_tasks: number;
    passed: number;
    pass_rate: number | null;
    avg_iterations: number | null;
    avg_duration_min: number | null;
  };
  by_role: Record<string, SpecialistRoleData>;
  days: number;
}

export interface FileEntry {
  file: string;
  count: number;
}

export interface RWRatioEntry {
  directory: string;
  reads: number;
  writes: number;
  ratio: number | null;
}

export interface FilesData {
  top_read: FileEntry[];
  top_written: FileEntry[];
  rw_ratio: RWRatioEntry[];
  by_role: Record<string, { reads: number; writes: number }>;
  days: number;
}

export interface ToolDetailsData {
  mcp_operations: Record<string, { operation: string; count: number }[]>;
  search_patterns: { tool: string; pattern: string; count: number }[];
  bash_categories: { category: string; count: number }[];
  subagent_types: { type: string; count: number }[];
  days: number;
}

export interface InsightEntry {
  category: string;
  icon: string;
  text: string;
  value: number;
}

export interface InsightsData {
  insights: InsightEntry[];
  days: number;
}

// ==========================================
// Fetch functions
// ==========================================

async function fetchPatterns(): Promise<PatternsData> {
  const res = await fetch(`${API_BASE}/api/analytics/patterns?days=7`);
  if (!res.ok) throw new Error(`Failed to fetch patterns: ${res.statusText}`);
  return res.json();
}

async function fetchOverview(): Promise<OverviewData> {
  const res = await fetch(`${API_BASE}/api/analytics/overview`);
  if (!res.ok) throw new Error(`Failed to fetch overview: ${res.statusText}`);
  return res.json();
}

async function fetchSystem(): Promise<SystemData> {
  const res = await fetch(`${API_BASE}/api/analytics/system`);
  if (!res.ok) throw new Error(`Failed to fetch system: ${res.statusText}`);
  return res.json();
}

async function fetchSpecialists(): Promise<SpecialistsData> {
  const res = await fetch(`${API_BASE}/api/analytics/specialists?days=30`);
  if (!res.ok) throw new Error(`Failed to fetch specialists: ${res.statusText}`);
  return res.json();
}

async function fetchFiles(): Promise<FilesData> {
  const res = await fetch(`${API_BASE}/api/analytics/files?days=30`);
  if (!res.ok) throw new Error(`Failed to fetch files: ${res.statusText}`);
  return res.json();
}

async function fetchToolDetails(): Promise<ToolDetailsData> {
  const res = await fetch(`${API_BASE}/api/analytics/tool-details?days=30`);
  if (!res.ok) throw new Error(`Failed to fetch tool details: ${res.statusText}`);
  return res.json();
}

async function fetchInsights(): Promise<InsightsData> {
  const res = await fetch(`${API_BASE}/api/analytics/insights?days=30`);
  if (!res.ok) throw new Error(`Failed to fetch insights: ${res.statusText}`);
  return res.json();
}

// ==========================================
// Hooks
// ==========================================

export function useAnalyticsPatternsQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsPatterns,
    queryFn: fetchPatterns,
    placeholderData: (prev) => prev,
  });
}

export function useAnalyticsOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsOverview,
    queryFn: fetchOverview,
    placeholderData: (prev) => prev,
  });
}

export function useAnalyticsSystemQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsSystem,
    queryFn: fetchSystem,
    placeholderData: (prev) => prev,
  });
}

export function useAnalyticsSpecialistsQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsSpecialists,
    queryFn: fetchSpecialists,
    placeholderData: (prev) => prev,
    retry: false, // May not exist yet
  });
}

export function useAnalyticsFilesQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsFiles,
    queryFn: fetchFiles,
    placeholderData: (prev) => prev,
  });
}

export function useAnalyticsToolDetailsQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsToolDetails,
    queryFn: fetchToolDetails,
    placeholderData: (prev) => prev,
  });
}

export function useAnalyticsInsightsQuery() {
  return useQuery({
    queryKey: queryKeys.analyticsInsights,
    queryFn: fetchInsights,
    placeholderData: (prev) => prev,
  });
}
