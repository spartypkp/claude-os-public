'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  Clock,
  Hash,
  Activity,
  Monitor,
  User,
  FolderCode,
  Calendar,
  MessageSquare,
  Database,
  GitBranch,
  Users,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex gap-4 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <span className="w-28 shrink-0 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className={`flex-1 text-[13px] text-[var(--text-primary)] break-all ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}

// Format duration between two timestamps
function formatDuration(startTs: string, endTs?: string): string {
  const start = new Date(startTs);
  const end = endTs ? new Date(endTs) : new Date();
  const diff = end.getTime() - start.getTime();

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Format timestamp
function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

// Get role color
function getRoleColor(role: string): string {
  switch (role?.toLowerCase()) {
    case 'chief':
      return 'bg-[#DA7756]';
    case 'builder':
    case 'system':
      return 'bg-cyan-500';
    case 'idea':
      return 'bg-yellow-500';
    case 'project':
      return 'bg-purple-500';
    case 'deep-work':
    case 'focus':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
}

interface SessionData {
  session_id: string;
  role?: string;
  mode?: string;
  session_type?: string;
  session_subtype?: string;
  started_at: string;
  last_seen_at: string;
  ended_at?: string;
  end_reason?: string;
  description?: string;
  cwd?: string;
  tmux_pane?: string;
  mission_execution_id?: string;
  conversation_id?: string;
  parent_session_id?: string;
}

interface SessionInfoPanelProps {
  sessionId: string;
  onClose: () => void;
}

/**
 * Session info panel - shows detailed metadata about a Claude session.
 * Similar to Finder's Get Info panel but for sessions.
 */
export function SessionInfoPanel({
  sessionId,
  onClose,
}: SessionInfoPanelProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session details
  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/api/system/sessions/${sessionId}`);
        const data = await response.json();

        if (!cancelled) {
          if (data.success) {
            setSession(data.session);
            setWorkers(data.workers || []);
          } else {
            setError(data.error || 'Failed to fetch session');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch session');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSession();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const roleColor = session ? getRoleColor(session.role || 'chief') : 'bg-gray-500';
  const roleName = session?.role ? session.role.charAt(0).toUpperCase() + session.role.slice(1) : 'Session';
  const isActive = session && !session.ended_at;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] z-[9999] animate-scale-in">
        <div className="bg-[var(--surface-raised)] backdrop-blur-xl rounded-xl border border-[var(--border-default)] shadow-2xl overflow-hidden">
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Session Info
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-[var(--color-error)] text-sm">{error}</p>
              </div>
            ) : session ? (
              <>
                {/* Icon and name header */}
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[var(--border-default)]">
                  <div className={`w-14 h-14 rounded-xl ${roleColor} flex items-center justify-center`}>
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      {roleName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {isActive ? 'Active' : 'Ended'}
                      </span>
                      {session.mode && (
                        <span className="px-2 py-0.5 bg-[var(--surface-accent)] text-[var(--text-secondary)] rounded text-[10px] font-medium capitalize">
                          {session.mode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info rows */}
                <div className="space-y-0 max-h-[400px] overflow-y-auto">
                  {/* Session ID */}
                  <InfoRow
                    label="Session ID"
                    value={
                      <span className="flex items-center gap-2">
                        <Hash className="w-3 h-3 text-[var(--text-muted)]" />
                        {session.session_id}
                      </span>
                    }
                    mono
                  />

                  {/* Conversation ID */}
                  {session.conversation_id && (
                    <InfoRow
                      label="Conversation"
                      value={
                        <span className="flex items-center gap-2">
                          <MessageSquare className="w-3 h-3 text-[var(--text-muted)]" />
                          {session.conversation_id}
                        </span>
                      }
                      mono
                    />
                  )}

                  {/* Parent Session */}
                  {session.parent_session_id && (
                    <InfoRow
                      label="Parent"
                      value={
                        <span className="flex items-center gap-2">
                          <GitBranch className="w-3 h-3 text-[var(--text-muted)]" />
                          {session.parent_session_id}
                        </span>
                      }
                      mono
                    />
                  )}

                  {/* Role */}
                  <InfoRow
                    label="Role"
                    value={
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${roleColor}`} />
                        {roleName}
                      </span>
                    }
                  />

                  {/* Session Type */}
                  {session.session_type && (
                    <InfoRow
                      label="Type"
                      value={
                        <span className="capitalize">
                          {session.session_type}
                          {session.session_subtype && ` (${session.session_subtype})`}
                        </span>
                      }
                    />
                  )}

                  {/* Started At */}
                  <InfoRow
                    label="Started"
                    value={
                      <span className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                        {formatTimestamp(session.started_at)}
                      </span>
                    }
                  />

                  {/* Last Seen */}
                  {session.last_seen_at && (
                    <InfoRow
                      label="Last Active"
                      value={
                        <span className="flex items-center gap-2">
                          <Activity className="w-3 h-3 text-[var(--text-muted)]" />
                          {formatTimestamp(session.last_seen_at)}
                        </span>
                      }
                    />
                  )}

                  {/* Ended At */}
                  {session.ended_at && (
                    <InfoRow
                      label="Ended"
                      value={
                        <span className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                          {formatTimestamp(session.ended_at)}
                          {session.end_reason && (
                            <span className="text-[var(--text-muted)] text-[11px]">
                              ({session.end_reason})
                            </span>
                          )}
                        </span>
                      }
                    />
                  )}

                  {/* Duration */}
                  <InfoRow
                    label="Duration"
                    value={formatDuration(session.started_at, session.ended_at)}
                  />

                  {/* Working Directory */}
                  {session.cwd && (
                    <InfoRow
                      label="Directory"
                      value={
                        <span className="flex items-center gap-2">
                          <FolderCode className="w-3 h-3 text-[var(--text-muted)]" />
                          {session.cwd}
                        </span>
                      }
                      mono
                    />
                  )}

                  {/* Tmux Pane */}
                  {session.tmux_pane && (
                    <InfoRow
                      label="Tmux Pane"
                      value={
                        <span className="flex items-center gap-2">
                          <Monitor className="w-3 h-3 text-[var(--text-muted)]" />
                          {session.tmux_pane}
                        </span>
                      }
                      mono
                    />
                  )}

                  {/* Mission */}
                  {session.mission_execution_id && (
                    <InfoRow
                      label="Mission"
                      value={session.mission_execution_id}
                      mono
                    />
                  )}

                  {/* Description */}
                  {session.description && (
                    <InfoRow
                      label="Description"
                      value={session.description}
                    />
                  )}

                  {/* Workers */}
                  {workers.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Workers ({workers.length})
                      </p>
                      <div className="space-y-1">
                        {workers.slice(0, 5).map((worker) => (
                          <div
                            key={worker.id}
                            className="flex items-center justify-between py-1.5 px-2 bg-[var(--surface-sunken)] rounded text-[11px]"
                          >
                            <span className="text-[var(--text-primary)] truncate max-w-[200px]">
                              {worker.title || worker.type}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              worker.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                              worker.status?.includes('complete') ? 'bg-green-500/20 text-green-400' :
                              worker.status?.includes('failed') ? 'bg-red-500/20 text-red-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {worker.status}
                            </span>
                          </div>
                        ))}
                        {workers.length > 5 && (
                          <p className="text-[10px] text-[var(--text-muted)] text-center py-1">
                            +{workers.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Raw Data */}
                  <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      Raw Timestamps
                    </p>
                    <div className="bg-[var(--surface-sunken)] rounded-lg p-3 font-mono text-[11px] text-[var(--text-secondary)] space-y-1">
                      <div className="truncate">started_at: {session.started_at}</div>
                      <div className="truncate">last_seen_at: {session.last_seen_at}</div>
                      {session.ended_at && (
                        <div className="truncate">ended_at: {session.ended_at}</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default SessionInfoPanel;
