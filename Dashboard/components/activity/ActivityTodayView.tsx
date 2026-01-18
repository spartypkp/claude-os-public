'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  XCircle,
  Crosshair,
  Clock,
  Users,
  Zap,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { UseActivityHubReturn } from '@/hooks/useActivityHub';
import { ActiveSession, ActiveMission } from '@/lib/types';
import {
  getRoleConfig,
  getModeConfig,
  getSessionDisplayName,
  getSessionRole,
  getSessionMode,
  getSessionDuration,
  getWorkerStats,
} from '@/lib/sessionUtils';

interface ActivityTodayViewProps {
  activity: UseActivityHubReturn;
}

// =========================================
// SUMMARY STATS COMPONENT
// =========================================

function SummaryStats({
  activeSessions,
  endedSessions,
  activeMissions,
}: {
  activeSessions: ActiveSession[];
  endedSessions: ActiveSession[];
  activeMissions: ActiveMission[];
}) {
  const activeCount = activeSessions.length + activeMissions.length;

  // Calculate total workers across all sessions
  const totalWorkers = useMemo(() => {
    const sessionWorkers = [...activeSessions, ...endedSessions].reduce(
      (sum, s) => sum + (s.workers?.length || 0),
      0
    );
    const missionWorkers = activeMissions.reduce(
      (sum, m) => sum + (m.workers?.length || 0),
      0
    );
    return sessionWorkers + missionWorkers;
  }, [activeSessions, endedSessions, activeMissions]);

  // Calculate total time in sessions today
  const totalMinutes = useMemo(() => {
    const allSessions = [...activeSessions, ...endedSessions];
    return allSessions.reduce((sum, s) => {
      const start = new Date(s.started_at);
      const end = s.ended_at ? new Date(s.ended_at) : new Date();
      return sum + (end.getTime() - start.getTime()) / 60000;
    }, 0);
  }, [activeSessions, endedSessions]);

  const formatTotalTime = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = Math.round(mins % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {/* Active Now */}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
          <Zap className="w-3.5 h-3.5" />
          Active Now
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-[var(--text-primary)]">{activeCount}</span>
          {activeCount > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
          )}
        </div>
      </div>

      {/* Time Today */}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
          <Timer className="w-3.5 h-3.5" />
          Time Today
        </div>
        <div className="text-2xl font-semibold text-[var(--text-primary)]">
          {formatTotalTime(totalMinutes)}
        </div>
      </div>

      {/* Workers */}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
          <Users className="w-3.5 h-3.5" />
          Workers
        </div>
        <div className="text-2xl font-semibold text-[var(--text-primary)]">
          {totalWorkers}
        </div>
      </div>
    </div>
  );
}

