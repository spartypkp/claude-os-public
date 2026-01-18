'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Target,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  Users,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { fetchMetricsOverview, fetchMetricsPatterns, fetchSystemMetrics } from '@/lib/api';
import { MetricsOverviewData, MetricsPatternsData, SystemMetricsData } from '@/lib/types';

// ==================== SHARED COMPONENTS ====================

function StatCard({
  label,
  value,
  subtext,
  icon,
  status,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
}) {
  const statusColors = {
    good: 'text-[var(--color-success)]',
    warning: 'text-[var(--color-warning)]',
    bad: 'text-[var(--color-error)]',
    neutral: 'text-[var(--text-primary)]',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-2xl font-semibold mt-1 ${statusColors[status || 'neutral']}`}>
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-[var(--text-muted)] mt-1">{subtext}</p>
          )}
        </div>
        <div className="text-[var(--text-tertiary)] ml-3">{icon}</div>
      </div>
    </div>
  );
}

function PriorityBar({
  level,
  completed,
  total,
}: {
  level: string;
  completed: number;
  total: number;
}) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const levelColors: Record<string, string> = {
    critical: 'var(--color-error)',
    medium: 'var(--color-warning)',
    low: 'var(--color-info)',
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs text-[var(--text-secondary)] w-16 capitalize font-medium">
        {level}
      </span>
      <div className="flex-1 h-4 bg-[var(--surface-muted)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: levelColors[level] || 'var(--color-primary)',
          }}
        />
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums w-12 text-right">
        {completed}/{total}
      </span>
      <span className="text-xs text-[var(--text-tertiary)] tabular-nums w-12 text-right">
        {percentage.toFixed(0)}%
      </span>
    </div>
  );
}

function FailureItem({
  id,
  type,
  failedAt,
  reason,
}: {
  id: string;
  type: string;
  failedAt: string;
  reason?: string;
}) {
  const shortId = id.slice(0, 8);
  const date = new Date(failedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const timeAgo = diffMins < 60 ? `${diffMins}m ago` : `${diffHours}h ago`;

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 bg-[var(--color-error-dim)] border border-[var(--color-error)]/20 rounded-lg">
      <XCircle className="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono text-[var(--text-secondary)]">{shortId}</span>
          <span className="badge badge-default">{type}</span>
          <span className="text-xs text-[var(--text-muted)]">{timeAgo}</span>
        </div>
        {reason && (
          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{reason}</p>
        )}
      </div>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================

function OverviewTab({
  overview,
  systemMetrics,
}: {
  overview: MetricsOverviewData;
  systemMetrics: SystemMetricsData;
}) {
  const getDriftStatus = (days: number | null): 'good' | 'warning' | 'bad' | 'neutral' => {
    if (days === null) return 'neutral';
    if (days <= 1) return 'good';
    if (days <= 2) return 'warning';
    return 'bad';
  };

  const getDriftLabel = (days: number | null): string => {
    if (days === null) return 'No data';
    if (days < 1) return 'Today';
    return `${days.toFixed(1)}d`;
  };

  const completionData = [
    { level: 'Critical', rate: overview.completion_rates.critical, fill: 'var(--color-error)' },
    { level: 'Medium', rate: overview.completion_rates.medium, fill: 'var(--color-warning)' },
    { level: 'Low', rate: overview.completion_rates.low, fill: 'var(--color-info)' },
  ];

  return (
    <>
      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Last Critical"
          value={getDriftLabel(overview.drift_days)}
          subtext="days since completion"
          icon={<Target className="w-5 h-5" />}
          status={getDriftStatus(overview.drift_days)}
        />
        <StatCard
          label="Claude Time"
          value={`${overview.claude_time_today}h`}
          subtext="today"
          icon={<Clock className="w-5 h-5" />}
          status="neutral"
        />
        <StatCard
          label="Worker Success"
          value={`${overview.worker_success_rate}%`}
          subtext="all time"
          icon={<Zap className="w-5 h-5" />}
          status={overview.worker_success_rate >= 90 ? 'good' : overview.worker_success_rate >= 70 ? 'warning' : 'bad'}
        />
        <StatCard
          label="Critical Rate"
          value={`${overview.completion_rates.critical}%`}
          subtext="7-day completion"
          icon={<TrendingUp className="w-5 h-5" />}
          status={overview.completion_rates.critical >= 80 ? 'good' : overview.completion_rates.critical >= 50 ? 'warning' : 'bad'}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Priorities */}
        <div className="card">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">Today&apos;s Priorities</span>
          </div>
          <div className="p-4 space-y-1">
            <PriorityBar
              level="critical"
              completed={overview.priorities_today.critical.completed}
              total={overview.priorities_today.critical.total}
            />
            <PriorityBar
              level="medium"
              completed={overview.priorities_today.medium.completed}
              total={overview.priorities_today.medium.total}
            />
            <PriorityBar
              level="low"
              completed={overview.priorities_today.low.completed}
              total={overview.priorities_today.low.total}
            />
            {overview.priorities_today.critical.total === 0 &&
             overview.priorities_today.medium.total === 0 &&
             overview.priorities_today.low.total === 0 && (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                No priorities for today
              </p>
            )}
          </div>
        </div>

        {/* 7-Day Completion Rates Chart */}
        <div className="card">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--color-success)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">7-Day Completion Rates</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={completionData} layout="vertical">
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={10} />
                <YAxis type="category" dataKey="level" width={60} fontSize={11} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {completionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Failures */}
      {systemMetrics.recent_failures.length > 0 && (
        <div className="card mt-6">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--color-error)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Recent Failures
            </span>
            <span className="badge badge-error ml-2">{systemMetrics.recent_failures.length}</span>
          </div>
          <div className="p-4 space-y-2">
            {systemMetrics.recent_failures.map((failure) => (
              <FailureItem
                key={failure.id}
                id={failure.id}
                type={failure.type}
                failedAt={failure.failed_at}
                reason={failure.reason}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Clear */}
      {systemMetrics.recent_failures.length === 0 && (
        <div className="mt-6 flex items-center gap-3 py-4 px-4 bg-[var(--color-success-dim)] border border-[var(--color-success)]/20 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
          <span className="text-sm text-[var(--text-primary)]">No recent worker failures</span>
        </div>
      )}
    </>
  );
}

// ==================== PATTERNS TAB ====================

// Work Rhythm Heatmap
function WorkRhythmHeatmap({ data }: { data: Array<{ day: number; hour: number; count: number }> }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Build lookup map
  const heatmapData = new Map<string, number>();
  let maxCount = 1;
  data.forEach(({ day, hour, count }) => {
    heatmapData.set(`${day}-${hour}`, count);
    if (count > maxCount) maxCount = count;
  });

  const getColor = (count: number) => {
    if (count === 0) return 'var(--surface-muted)';
    const intensity = Math.min(count / maxCount, 1);
    // From light to saturated primary
    if (intensity < 0.25) return 'var(--color-primary-dim)';
    if (intensity < 0.5) return 'var(--color-primary)';
    if (intensity < 0.75) return 'var(--color-primary)';
    return 'var(--color-primary)';
  };

  const getOpacity = (count: number) => {
    if (count === 0) return 0.3;
    return 0.3 + (count / maxCount) * 0.7;
  };

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
        <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">Work Rhythm (7 days)</span>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex mb-1 ml-10">
            {hours.filter(h => h % 3 === 0).map(hour => (
              <div
                key={hour}
                className="text-[10px] text-[var(--text-muted)]"
                style={{ width: `${100 / 8}%` }}
              >
                {hour === 0 ? '12a' : hour === 12 ? '12p' : hour < 12 ? `${hour}a` : `${hour - 12}p`}
              </div>
            ))}
          </div>
          {/* Grid */}
          {days.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-[var(--text-muted)] w-8">{day}</span>
              <div className="flex-1 flex gap-[2px]">
                {hours.map(hour => {
                  const count = heatmapData.get(`${dayIdx}-${hour}`) || 0;
                  return (
                    <div
                      key={hour}
                      className="h-4 flex-1 rounded-sm transition-colors"
                      style={{
                        backgroundColor: getColor(count),
                        opacity: getOpacity(count),
                      }}
                      title={`${day} ${hour}:00 - ${count} sessions`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Week-over-Week Comparison
function WeeklyComparison({
  data,
}: {
  data: {
    this_week: { sessions: number; workers: number; priorities_completed: number };
    last_week: { sessions: number; workers: number; priorities_completed: number };
  };
}) {
  const metrics = [
    { label: 'Specialists', thisWeek: data.this_week.sessions, lastWeek: data.last_week.sessions },
    { label: 'Workers', thisWeek: data.this_week.workers, lastWeek: data.last_week.workers },
    { label: 'Priorities', thisWeek: data.this_week.priorities_completed, lastWeek: data.last_week.priorities_completed },
  ];

  const getDelta = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">Week over Week</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {metrics.map(({ label, thisWeek, lastWeek }) => {
            const delta = getDelta(thisWeek, lastWeek);
            const isUp = delta > 0;
            const isDown = delta < 0;

            return (
              <div key={label} className="text-center">
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{thisWeek}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {isUp && <ArrowUp className="w-3 h-3 text-[var(--color-success)]" />}
                  {isDown && <ArrowDown className="w-3 h-3 text-[var(--color-error)]" />}
                  {!isUp && !isDown && <Minus className="w-3 h-3 text-[var(--text-muted)]" />}
                  <span className={`text-xs ${isUp ? 'text-[var(--color-success)]' : isDown ? 'text-[var(--color-error)]' : 'text-[var(--text-muted)]'}`}>
                    {delta > 0 ? '+' : ''}{delta}%
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">vs {lastWeek} last week</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Session Stats by Role
function SessionStats({ data }: { data: Record<string, { count: number; avg_duration_mins: number; workers_spawned: number }> }) {
  const roles = Object.entries(data).sort((a, b) => b[1].count - a[1].count);

  const roleColors: Record<string, string> = {
    chief: 'var(--color-primary)',
    system: 'var(--color-info)',
    focus: 'var(--color-success)',
    idea: 'var(--color-warning)',
    project: 'var(--color-cyan)',
  };

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
        <Users className="w-4 h-4 text-[var(--color-info)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">Specialists by Role</span>
      </div>
      <div className="p-4">
        {roles.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No specialist data</p>
        ) : (
          <div className="space-y-3">
            {roles.map(([role, stats]) => (
              <div key={role} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: roleColors[role] || 'var(--text-muted)' }}
                />
                <span className="text-sm text-[var(--text-secondary)] w-16 capitalize">{role}</span>
                <div className="flex-1 flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span className="tabular-nums">{stats.count} sessions</span>
                  <span className="tabular-nums">{stats.avg_duration_mins}m avg</span>
                  <span className="tabular-nums">{stats.workers_spawned} workers</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// App Distribution
function AppDistribution({ data }: { data: Array<{ app: string; minutes: number; percentage: number }> }) {
  const colors = [
    'var(--color-primary)',
    'var(--color-info)',
    'var(--color-success)',
    'var(--color-warning)',
    'var(--color-error)',
    'var(--color-cyan)',
  ];

  const pieData = data.map((item, i) => ({
    ...item,
    fill: colors[i % colors.length],
  }));

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--color-warning)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">App Time (24h)</span>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No activity data</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="percentage"
                    nameKey="app"
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={40}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {data.slice(0, 5).map((item, i) => (
                <div key={item.app} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colors[i % colors.length] }}
                  />
                  <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{item.app}</span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PatternsTab({ patterns }: { patterns: MetricsPatternsData }) {
  return (
    <>
      {/* Work Rhythm Heatmap */}
      <div className="mb-6">
        <WorkRhythmHeatmap data={patterns.work_rhythm} />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <WeeklyComparison data={patterns.weekly_comparison} />
        <SessionStats data={patterns.session_stats} />
      </div>

      {/* App Distribution */}
      <AppDistribution data={patterns.app_distribution} />
    </>
  );
}

// ==================== MAIN COMPONENT ====================

export function MetricsTab() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns'>('overview');

  const [overview, setOverview] = useState<MetricsOverviewData | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetricsData | null>(null);
  const [patterns, setPatterns] = useState<MetricsPatternsData | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewData, systemData, patternsData] = await Promise.all([
        fetchMetricsOverview(),
        fetchSystemMetrics(),
        fetchMetricsPatterns(7),
      ]);
      setOverview(overviewData);
      setSystemMetrics(systemData);
      setPatterns(patternsData);
      setError(null);
    } catch (err) {
      console.error('Failed to load metrics:', err);
      setError('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadMetrics();
  }, [mounted, loadMetrics]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, [mounted, loadMetrics]);

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
          <button onClick={loadMetrics} className="btn btn-ghost flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab Header */}
      <div className="flex-shrink-0 px-6 pt-4 bg-[var(--surface-default)] border-b border-[var(--border-subtle)]">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'overview'
                ? 'bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-b-0 border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('patterns')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'patterns'
                ? 'bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-b-0 border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Patterns
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[var(--surface-sunken)]">
        {activeTab === 'overview' && overview && systemMetrics && (
          <OverviewTab overview={overview} systemMetrics={systemMetrics} />
        )}
        {activeTab === 'patterns' && patterns && (
          <PatternsTab patterns={patterns} />
        )}
      </div>
    </div>
  );
}

export default MetricsTab;
