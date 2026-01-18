'use client';

import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Hourglass,
  Link2,
  Calendar,
} from 'lucide-react';
import { WorkerListItem, formatElapsedTime, formatScheduledTime } from '@/hooks/useWorkers';

interface ActivityWorkerRowProps {
  worker: WorkerListItem;
  isSelected?: boolean;
  onClick?: () => void;
  showElapsed?: boolean;
}

// Status icon component
function StatusIcon({ worker }: { worker: WorkerListItem }) {
  switch (worker.status) {
    case 'queued':
      if (worker.queue_reason === 'scheduled') {
        return <Calendar className="w-4 h-4 text-[var(--color-info)]" />;
      }
      if (worker.queue_reason === 'blocked') {
        return <Link2 className="w-4 h-4 text-[var(--color-warning)]" />;
      }
      return <Hourglass className="w-4 h-4 text-[var(--text-muted)]" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin" />;
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-[var(--color-error)]" />;
    default:
      return <Clock className="w-4 h-4 text-[var(--text-muted)]" />;
  }
}

// Status badge colors
function getStatusBadge(worker: WorkerListItem): { text: string; className: string } | null {
  if (worker.status === 'running') {
    return { text: formatElapsedTime(worker.created_at), className: 'text-[var(--color-primary)]' };
  }
  if (worker.status === 'queued' && worker.queue_reason === 'scheduled' && worker.execute_at) {
    return { text: formatScheduledTime(worker.execute_at), className: 'text-[var(--color-info)]' };
  }
  if (worker.status === 'queued' && worker.queue_reason === 'blocked') {
    return { text: 'blocked', className: 'text-[var(--color-warning)]' };
  }
  if (!worker.isAcked && (worker.status === 'complete' || worker.status === 'failed')) {
    return { text: 'to review', className: 'text-[var(--color-warning)]' };
  }
  return null;
}

export function ActivityWorkerRow({ worker, isSelected, onClick, showElapsed = true }: ActivityWorkerRowProps) {
  const statusBadge = getStatusBadge(worker);

  return (
    <div
      id={`worker-${worker.id.slice(0, 8)}`}
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all
        ${isSelected
          ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
          : 'hover:bg-[var(--surface-muted)]'}
      `}
    >
      {/* Status icon */}
      <StatusIcon worker={worker} />

      {/* Worker type */}
      <span className="text-xs font-mono text-[var(--text-muted)] w-16 flex-shrink-0">
        {worker.worker_type}
      </span>

      {/* Title */}
      <span className="flex-1 text-sm text-[var(--text-secondary)] truncate">
        {worker.title}
      </span>

      {/* Domain badge */}
      {worker.domain && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-accent)] text-[var(--text-muted)]">
          {worker.domain}
        </span>
      )}

      {/* Status badge */}
      {statusBadge && (
        <span className={`text-xs font-mono ${statusBadge.className}`}>
          {statusBadge.text}
        </span>
      )}
    </div>
  );
}

export default ActivityWorkerRow;
