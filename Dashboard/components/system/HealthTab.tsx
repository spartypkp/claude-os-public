'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Database,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plug,
  Eye,
} from 'lucide-react';
import { fetchSystemHealthData } from '@/lib/api';
import { SystemHealthData, SystemStatus } from '@/lib/types';

// Status indicator dot
function StatusDot({ status }: { status: SystemStatus }) {
  const colors: Record<SystemStatus, string> = {
    ok: 'status-dot-success',
    warning: 'status-dot-warning',
    error: 'status-dot-error',
    offline: 'status-dot-muted',
  };

  return <span className={`status-dot ${colors[status]}`} />;
}

// Status badge
function StatusBadge({ status }: { status: SystemStatus }) {
  const badges: Record<SystemStatus, string> = {
    ok: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    offline: 'badge-default',
  };

  const labels: Record<SystemStatus, string> = {
    ok: 'OK',
    warning: 'WARN',
    error: 'ERR',
    offline: 'OFF',
  };

  return (
    <span className={`badge ${badges[status]}`}>
      {labels[status]}
    </span>
  );
}

// Status row
function StatusRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: SystemStatus;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-[var(--surface-muted)]/30 transition-colors">
      <StatusDot status={status} />
      <span className="text-sm text-[var(--text-secondary)] flex-1">{label}</span>
      {detail && (
        <span className="text-xs text-[var(--text-muted)] font-mono truncate max-w-[150px]">
          {detail}
        </span>
      )}
      <StatusBadge status={status} />
    </div>
  );
}

// Warning item
function WarningItem({ message, type }: { message: string; type: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 bg-[var(--color-warning-dim)] border border-[var(--color-warning)]/20 rounded-lg">
      <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[var(--text-primary)]">{message}</span>
        <span className="ml-2 text-xs text-[var(--text-muted)]">({type})</span>
      </div>
    </div>
  );
}

export function HealthTab() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchSystemHealthData();
      setHealth(data);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to load health:', err);
      setError('Failed to load system health');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!mounted) return;
    loadHealth();
  }, [mounted, loadHealth]);

  // Jan 2026: Reduced polling from 5s to 30s
  // Health checks are inherently poll-based (checking if services are alive)
  // Could add SSE event for service status changes in the future
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [mounted, loadHealth]);

  if (!mounted || (loading && !health)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-[var(--color-error)]" />
          <p className="text-[var(--text-secondary)] mb-4">{error}</p>
          <button onClick={loadHealth} className="btn btn-ghost flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const data = health!;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[var(--surface-sunken)]">
        {/* Status Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Backend Status */}
          <div className="card">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--color-primary)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Backend Services</span>
            </div>
            <div className="p-2">
              <StatusRow
                label="API Server"
                status={data.backend.api}
                detail="localhost:5001"
              />
              <StatusRow
                label="Watcher"
                status={data.backend.watcher}
                detail={data.backend.watcher_detail}
              />
              <StatusRow
                label="Executor"
                status={data.backend.executor}
                detail={data.backend.executor_detail}
              />
              {data.backend.mission_scheduler && (
                <StatusRow
                  label="Mission Scheduler"
                  status={data.backend.mission_scheduler}
                  detail={data.backend.mission_scheduler_detail}
                />
              )}
            </div>
          </div>

          {/* Database Status */}
          <div className="card">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <Database className="w-4 h-4 text-[var(--color-info)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Database</span>
            </div>
            <div className="p-2">
              <StatusRow
                label="SQLite Connection"
                status={data.database.status}
                detail={data.database.size}
              />
              <StatusRow
                label="WAL Mode"
                status={data.database.wal_status}
                detail={data.database.wal_size}
              />
            </div>
          </div>

          {/* Integrations */}
          <div className="card">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <Plug className="w-4 h-4 text-[var(--color-cyan)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Integrations</span>
            </div>
            <div className="p-2">
              <StatusRow
                label="Apple Calendar"
                status={data.integrations.apple_calendar.status}
                detail={data.integrations.apple_calendar.detail}
              />
              <StatusRow
                label="Life MCP"
                status={data.integrations.life_mcp.status}
                detail={data.integrations.life_mcp.detail}
              />
              <StatusRow
                label="Apple MCP"
                status={data.integrations.apple_mcp.status}
                detail={data.integrations.apple_mcp.detail}
              />
              <StatusRow
                label="Mail.app Access"
                status={data.integrations.mail_access.status}
                detail={data.integrations.mail_access.detail}
              />
            </div>
          </div>

          {/* Watcher Modules */}
          <div className="card">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--color-success)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Watcher Modules</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {data.watcher_modules.filter(m => m.status === 'ok').length}/{data.watcher_modules.length} active
              </span>
            </div>
            <div className="p-2 max-h-[280px] overflow-y-auto">
              {data.watcher_modules.map((module) => (
                <StatusRow
                  key={module.name}
                  label={module.name}
                  status={module.status}
                  detail={module.detail}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Warnings Section */}
        {data.warnings && data.warnings.length > 0 && (
          <div className="card mb-6">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Active Warnings
              </span>
              <span className="badge badge-warning ml-2">{data.warnings.length}</span>
            </div>
            <div className="p-4 space-y-2">
              {data.warnings.map((warning, idx) => (
                <WarningItem key={idx} message={warning.message} type={warning.type} />
              ))}
            </div>
          </div>
        )}

        {/* All Clear Message */}
        {(!data.warnings || data.warnings.length === 0) && (
          <div className="flex items-center gap-3 py-4 px-4 bg-[var(--color-success-dim)] border border-[var(--color-success)]/20 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
            <span className="text-sm text-[var(--text-primary)]">All systems operational</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default HealthTab;