// Session card component with role-based styling
function SessionCard({ session, onClick }: { session: ActiveSession; onClick: () => void }) {
  const isActive = !session.ended_at;
  const role = getSessionRole(session);
  const mode = getSessionMode(session);
  const roleConfig = getRoleConfig(role);
  const modeConfig = getModeConfig(mode);
  const displayName = getSessionDisplayName(session);
  const workerStats = getWorkerStats(session);
  const duration = getSessionDuration(session.started_at, session.ended_at);
  const RoleIcon = roleConfig.icon;

  return (
    <button
      onClick={onClick}
      className={`
        w-full rounded-xl border p-4 text-left transition-all group
        bg-[var(--surface-raised)] border-[var(--border-subtle)]
        hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)]
        ${workerStats.needsReview > 0 ? 'ring-1 ring-[var(--color-warning)]/30' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Role Icon */}
        <div className={`flex-shrink-0 p-2.5 rounded-xl ${roleConfig.bgColor}`}>
          <RoleIcon className={`w-5 h-5 ${roleConfig.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--text-primary)]">{displayName}</span>

            {/* Mode badge */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${modeConfig.bgColor} ${modeConfig.color}`}>
              {modeConfig.label}
            </span>

            {/* Active indicator */}
            {isActive && (
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${modeConfig.dotColor}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${modeConfig.dotColor}`} />
              </span>
            )}
          </div>

          {/* Description if present */}
          {session.description && (
            <p className="text-sm text-[var(--text-muted)] truncate mt-0.5">
              {session.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
            {/* Duration */}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {duration}
            </span>

            {/* Workers */}
            {workerStats.total > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {workerStats.activeCount > 0 ? (
                  <span>{workerStats.activeCount} active</span>
                ) : (
                  <span>{workerStats.total} workers</span>
                )}
              </span>
            )}

            {/* Needs review badge */}
            {workerStats.needsReview > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] font-medium">
                {workerStats.needsReview} need review
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

// Mission card (for missions not in sessions table yet)
function MissionCard({ mission, onClick }: { mission: ActiveMission; onClick: () => void }) {
  const modeConfig = getModeConfig('mission');
  const duration = getSessionDuration(mission.started_at);
  const workerCount = mission.workers?.length || 0;
  const runningCount = mission.workers?.filter(w => w.status === 'running').length || 0;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border p-4 text-left transition-all group bg-[var(--surface-raised)] border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)]"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 p-2.5 rounded-xl bg-purple-500/10">
          <Crosshair className="w-5 h-5 text-purple-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--text-primary)]">{mission.name}</span>

            {/* Mission badge */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${modeConfig.bgColor} ${modeConfig.color}`}>
              {modeConfig.label}
            </span>

            {/* Active indicator */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
            {/* Duration */}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {duration}
            </span>

            {/* Workers */}
            {workerCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {runningCount > 0 ? (
                  <span>{runningCount} running</span>
                ) : (
                  <span>{workerCount} workers</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

// Compact row for ended sessions (timeline style)
function EndedSessionRow({ session, onClick }: { session: ActiveSession; onClick: () => void }) {
  const role = getSessionRole(session);
  const mode = getSessionMode(session);
  const roleConfig = getRoleConfig(role);
  const modeConfig = getModeConfig(mode);
  const displayName = getSessionDisplayName(session);
  const duration = getSessionDuration(session.started_at, session.ended_at);
  const workerStats = getWorkerStats(session);
  const RoleIcon = roleConfig.icon;

  // Format end time
  const endTime = session.ended_at ? format(new Date(session.ended_at), 'h:mm a') : '';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors group"
    >
      {/* Time column */}
      <div className="w-16 text-xs text-[var(--text-muted)] text-right flex-shrink-0">
        {endTime}
      </div>

      {/* Timeline dot */}
      <div className="relative flex-shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${roleConfig.bgColor} border-2 border-[var(--surface-base)]`} />
      </div>

      {/* Icon */}
      <div className={`p-1.5 rounded-lg ${roleConfig.bgColor} flex-shrink-0`}>
        <RoleIcon className={`w-3.5 h-3.5 ${roleConfig.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-[var(--text-primary)] truncate">{displayName}</span>
        <span className={`text-[9px] px-1 py-0.5 rounded ${modeConfig.bgColor} ${modeConfig.color}`}>
          {modeConfig.label}
        </span>
      </div>

      {/* Duration */}
      <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{duration}</span>

      {/* Workers badge if any */}
      {workerStats.total > 0 && (
        <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded flex-shrink-0">
          {workerStats.total}
        </span>
      )}

      {/* Arrow */}
      <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// Section header component
function SectionHeader({
  title,
  count,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
        )}
        <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {title}
        </span>
        <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-raised)] px-2 py-0.5 rounded-full">
          {count}
        </span>
      </button>
      {isExpanded && children}
    </div>
  );
}

export function ActivityTodayView({ activity }: ActivityTodayViewProps) {
  const router = useRouter();
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [earlierExpanded, setEarlierExpanded] = useState(true);
  const selectedIndexRef = useRef<number>(-1);

  const { sessions, missions, isLoading, error, refresh } = activity;

  // Separate active vs ended sessions
  const activeSessions = sessions.filter(s => !s.ended_at);
  const endedSessions = sessions.filter(s => s.ended_at);
  const activeMissions = missions.filter(m => m.status === 'running');

  // All navigable items for keyboard
  const allItems = useMemo(() => [
    ...activeSessions.map(s => ({ type: 'session' as const, id: s.session_id })),
    ...activeMissions.map(m => ({ type: 'mission' as const, id: m.id })),
    ...endedSessions.map(s => ({ type: 'session' as const, id: s.session_id })),
  ], [activeSessions, activeMissions, endedSessions]);

  // Navigate to session detail
  const handleSessionClick = (sessionId: string) => {
    router.push(`/activity/session/${sessionId}`);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (allItems.length === 0) return;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          selectedIndexRef.current = Math.min(selectedIndexRef.current + 1, allItems.length - 1);
          break;
        case 'k':
          e.preventDefault();
          selectedIndexRef.current = Math.max(selectedIndexRef.current - 1, 0);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndexRef.current >= 0 && selectedIndexRef.current < allItems.length) {
            const item = allItems[selectedIndexRef.current];
            handleSessionClick(item.id);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allItems, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--border-subtle)]" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[var(--color-primary)] animate-spin" />
            <Activity className="absolute inset-0 m-auto w-6 h-6 text-[var(--color-primary)]" />
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">Loading activity...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-[var(--color-error)]" />
          <p className="text-[var(--text-secondary)] mb-4">{error}</p>
          <button
            onClick={refresh}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state - subtle, not hero
  const isEmpty = activeSessions.length === 0 && activeMissions.length === 0 && endedSessions.length === 0;
  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-tertiary)]">
            No sessions today. Start a conversation to see activity.
          </p>
        </div>
      </div>
    );
  }

  const hasActive = activeSessions.length > 0 || activeMissions.length > 0;
  const hasEarlier = endedSessions.length > 0;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Summary Stats */}
      <SummaryStats
        activeSessions={activeSessions}
        endedSessions={endedSessions}
        activeMissions={activeMissions}
      />

      {/* Active Section - Prominent cards */}
      {hasActive && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Active Now
            </span>
          </div>
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.session_id}
                session={session}
                onClick={() => handleSessionClick(session.session_id)}
              />
            ))}
            {activeMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                onClick={() => handleSessionClick(mission.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Earlier Section - Compact timeline */}
      {hasEarlier && (
        <div>
          <button
            onClick={() => setEarlierExpanded(!earlierExpanded)}
            className="w-full flex items-center gap-2 mb-3 group"
          >
            {earlierExpanded ? (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            )}
            <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Earlier Today
            </span>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-raised)] px-2 py-0.5 rounded-full">
              {endedSessions.length}
            </span>
          </button>

          {earlierExpanded && (
            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              {/* Timeline line */}
              <div className="divide-y divide-[var(--border-subtle)]">
                {endedSessions.map((session) => (
                  <EndedSessionRow
                    key={session.session_id}
                    session={session}
                    onClick={() => handleSessionClick(session.session_id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keyboard hint */}
      <div className="mt-6 text-center text-xs text-[var(--text-muted)]">
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] font-mono">j</kbd>
        <span className="mx-1">/</span>
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] font-mono">k</kbd>
        <span className="ml-2">navigate</span>
        <span className="mx-3">·</span>
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] font-mono">Enter</kbd>
        <span className="ml-2">open</span>
      </div>
    </div>
  );
}

export default ActivityTodayView;
