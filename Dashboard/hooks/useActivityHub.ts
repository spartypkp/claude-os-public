'use client';

import { useState, useCallback, useMemo } from 'react';
import { useClaudeActivity } from './useClaudeActivity';
import { useWorkers, WorkerListItem, formatElapsedTime, formatScheduledTime } from './useWorkers';
import { ackWorker, snoozeWorker, cancelWorker } from '@/lib/api';
import { ActiveSession, ActiveMission, WorkerReport } from '@/lib/types';

// Re-export helpers for convenience
export { formatElapsedTime, formatScheduledTime };
export type { WorkerListItem };

export interface UseActivityHubReturn {
  // === Sessions & Missions (from useClaudeActivity) ===
  sessions: ActiveSession[];
  missions: ActiveMission[];
  hasActivity: boolean;

  // === Workers (from useWorkers) ===
  queuedWorkers: WorkerListItem[];
  runningWorkers: WorkerListItem[];
  readyForReview: WorkerListItem[];
  historyWorkers: WorkerListItem[];

  // === Counts ===
  queuedCount: number;
  runningCount: number;
  reviewCount: number;
  sessionCount: number;

  // === Selection State ===
  selectedSessionId: string | null;
  selectedSession: ActiveSession | null;
  selectedWorkerId: string | null;
  selectedWorker: WorkerListItem | undefined;
  selectedWorkerReport: WorkerReport | null;

  // === Loading States ===
  isLoading: boolean;
  isLoadingReport: boolean;
  error: string | null;

  // === Actions ===
  selectSession: (sessionId: string | null) => void;
  selectWorker: (workerId: string | null) => void;
  refresh: () => Promise<void>;

  // === Worker Actions ===
  handleAck: (workerId: string) => Promise<boolean>;
  handleSnooze: (workerId: string, duration: string) => Promise<boolean>;
  handleCancel: (workerId: string) => Promise<boolean>;
}

/**
 * Unified hook for the Activity Hub.
 * Combines session/mission data with worker data and provides selection state.
 */
export function useActivityHub(): UseActivityHubReturn {
  // Session selection state (local to this hook)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Get session/mission data
  const claudeActivity = useClaudeActivity(5000);

  // Get worker data with built-in selection
  const workers = useWorkers();

  // Find selected session
  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return claudeActivity.sessions.find(s => s.session_id === selectedSessionId) || null;
  }, [selectedSessionId, claudeActivity.sessions]);

  // Session selection handler
  const selectSession = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId);
    // Clear worker selection when changing sessions
    if (sessionId !== selectedSessionId) {
      workers.selectWorker(null);
    }
  }, [selectedSessionId, workers]);

  // Combined refresh
  const refresh = useCallback(async () => {
    await Promise.all([
      claudeActivity.refresh(),
      workers.refresh(),
    ]);
  }, [claudeActivity, workers]);

  // Worker action handlers with refresh
  const handleAck = useCallback(async (workerId: string): Promise<boolean> => {
    try {
      const result = await ackWorker(workerId);
      if (result.success) {
        await workers.refresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [workers]);

  const handleSnooze = useCallback(async (workerId: string, duration: string): Promise<boolean> => {
    try {
      const result = await snoozeWorker(workerId, duration);
      if (result.success) {
        await workers.refresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [workers]);

  const handleCancel = useCallback(async (workerId: string): Promise<boolean> => {
    try {
      const result = await cancelWorker(workerId);
      if (result.success) {
        await workers.refresh();
        workers.selectWorker(null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [workers]);

  return {
    // Sessions & Missions
    sessions: claudeActivity.sessions,
    missions: claudeActivity.missions,
    hasActivity: claudeActivity.hasActivity,

    // Workers
    queuedWorkers: workers.queuedWorkers,
    runningWorkers: workers.runningWorkers,
    readyForReview: workers.readyForReview,
    historyWorkers: workers.historyWorkers,

    // Counts
    queuedCount: workers.queuedCount,
    runningCount: workers.runningCount,
    reviewCount: workers.reviewCount,
    sessionCount: claudeActivity.sessions.length,

    // Selection
    selectedSessionId,
    selectedSession,
    selectedWorkerId: workers.selectedWorkerId,
    selectedWorker: workers.selectedWorker,
    selectedWorkerReport: workers.selectedReport,

    // Loading
    isLoading: claudeActivity.isLoading || workers.loading,
    isLoadingReport: workers.loadingReport,
    error: claudeActivity.error || workers.error,

    // Actions
    selectSession,
    selectWorker: workers.selectWorker,
    refresh,

    // Worker actions
    handleAck,
    handleSnooze,
    handleCancel,
  };
}

export default useActivityHub;
