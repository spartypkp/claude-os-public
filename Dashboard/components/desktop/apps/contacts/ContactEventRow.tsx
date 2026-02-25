'use client';

import {
  Mail,
  Calendar,
  MessageSquare,
  UserPlus,
  Edit2,
  Zap,
  Clock,
} from 'lucide-react';

export interface ActivityEvent {
  id: string;
  contact_id: string;
  contact_name: string;
  event_type: 'signal_touch' | 'created' | 'updated' | 'enriched' | 'history_added';
  description: string;
  source?: string;
  created_at: string;
}

const EVENT_ICONS: Record<string, typeof Mail> = {
  signal_touch: Mail,
  created: UserPlus,
  updated: Edit2,
  enriched: Zap,
  history_added: Clock,
};

const SOURCE_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  calendar: Calendar,
  imessage: MessageSquare,
};

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

interface ContactEventRowProps {
  event: ActivityEvent;
  onClick: () => void;
}

export function ContactEventRow({ event, onClick }: ContactEventRowProps) {
  // Pick icon: prefer source-specific for signal touches, else event type
  const Icon = (event.event_type === 'signal_touch' && event.source)
    ? (SOURCE_ICONS[event.source] || EVENT_ICONS.signal_touch)
    : (EVENT_ICONS[event.event_type] || Clock);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--surface-muted)] transition-colors text-left group"
    >
      <div className="w-7 h-7 rounded-full bg-[var(--color-claude)]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-[var(--color-claude)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {event.contact_name}
          </span>
          <span className="text-xs text-[var(--text-secondary)] truncate">
            {event.description}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {relativeTime(event.created_at)}
      </span>
    </button>
  );
}
