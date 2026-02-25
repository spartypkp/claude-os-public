'use client';

import { useMemo } from 'react';
import { Activity, Users } from 'lucide-react';
import { ContactEventRow, type ActivityEvent } from './ContactEventRow';

interface ActivityFeedProps {
  events: ActivityEvent[];
  loading: boolean;
  onSelectContact: (contactId: string) => void;
}

function groupByDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const groups = new Map<string, ActivityEvent[]>();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (const event of events) {
    const dateStr = event.created_at.slice(0, 10);
    let label: string;
    if (dateStr === today) label = 'Today';
    else if (dateStr === yesterday) label = 'Yesterday';
    else {
      const d = new Date(dateStr + 'T00:00:00');
      label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(event);
  }
  return groups;
}

export function ActivityFeed({ events, loading, onSelectContact }: ActivityFeedProps) {
  const grouped = useMemo(() => groupByDay(events), [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-5 h-5 border-2 border-[var(--color-claude)]/30 border-t-[var(--color-claude)] rounded-full animate-spin" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <div className="w-12 h-12 rounded-full bg-[var(--color-claude)]/10 flex items-center justify-center mb-3">
          <Activity className="w-6 h-6 text-[var(--color-claude)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
          No activity yet
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Activity appears as Claude interacts with your contacts
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {Array.from(grouped.entries()).map(([dayLabel, dayEvents]) => (
        <div key={dayLabel}>
          <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider bg-[var(--surface-base)]/95 backdrop-blur-sm z-10">
            {dayLabel}
          </div>
          <div className="px-1">
            {dayEvents.map((event) => (
              <ContactEventRow
                key={event.id}
                event={event}
                onClick={() => onSelectContact(event.contact_id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
