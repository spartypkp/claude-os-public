'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Crown,
  Terminal,
  Target,
  Crosshair,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ActiveSession, ActiveMission, ActiveWorker } from '@/lib/types';

// TODO (Phase 5): Update to work with ActiveConversation
interface ActivityConversationCardProps {
  session?: ActiveSession;
  mission?: ActiveMission;
  onClick?: () => void;
  showArrow?: boolean;
}

// Get icon for session type
function getSessionIcon(session: ActiveSession): React.ReactNode {
  const { session_type, session_subtype } = session;

  if (session_type === 'mission') {
    return <Crosshair className="w-5 h-5" />;
  }

  switch (session_subtype) {
    case 'main':
      return <Crown className="w-5 h-5" />;
    case 'builder':
      return <Terminal className="w-5 h-5" />;
    case 'focus':
      return <Target className="w-5 h-5" />;
    default:
      return <Crown className="w-5 h-5" />;
  }
}

// Get display name for session
function getSessionDisplayName(session: ActiveSession): string {
  const { session_type, session_subtype } = session;

  if (session_type === 'mission') {
    return session_subtype || 'Mission';
  }

  switch (session_subtype) {
    case 'main':
      return 'Primary Claude';
    case 'builder':
      return 'Builder Claude';
    case 'focus':
      return 'Focus Claude';
    default:
      return session_subtype || 'Claude Specialist';
  }
}

// Format worker summary
function getWorkerSummary(workers: ActiveWorker[]): { text: string; needsReview: number } {
  if (workers.length === 0) return { text: '', needsReview: 0 };

  const running = workers.filter(w => w.status === 'running').length;
  // Workers that are complete or failed but not acked need review
  const needsReview = workers.filter(w =>
    w.status === 'complete' ||
    w.status === 'complete_unacked' ||
    w.status === 'failed' ||
    w.status === 'failed_unacked'
  ).length;

  // Don't count needs-review workers in the main count
  const activeWorkers = workers.filter(w =>
    w.status === 'pending' || w.status === 'running' || w.status === 'awaiting_clarification'
  ).length;

  let text = '';
  if (activeWorkers > 0) {
    text = `${activeWorkers} worker${activeWorkers !== 1 ? 's' : ''}`;
    if (running > 0) {
      text += ` (${running} running)`;
    }
  }

  return { text, needsReview };
}

export function ActivityConversationCard({ session, mission, onClick, showArrow = true }: ActivityConversationCardProps) {
  // Determine if this is a session or mission
  const isMission = !!mission;
  const data = session || mission;

  if (!data) return null;

  // Get session info
  const sessionId = session?.session_id || mission?.id;
  const isActive = session ? !session.ended_at : mission?.status === 'running';
  const startedAt = session?.started_at || mission?.started_at;
  const endedAt = session?.ended_at;
  const workers = session?.workers || mission?.workers || [];

  const displayName = session ? getSessionDisplayName(session) : (mission?.name || 'Mission');
  const { text: workerSummary, needsReview } = getWorkerSummary(workers);

  // Format elapsed time
  const elapsedText = useMemo(() => {
    if (!startedAt) return '';
    try {
      if (endedAt) {
        return `ended ${formatDistanceToNow(new Date(endedAt), { addSuffix: true })}`;
      }
      return `started ${formatDistanceToNow(new Date(startedAt), { addSuffix: true })}`;
    } catch {
      return '';
    }
  }, [startedAt, endedAt]);

  const content = (
    <div className="flex items-start gap-3">
      {/* Icon */}
      <div className={`
        flex-shrink-0 p-2 rounded-lg
        ${isMission ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'}
      `}>
        {session ? getSessionIcon(session) : <Crosshair className="w-5 h-5" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--text-primary)]">{displayName}</span>
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isMission ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-success)]'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isMission ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-success)]'}`} />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 text-sm text-[var(--text-muted)]">
          <span>{elapsedText}</span>
          {workerSummary && (
            <>
              <span>·</span>
              <span>{workerSummary}</span>
            </>
          )}
          {needsReview > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--color-warning)]">{needsReview} need review</span>
            </>
          )}
        </div>
      </div>

      {/* Arrow */}
      {showArrow && (
        <ChevronRight className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" />
      )}
    </div>
  );

  const cardClass = `
    w-full rounded-lg border p-4 text-left transition-all
    bg-[var(--surface-raised)] border-[var(--border-subtle)]
    hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)]
    ${needsReview > 0 ? 'border-l-2 border-l-[var(--color-warning)]' : ''}
  `;

  if (onClick) {
    return (
      <button id={`session-${sessionId?.slice(0, 8)}`} onClick={onClick} className={cardClass}>
        {content}
      </button>
    );
  }

  return (
    <Link id={`session-${sessionId?.slice(0, 8)}`} href={`/activity/session/${sessionId}`} className={`block ${cardClass}`}>
      {content}
    </Link>
  );
}

export default ActivityConversationCard;
