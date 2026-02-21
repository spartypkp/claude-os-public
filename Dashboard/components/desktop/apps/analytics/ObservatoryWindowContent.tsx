'use client';

import { useState, useMemo } from 'react';
import {
  BarChart3,
  Users,
  Lightbulb,
  RefreshCw,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  useAnalyticsPatternsQuery,
  useAnalyticsOverviewQuery,
  useAnalyticsSpecialistsQuery,
  useAnalyticsFilesQuery,
  useAnalyticsInsightsQuery,
  type WorkRhythmEntry,
} from '@/hooks/queries/useAnalyticsQuery';

// ==========================================
// Design Tokens
// ==========================================

const ACCENT = '#8b5cf6'; // var(--color-info) — the one purple

type TabId = 'overview' | 'specialists' | 'insights';

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'specialists', label: 'Specialists', icon: Users },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
];

const ROLE_COLORS: Record<string, string> = {
  chief: '#DA7756',
  builder: '#6366f1',
  researcher: '#22c55e',
  writer: '#eab308',
  curator: '#ec4899',
  idea: '#a855f7',
  project: '#06b6d4',
  trainer: '#f97316',
  money: '#10b981',
  'job-search': '#3b82f6',
  unknown: '#6b7280',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TOOLTIP_STYLE = {
  background: 'var(--surface-overlay)',
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '11px',
  padding: '6px 10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

// ==========================================
// Shared Components
// ==========================================

function KPICard({
  label,
  value,
  icon: Icon,
  trend,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  trend?: { value: number; label?: string };
  accent?: string;
}) {
  const trendColor = trend
    ? trend.value > 0 ? '#22c55e' : trend.value < 0 ? '#ef4444' : 'var(--text-muted)'
    : undefined;
  const TrendIcon = trend
    ? trend.value > 0 ? ArrowUpRight : trend.value < 0 ? ArrowDownRight : Minus
    : null;

  return (
    <div
      className="rounded-lg px-3 py-2.5 flex flex-col gap-1"
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3" style={{ color: accent || 'var(--text-muted)' }} />
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <div className="font-mono text-xl font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      {trend && TrendIcon && (
        <div className="flex items-center gap-1">
          <TrendIcon className="w-3 h-3" style={{ color: trendColor }} />
          <span className="text-[10px] font-mono" style={{ color: trendColor }}>
            {trend.value > 0 ? '+' : ''}{trend.value}%
          </span>
          {trend.label && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg p-3 ${className}`}
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }}
    >
      <h3
        className="text-[11px] font-medium uppercase tracking-wider mb-2.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
      <BarChart3 className="w-8 h-8 mb-2 opacity-20" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

function CollectingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-muted)' }}>
      <Loader2 className="w-6 h-6 mb-2 opacity-30 animate-spin" />
      <p className="text-xs">{message}</p>
      <p className="text-[10px] mt-1 opacity-50">Data accumulates as Claudes work</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
    </div>
  );
}

function truncatePath(path: string, segments = 2): string {
  const parts = path.split('/');
  return parts.length > segments ? '.../' + parts.slice(-segments).join('/') : path;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ==========================================
// Heatmap
// ==========================================

function WorkRhythmHeatmap({ data }: { data: WorkRhythmEntry[] }) {
  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);

  const getColor = (count: number) => {
    if (count === 0) return 'var(--surface-base)';
    const intensity = count / maxCount;
    if (intensity < 0.25) return 'rgba(139, 92, 246, 0.2)';
    if (intensity < 0.5) return 'rgba(139, 92, 246, 0.4)';
    if (intensity < 0.75) return 'rgba(139, 92, 246, 0.6)';
    return 'rgba(139, 92, 246, 0.85)';
  };

  const lookup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of data) map[`${d.day}-${d.hour}`] = d.count;
    return map;
  }, [data]);

  const hours = Array.from({ length: 18 }, (_, i) => i + 6);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[540px]">
        <div className="flex ml-8 mb-1">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {h === 6 ? '6a' : h === 12 ? '12p' : h === 18 ? '6p' : h % 3 === 0 ? `${h > 12 ? h - 12 : h}${h >= 12 ? 'p' : 'a'}` : ''}
            </div>
          ))}
        </div>
        {DAY_LABELS.map((label, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-[2px] mb-[2px]">
            <span className="w-7 text-right text-[9px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <div className="flex flex-1 gap-[2px]">
              {hours.map(h => {
                const count = lookup[`${dayIdx}-${h}`] || 0;
                return (
                  <div
                    key={h}
                    className="flex-1 rounded-[2px] transition-colors"
                    style={{
                      background: getColor(count),
                      aspectRatio: '1',
                      minHeight: '12px',
                      border: count > 0 ? 'none' : '1px solid var(--border-subtle)',
                    }}
                    title={`${label} ${h}:00 — ${count} session${count !== 1 ? 's' : ''}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-1 mt-1.5 ml-8">
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{
              background: intensity === 0 ? 'var(--surface-base)' : `rgba(139, 92, 246, ${intensity * 0.85})`,
              border: intensity === 0 ? '1px solid var(--border-subtle)' : 'none',
            }} />
          ))}
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>More</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Tab: Overview
// ==========================================

function OverviewTab() {
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverviewQuery();
  const { data: patterns, isLoading: patternsLoading } = useAnalyticsPatternsQuery();
  const { data: files, isLoading: filesLoading } = useAnalyticsFilesQuery();

  // All hooks must be called before any conditional returns
  const topFiles = useMemo(() => {
    if (!files) return [];
    const counts: Record<string, number> = {};
    for (const f of files.top_read) counts[f.file] = (counts[f.file] || 0) + f.count;
    for (const f of files.top_written) counts[f.file] = (counts[f.file] || 0) + f.count;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([file, count]) => ({ file, count }));
  }, [files]);

  if (overviewLoading || patternsLoading || filesLoading) return <LoadingState />;
  if (!overview || !patterns) return <EmptyState message="No overview data available" />;

  const totalSessions = Object.values(patterns.session_stats).reduce((sum, s) => sum + s.count, 0);
  const todayPriorities = overview.priorities_today;
  const totalPriorities = Object.values(todayPriorities).reduce((sum, p) => sum + p.total, 0);
  const completedPriorities = Object.values(todayPriorities).reduce((sum, p) => sum + p.completed, 0);

  const weeklyChange = patterns.weekly_comparison.last_week.sessions > 0
    ? Math.round(((patterns.weekly_comparison.this_week.sessions - patterns.weekly_comparison.last_week.sessions) / patterns.weekly_comparison.last_week.sessions) * 100)
    : null;

  const roleData = Object.entries(patterns.session_stats)
    .map(([role, stats]) => ({
      role: capitalize(role),
      sessions: stats.count,
      fill: ROLE_COLORS[role] || ROLE_COLORS.unknown,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return (
    <div className="space-y-3">
      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-2">
        <KPICard
          label="Sessions (7d)" value={totalSessions} icon={BarChart3} accent={ACCENT}
          trend={weeklyChange !== null ? { value: weeklyChange, label: 'vs last week' } : undefined}
        />
        <KPICard label="Claude Time" value={`${overview.claude_time_today}h`} icon={Clock} accent="#22c55e" />
        <KPICard
          label="Priorities" value={`${completedPriorities}/${totalPriorities}`}
          icon={CheckCircle2} accent="#eab308"
        />
        <KPICard
          label="Drift Days"
          value={overview.drift_days !== null ? overview.drift_days : '—'}
          icon={AlertTriangle}
          accent={overview.drift_days !== null && overview.drift_days > 2 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* Heatmap — no box, let it breathe */}
      <div>
        <h3 className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Work Rhythm
        </h3>
        <WorkRhythmHeatmap data={patterns.work_rhythm} />
      </div>

      {/* Role Breakdown + Completion Rates */}
      <div className="grid grid-cols-3 gap-2">
        <Section title="Sessions by Role" className="col-span-2">
          {roleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(roleData.length * 28, 100)}>
              <BarChart data={roleData} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="role" type="category" width={72}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | undefined) => [`${value ?? 0}`, 'Sessions']} />
                <Bar dataKey="sessions" radius={[0, 3, 3, 0]} barSize={16}>
                  {roleData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No session data" />}
        </Section>

        <Section title="Completion (7d)">
          <div className="space-y-3 mt-1">
            {(['critical', 'medium', 'low'] as const).map(level => {
              const rate = overview.completion_rates[level] || 0;
              const colors = { critical: '#ef4444', medium: '#eab308', low: '#6b7280' };
              return (
                <div key={level}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] capitalize" style={{ color: 'var(--text-secondary)' }}>{level}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{rate}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(rate, 2)}%`, background: colors[level], opacity: 0.85 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* Top Files — compact text list */}
      {topFiles.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Most Active Files ({files?.days ?? 30}d)
          </h3>
          <div className="space-y-0.5">
            {topFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] font-mono truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {truncatePath(f.file, 3)}
                </span>
                <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Tab: Specialists
// ==========================================

function SpecialistsTab() {
  const { data: specialists, isLoading, isError } = useAnalyticsSpecialistsQuery();

  if (isLoading) return <LoadingState />;
  if (isError || !specialists) return <EmptyState message="Specialist analytics not available yet." />;

  const { summary, by_role } = specialists;
  if (summary.total_tasks === 0) return <EmptyState message="No specialist tasks recorded yet." />;

  const roleEntries = Object.entries(by_role)
    .map(([role, data]) => ({
      role: capitalize(role),
      rawRole: role,
      ...data,
      fill: ROLE_COLORS[role] || ROLE_COLORS.unknown,
    }))
    .sort((a, b) => b.tasks - a.tasks);

  return (
    <div className="space-y-3">
      {/* KPI Strip — these are meaningful here */}
      <div className="grid grid-cols-4 gap-2">
        <KPICard label="Total Tasks" value={summary.total_tasks} icon={Zap} accent={ACCENT} />
        <KPICard
          label="Pass Rate"
          value={summary.pass_rate !== null ? `${Math.round(summary.pass_rate * 100)}%` : '—'}
          icon={CheckCircle2}
          accent={summary.pass_rate !== null && summary.pass_rate >= 0.8 ? '#22c55e' : '#eab308'}
        />
        <KPICard label="Avg Iterations"
          value={summary.avg_iterations !== null ? summary.avg_iterations : '—'}
          icon={RefreshCw} accent={ACCENT} />
        <KPICard label="Avg Duration"
          value={summary.avg_duration_min !== null ? `${summary.avg_duration_min}m` : '—'}
          icon={Clock} accent="#06b6d4" />
      </div>

      {/* Role Chart + Detail Table */}
      <div className="grid grid-cols-3 gap-2">
        <Section title="Tasks by Role" className="col-span-1">
          {roleEntries.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(roleEntries.length * 28, 80)}>
              <BarChart data={roleEntries} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="role" type="category" width={68}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | undefined) => [`${value ?? 0}`, 'Tasks']} />
                <Bar dataKey="tasks" radius={[0, 3, 3, 0]} barSize={16}>
                  {roleEntries.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No role data" />}
        </Section>

        <Section title="Role Detail" className="col-span-2">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="text-left pb-1.5 text-[10px] font-medium uppercase tracking-wider">Role</th>
                <th className="text-right pb-1.5 text-[10px] font-medium uppercase tracking-wider">Tasks</th>
                <th className="text-right pb-1.5 text-[10px] font-medium uppercase tracking-wider">Pass %</th>
                <th className="text-right pb-1.5 text-[10px] font-medium uppercase tracking-wider">Iters</th>
                <th className="text-right pb-1.5 text-[10px] font-medium uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {roleEntries.map(r => (
                <tr key={r.role} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: r.fill }} />
                      {r.role}
                    </div>
                  </td>
                  <td className="text-right py-1.5 font-mono" style={{ color: 'var(--text-secondary)' }}>{r.tasks}</td>
                  <td className="text-right py-1.5 font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {r.pass_rate !== null ? `${Math.round(r.pass_rate * 100)}%` : '—'}
                  </td>
                  <td className="text-right py-1.5 font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {r.avg_impl_iterations ?? '—'}
                  </td>
                  <td className="text-right py-1.5 font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {r.avg_duration_min ? `${r.avg_duration_min}m` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}

// ==========================================
// Tab: Insights
// ==========================================

const INSIGHT_CATEGORY_META: Record<string, { icon: typeof Zap; color: string; label: string }> = {
  specialists: { icon: Users, color: ACCENT, label: 'Specialists' },
  files: { icon: BarChart3, color: '#22c55e', label: 'Files' },
  tools: { icon: Zap, color: ACCENT, label: 'Tools' },
  system: { icon: AlertTriangle, color: '#DA7756', label: 'System' },
};

function InsightsTab() {
  const { data: insights, isLoading } = useAnalyticsInsightsQuery();

  // All hooks must be called before any conditional returns
  const grouped = useMemo(() => {
    if (!insights) return [];
    const groups: Record<string, typeof insights.insights> = {};
    for (const ins of insights.insights) {
      if (!groups[ins.category]) groups[ins.category] = [];
      groups[ins.category].push(ins);
    }
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    }
    return Object.entries(groups).sort(([, a], [, b]) => b.length - a.length);
  }, [insights]);

  if (isLoading) return <LoadingState />;
  if (!insights || insights.insights.length === 0) {
    return <CollectingState message="Generating insights..." />;
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
        Auto-generated from the last {insights.days} days of data
      </p>

      {grouped.map(([category, items]) => {
        const meta = INSIGHT_CATEGORY_META[category];
        const CatIcon = meta?.icon ?? Zap;
        const catColor = meta?.color ?? '#6b7280';

        return (
          <div key={category}>
            <div className="flex items-center gap-1.5 mb-2">
              <CatIcon className="w-3 h-3" style={{ color: catColor }} />
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: catColor }}>
                {meta?.label ?? capitalize(category)}
              </span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                ({items.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {items.map((insight, i) => {
                const dotIdx = insight.text.indexOf('. ');
                const headline = dotIdx > 0 ? insight.text.slice(0, dotIdx + 1) : insight.text;
                const detail = dotIdx > 0 ? insight.text.slice(dotIdx + 2) : '';

                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2"
                    style={{
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border-subtle)',
                      borderLeft: `2px solid ${catColor}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                        {headline}
                      </p>
                      {detail && (
                        <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                          {detail}
                        </p>
                      )}
                    </div>
                    {insight.value > 0 && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: `${catColor}15`, color: catColor }}
                      >
                        {insight.value}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// Main Component
// ==========================================

export function ObservatoryWindowContent() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics });
  };

  return (
    <div data-testid="analytics-content" className="flex h-full" style={{ background: 'var(--surface-base)' }}>
      {/* Sidebar */}
      <div className="w-36 shrink-0 flex flex-col py-2.5 px-1.5"
        style={{ borderRight: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-1.5 px-2 mb-3">
          <BarChart3 className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Observatory</span>
        </div>

        <nav className="space-y-0.5 flex-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                style={{
                  background: isActive ? 'var(--surface-accent)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-3 h-3" style={isActive ? { color: ACCENT } : undefined} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <button onClick={handleRefresh}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors mt-1"
          style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'specialists' && <SpecialistsTab />}
        {activeTab === 'insights' && <InsightsTab />}
      </div>
    </div>
  );
}
