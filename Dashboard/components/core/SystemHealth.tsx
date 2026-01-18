'use client';

import { useEffect, useState, memo } from 'react';
import { fetchSystemHealth } from '@/lib/api';
import { SystemHealth as SystemHealthType } from '@/lib/types';
import { Activity } from 'lucide-react';

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return '';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface ServiceStatusProps {
  name: string;
  status: string;
  uptime?: number;
}

function ServiceStatus({ name, status, uptime }: ServiceStatusProps) {
  const isRunning = status === 'running';
  const uptimeStr = formatUptime(uptime);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`status-dot ${isRunning ? 'status-dot-success' : 'status-dot-error'}`}
        aria-hidden="true"
      />
      <span className="text-[var(--text-secondary)] min-w-[60px]">{name}</span>
      {uptimeStr && (
        <span className="text-[var(--text-disabled)] tabular-nums">{uptimeStr}</span>
      )}
    </div>
  );
}

function SystemHealth() {
  const [health, setHealth] = useState<SystemHealthType | null>(null);

  useEffect(() => {
    fetchSystemHealth().then(setHealth).catch(console.error);

    const interval = setInterval(() => {
      fetchSystemHealth().then(setHealth).catch(console.error);
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  const allRunning =
    health.watcher?.status === 'running' &&
    health.executor?.status === 'running' &&
    health.dashboard?.status === 'running';

  return (
    <div
      className="fixed bottom-4 left-4 card px-3 py-2.5 shadow-lg animate-fade-in"
      role="status"
      aria-label="System health status"
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border-subtle)]">
        <Activity className={`w-3.5 h-3.5 ${allRunning ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`} />
        <span className="text-xs font-medium text-[var(--text-secondary)]">System</span>
      </div>
      <div className="space-y-1.5">
        <ServiceStatus
          name="Watcher"
          status={health.watcher?.status || 'unknown'}
          uptime={health.watcher?.uptime_seconds}
        />
        <ServiceStatus
          name="Executor"
          status={health.executor?.status || 'unknown'}
          uptime={health.executor?.uptime_seconds}
        />
        <ServiceStatus
          name="Dashboard"
          status={health.dashboard?.status || 'unknown'}
          uptime={health.dashboard?.uptime_seconds}
        />
      </div>
    </div>
  );
}

export default memo(SystemHealth);
