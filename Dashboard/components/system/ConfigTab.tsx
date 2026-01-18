'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Zap,
  MessageSquare,
  Database,
  ChevronDown,
  ChevronRight,
  Loader2,
  XCircle,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { fetchSystemConfig } from '@/lib/api';
import { SystemConfigData } from '@/lib/types';

// Toggle indicator
function ToggleIndicator({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
      <Check className="w-3 h-3" />
      On
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      <X className="w-3 h-3" />
      Off
    </span>
  );
}

// Config row
function ConfigRow({ label, value }: { label: string; value: string | number | boolean }) {
  const displayValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-[var(--surface-muted)]/30 rounded-md transition-colors">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="text-sm text-[var(--text-muted)] font-mono">{displayValue}</span>
    </div>
  );
}

// Accordion section
function AccordionSection({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-muted)]/30 transition-colors"
      >
        <span className="text-[var(--text-muted)]">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="text-[var(--color-primary)]">{icon}</span>
        <span className="text-sm font-medium text-[var(--text-primary)] flex-1 text-left">{title}</span>
        {badge}
      </button>
      {open && (
        <div className="border-t border-[var(--border-subtle)] p-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Schema table
function SchemaTable({ table }: { table: { name: string; columns: { name: string; type: string; pk?: boolean }[] } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 bg-[var(--surface-muted)]/30 hover:bg-[var(--surface-muted)]/50 transition-colors"
      >
        <span className="text-[var(--text-muted)]">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="text-sm font-mono text-[var(--text-primary)]">{table.name}</span>
        <span className="text-xs text-[var(--text-muted)] ml-auto">({table.columns.length} cols)</span>
      </button>
      {expanded && (
        <div className="p-2 space-y-0.5 bg-[var(--surface-base)]">
          {table.columns.map((col) => (
            <div key={col.name} className="flex items-center gap-2 px-2 py-1 text-xs font-mono rounded hover:bg-[var(--surface-muted)]/20">
              {col.pk && (
                <span className="badge badge-primary text-[10px] px-1.5 py-0">PK</span>
              )}
              <span className={col.pk ? 'text-[var(--color-primary)]' : 'text-[var(--text-secondary)]'}>
                {col.name}
              </span>
              <span className="text-[var(--text-muted)] ml-auto">{col.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfigTab() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemConfigData | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchSystemConfig();
      setConfig(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load config:', err);
      setError('Failed to load system configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadConfig();
  }, [mounted, loadConfig]);

  if (!mounted || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-[var(--color-error)]" />
          <p className="text-[var(--text-secondary)] mb-4">{error}</p>
          <button onClick={loadConfig} className="btn btn-ghost flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const data = config!;
  const enabledModules = Object.values(data.watcher.modules).filter(Boolean).length;
  const totalModules = Object.keys(data.watcher.modules).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[var(--surface-sunken)]">
        <div className="space-y-4 max-w-3xl">
          {/* Watcher Modules */}
          <AccordionSection
            title="Watcher Modules"
            icon={<Eye className="w-4 h-4" />}
            badge={
              <span className="text-xs text-[var(--text-muted)]">
                {enabledModules}/{totalModules} active
              </span>
            }
          >
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(data.watcher.modules).map(([name, enabled]) => (
                <div
                  key={name}
                  className={`
                    flex items-center justify-between px-3 py-2 rounded-lg border transition-colors
                    ${enabled
                      ? 'border-[var(--color-success)]/30 bg-[var(--color-success-dim)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)]/20'
                    }
                  `}
                >
                  <span className="text-sm text-[var(--text-secondary)]">{name}</span>
                  <ToggleIndicator enabled={enabled} />
                </div>
              ))}
            </div>
          </AccordionSection>

          {/* Executor Settings */}
          <AccordionSection
            title="Executor Settings"
            icon={<Zap className="w-4 h-4" />}
          >
            <div className="space-y-1">
              <ConfigRow label="Poll Interval" value={`${data.executor.poll_interval_sec}s`} />
              <ConfigRow label="Batch Size" value={data.executor.batch_size} />
              <ConfigRow label="Check Interval" value={`${data.executor.check_interval_sec}s`} />
            </div>
          </AccordionSection>

          {/* SMS Settings */}
          <AccordionSection
            title="SMS Notifications"
            icon={<MessageSquare className="w-4 h-4" />}
            badge={
              data.sms.enabled ? (
                <span className="badge badge-success">Enabled</span>
              ) : (
                <span className="badge badge-default">Disabled</span>
              )
            }
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between py-2 px-3 rounded-md">
                <span className="text-sm text-[var(--text-secondary)]">Enabled</span>
                <ToggleIndicator enabled={data.sms.enabled} />
              </div>
              {data.sms.quiet_hours && (
                <ConfigRow
                  label="Quiet Hours"
                  value={`${data.sms.quiet_hours.start} - ${data.sms.quiet_hours.end}`}
                />
              )}
            </div>
          </AccordionSection>

          {/* Database Schema */}
          <AccordionSection
            title="Database Schema"
            icon={<Database className="w-4 h-4" />}
            defaultOpen={false}
            badge={
              <span className="text-xs text-[var(--text-muted)]">
                {data.schema.tables.length} tables
              </span>
            }
          >
            <div className="space-y-2">
              {data.schema.tables.map((table) => (
                <SchemaTable key={table.name} table={table} />
              ))}
            </div>

            {data.schema.migrations && data.schema.migrations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">
                  Migrations ({data.schema.migrations.length})
                </p>
                <div className="space-y-1">
                  {data.schema.migrations.map((m) => (
                    <div key={m.name} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-[var(--surface-muted)]/20">
                      {m.applied ? (
                        <Check className="w-3 h-3 text-[var(--color-success)]" />
                      ) : (
                        <X className="w-3 h-3 text-[var(--text-muted)]" />
                      )}
                      <span className="font-mono text-[var(--text-secondary)]">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AccordionSection>
        </div>
      </div>
    </div>
  );
}

export default ConfigTab;
