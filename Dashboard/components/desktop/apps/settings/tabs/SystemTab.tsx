'use client';

import {
  Eye,
  Zap,
  Bell,
  Clock,
  Database,
  Loader2,
  AlertCircle,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Section } from '../shared/Section';
import { SettingRow } from '../shared/SettingRow';

interface SystemConfig {
  watcher: {
    modules: Record<string, boolean>;
  };
  executor: {
    poll_interval_sec: number;
    batch_size: number;
    check_interval_sec: number;
  };
  sms: {
    enabled: boolean;
    quiet_hours: { start: string; end: string } | null;
  };
  schema: {
    tables: { name: string; columns: { name: string; type: string; pk: boolean }[] }[];
    migrations: { name: string; applied: boolean }[];
  };
}

export function SystemTab({
  config,
  loading,
  error,
  onRefresh,
}: {
  config: SystemConfig | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8E8E93]">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">{error}</p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#DA7756] rounded-md hover:bg-[#C15F3C] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const modules = config?.watcher.modules ? Object.entries(config.watcher.modules) : [];

  return (
    <div className="p-5">
      <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-5">System Configuration</h3>

      {/* Watcher Modules */}
      <Section title="Background Watchers" icon={Eye}>
        {modules.map(([mod, enabled], idx) => (
          <SettingRow
            key={mod}
            label={mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            value={enabled ? 'Active' : 'Disabled'}
            valueColor={enabled ? 'success' : 'muted'}
            isFirst={idx === 0}
            isLast={idx === modules.length - 1}
          />
        ))}
      </Section>

      {/* Executor Settings */}
      <Section title="Worker Executor" icon={Zap}>
        <SettingRow label="Poll Interval" value={`${config?.executor.poll_interval_sec}s`} isFirst />
        <SettingRow label="Batch Size" value={config?.executor.batch_size} />
        <SettingRow label="Check Interval" value={`${config?.executor.check_interval_sec}s`} isLast />
      </Section>

      {/* SMS Settings */}
      <Section title="Notifications" icon={Bell}>
        <SettingRow
          label="SMS Notifications"
          value={config?.sms.enabled ? 'Enabled' : 'Disabled'}
          valueColor={config?.sms.enabled ? 'success' : 'muted'}
          isFirst
          isLast={!config?.sms.quiet_hours}
        />
        {config?.sms.quiet_hours && (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Clock className="w-4 h-4 text-[#8E8E93]" />
            <span className="text-[13px] text-[#1D1D1F] dark:text-[#E5E5E5]">
              Quiet Hours: <span className="text-[#DA7756] font-medium">{config.sms.quiet_hours.start} – {config.sms.quiet_hours.end}</span>
            </span>
          </div>
        )}
      </Section>

      {/* Database */}
      <Section title="Database Schema" icon={Database}>
        <div className="px-3 py-3">
          <p className="text-xs text-[#8E8E93] mb-3">
            {config?.schema.tables.length} tables • {config?.schema.migrations.length} migrations
          </p>
          <div className="flex flex-wrap gap-1.5">
            {config?.schema.tables.map((table) => (
              <span
                key={table.name}
                className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-[#1e1e1e] text-[#1D1D1F] dark:text-[#E5E5E5] border border-[#E5E5E5] dark:border-[#3a3a3a]"
              >
                {table.name}
              </span>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

export type { SystemConfig };
