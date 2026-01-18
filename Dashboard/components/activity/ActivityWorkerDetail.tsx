'use client';

import { useState, useCallback } from 'react';
import {
  X,
  Loader2,
  Terminal,
  FileText,
  ScrollText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Hourglass,
  Activity,
  Calendar,
  Link2,
  Copy,
  Check,
  CheckSquare,
  AlarmClock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { WorkerListItem, formatElapsedTime, formatScheduledTime } from '@/hooks/useWorkers';
import { useWorkerOutput } from '@/hooks/useWorkerOutput';
import { StructuredOutputViewer } from '@/components/shared/StructuredOutputViewer';
import { ackWorker, snoozeWorker, cancelWorker } from '@/lib/api';

interface ActivityWorkerDetailProps {
  worker: WorkerListItem;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

/**
 * Worker Detail Panel for Activity Hub
 *
 * Shows detailed information about a selected worker:
 * - Status and metadata
 * - Instructions (collapsible)
 * - Live trace or execution trace
 * - Report for completed workers
 * - Action buttons (ack/snooze/cancel)
 */
export function ActivityWorkerDetail({ worker, onClose, onRefresh }: ActivityWorkerDetailProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [showSnoozeDropdown, setShowSnoozeDropdown] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Collapsible sections
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    instructions: true, // Start collapsed
    trace: false,
    report: false,
  });

  // Get worker output/report
  const { output, isLoading: loadingOutput } = useWorkerOutput(
    worker.id,
    worker.status === 'running'
  );

  // Action checks
  const canAck = !worker.isAcked && worker.status !== 'running' && worker.status !== 'queued';
  const canCancel = worker.status === 'running' || worker.status === 'queued';

  // Copy worker ID
  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(worker.id);
    setCopiedId(true);
    toast.success('Worker ID copied');
    setTimeout(() => setCopiedId(false), 2000);
  }, [worker.id]);

  // Acknowledge
  const handleAck = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading('ack');
    try {
      const result = await ackWorker(worker.id);
      if (result.success) {
        toast.success('Worker acknowledged');
        await onRefresh();
        onClose();
      } else {
        toast.error(result.error || 'Failed to acknowledge');
      }
    } catch {
      toast.error('Failed to acknowledge worker');
    } finally {
      setActionLoading(null);
    }
  }, [worker.id, actionLoading, onRefresh, onClose]);

  // Snooze
  const handleSnooze = useCallback(async (duration: string) => {
    if (actionLoading) return;
    setActionLoading('snooze');
    setShowSnoozeDropdown(false);
    try {
      const result = await snoozeWorker(worker.id, duration);
      if (result.success) {
        toast.success(`Worker snoozed for ${duration.replace('+', '')}`);
        await onRefresh();
        onClose();
      } else {
        toast.error(result.error || 'Failed to snooze');
      }
    } catch {
      toast.error('Failed to snooze worker');
    } finally {
      setActionLoading(null);
    }
  }, [worker.id, actionLoading, onRefresh, onClose]);

  // Cancel
  const handleCancel = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading('cancel');
    setShowCancelConfirm(false);
    try {
      const result = await cancelWorker(worker.id);
      if (result.success) {
        toast.success('Worker cancelled');
        await onRefresh();
        onClose();
      } else {
        toast.error(result.error || 'Failed to cancel');
      }
    } catch {
      toast.error('Failed to cancel worker');
    } finally {
      setActionLoading(null);
    }
  }, [worker.id, actionLoading, onRefresh, onClose]);

  // Toggle section
  const toggleSection = (section: 'instructions' | 'trace' | 'report') => {
    setSectionsCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="border-t border-[var(--border-default)] bg-[var(--surface-raised)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusIcon status={worker.status} />
            <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
              {worker.title}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
            <span className="font-mono">{worker.worker_type}</span>
            <span>·</span>
            <StatusText status={worker.status} queueReason={worker.queue_reason} />
            {worker.domain && (
              <>
                <span>·</span>
                <span>{worker.domain}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-3">
          {canAck && (
            <button
              onClick={handleAck}
              disabled={actionLoading === 'ack'}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-success)] hover:bg-[var(--color-success)]/10 rounded transition-colors disabled:opacity-50"
              title="Acknowledge"
            >
              {actionLoading === 'ack' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckSquare className="w-3.5 h-3.5" />
              )}
              Ack
            </button>
          )}

          {canAck && (
            <div className="relative">
              <button
                onClick={() => setShowSnoozeDropdown(!showSnoozeDropdown)}
                disabled={actionLoading === 'snooze'}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 rounded transition-colors disabled:opacity-50"
                title="Snooze"
              >
                {actionLoading === 'snooze' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <AlarmClock className="w-3.5 h-3.5" />
                )}
                Snooze
              </button>
              {showSnoozeDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSnoozeDropdown(false)} />
                  <div className="absolute right-0 bottom-full mb-1 w-32 bg-[var(--surface-overlay)] border border-[var(--border-default)] rounded-lg shadow-lg z-20 py-1">
                    {[
                      { label: '1 hour', value: '+1h' },
                      { label: '4 hours', value: '+4h' },
                      { label: 'Tomorrow', value: '+1d' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleSnooze(opt.value)}
                        className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {canCancel && (
            <div className="relative">
              <button
                onClick={() => setShowCancelConfirm(!showCancelConfirm)}
                disabled={actionLoading === 'cancel'}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded transition-colors disabled:opacity-50"
                title="Cancel"
              >
                {actionLoading === 'cancel' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                Cancel
              </button>
              {showCancelConfirm && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCancelConfirm(false)} />
                  <div className="absolute right-0 bottom-full mb-1 w-40 bg-[var(--surface-overlay)] border border-[var(--border-default)] rounded-lg shadow-lg z-20 p-2">
                    <p className="text-xs text-[var(--text-secondary)] mb-2">Cancel this worker?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="flex-1 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] rounded"
                      >
                        No
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 px-2 py-1 text-xs text-white bg-[var(--color-error)] hover:bg-[var(--color-error)]/80 rounded"
                      >
                        Yes
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />

          <button
            onClick={handleCopyId}
            className="p-1 hover:bg-[var(--surface-muted)] rounded transition-colors"
            title="Copy ID"
          >
            {copiedId ? (
              <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
          </button>

          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--surface-muted)] rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Timeline info */}
      <div className="px-4 py-2 flex items-center gap-4 text-xs text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Created {formatDistanceToNow(new Date(worker.created_at), { addSuffix: true })}
        </span>
        {worker.status === 'running' && (
          <span className="flex items-center gap-1 text-[var(--color-primary)]">
            <Activity className="w-3.5 h-3.5" />
            {formatElapsedTime(worker.created_at)} elapsed
          </span>
        )}
        {worker.status === 'queued' && worker.execute_at && (
          <span className="flex items-center gap-1 text-[var(--color-info)]">
            <Calendar className="w-3.5 h-3.5" />
            {formatScheduledTime(worker.execute_at)}
          </span>
        )}
        {worker.status === 'queued' && worker.blocked_by && (
          <span className="flex items-center gap-1 text-[var(--color-warning)]">
            <Link2 className="w-3.5 h-3.5" />
            blocked by {worker.blocked_by}
          </span>
        )}
      </div>

      {/* Content - scrollable with max height */}
      <div className="max-h-80 overflow-y-auto p-4 space-y-3">
        {/* Instructions */}
        {worker.instructions && (
          <CollapsibleSection
            title="Instructions"
            icon={<ScrollText className="w-3.5 h-3.5" />}
            isCollapsed={sectionsCollapsed.instructions}
            onToggle={() => toggleSection('instructions')}
          >
            <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed p-3 bg-[var(--surface-muted)] rounded-md">
              {worker.instructions}
            </pre>
          </CollapsibleSection>
        )}

        {/* Trace for running/completed workers */}
        {worker.status !== 'queued' && (
          <CollapsibleSection
            title={worker.status === 'running' ? 'Live Trace' : 'Execution Trace'}
            icon={<Terminal className="w-3.5 h-3.5" />}
            isCollapsed={sectionsCollapsed.trace}
            onToggle={() => toggleSection('trace')}
            badge={worker.status === 'running' ? (
              <span className="relative flex h-2 w-2 ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-primary)]" />
              </span>
            ) : null}
          >
            {loadingOutput && !output ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
              </div>
            ) : (
              <StructuredOutputViewer output={output || ''} isRunning={worker.status === 'running'} />
            )}
          </CollapsibleSection>
        )}

        {/* Queued info */}
        {worker.status === 'queued' && (
          <div className="text-center py-6">
            <Hourglass className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
            <p className="text-sm text-[var(--text-tertiary)]">
              {worker.queue_reason === 'scheduled' && worker.execute_at && (
                <>Scheduled to run {formatScheduledTime(worker.execute_at)}</>
              )}
              {worker.queue_reason === 'blocked' && worker.blocked_by && (
                <>Waiting for worker {worker.blocked_by}</>
              )}
              {worker.queue_reason === 'waiting' && (
                <>Waiting in queue</>
              )}
            </p>
          </div>
        )}

        {/* Report for completed/failed */}
        {(worker.status === 'complete' || worker.status === 'failed') && output && (
          <CollapsibleSection
            title="Report"
            icon={<FileText className="w-3.5 h-3.5" />}
            isCollapsed={sectionsCollapsed.report}
            onToggle={() => toggleSection('report')}
            badge={<span className="w-2 h-2 rounded-full bg-[var(--color-success)] ml-1" />}
          >
            <div className="prose prose-sm max-w-none p-3 bg-[var(--surface-muted)] rounded-md">
              <ReactMarkdown>{output}</ReactMarkdown>
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// Status icon component
function StatusIcon({ status }: { status: WorkerListItem['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin flex-shrink-0" />;
    case 'queued':
      return <Hourglass className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />;
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-[var(--color-error)] flex-shrink-0" />;
    default:
      return <Clock className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />;
  }
}

// Status text component
function StatusText({ status, queueReason }: { status: WorkerListItem['status']; queueReason?: string }) {
  if (status === 'queued') {
    return <span>{queueReason === 'scheduled' ? 'Scheduled' : queueReason === 'blocked' ? 'Blocked' : 'Queued'}</span>;
  }
  return <span className="capitalize">{status}</span>;
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon,
  isCollapsed,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-2"
      >
        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        <span className="uppercase tracking-wider">{title}</span>
        {badge}
      </button>
      {!isCollapsed && children}
    </div>
  );
}

export default ActivityWorkerDetail;
