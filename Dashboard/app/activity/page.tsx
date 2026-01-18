'use client';

import { ActivityTodayView } from '@/components/activity/ActivityTodayView';
import { useActivityHub } from '@/hooks/useActivityHub';

export default function ActivityPage() {
  const activity = useActivityHub();

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-base)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Activity</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Today's sessions and workers
        </p>
      </div>

      {/* Content */}
      <ActivityTodayView activity={activity} />
    </div>
  );
}
