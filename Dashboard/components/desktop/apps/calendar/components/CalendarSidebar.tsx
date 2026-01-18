'use client';

import { Eye, EyeOff } from 'lucide-react';
import { CalendarEvent } from '@/lib/types';
import { CalendarInfo } from '../utils/calendarUtils';
import { MiniCalendar } from './MiniCalendar';

interface CalendarSidebarProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events: CalendarEvent[];
  today: Date | null;
  calendars: CalendarInfo[];
  onToggleCalendar: (calendarId: string) => void;
  onSetCalendarsVisibility: (visible: boolean) => void;
}

/**
 * Calendar sidebar with mini calendar and calendar filters.
 * Shows which calendars are visible and allows toggling them.
 */
export function CalendarSidebar({
  currentDate,
  onDateSelect,
  events,
  today,
  calendars,
  onToggleCalendar,
  onSetCalendarsVisibility,
}: CalendarSidebarProps) {
  return (
    <div className="w-52 border-r border-[var(--border-subtle)] bg-[var(--surface-base)] flex flex-col">
      <MiniCalendar
        currentDate={currentDate}
        onDateSelect={onDateSelect}
        events={events}
        today={today}
      />

      {/* Calendar filters */}
      {calendars.length > 0 && (
        <div className="p-3 flex-1 overflow-y-auto">
          <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Calendars
          </h4>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => onSetCalendarsVisibility(true)}
              className="text-[10px] px-2 py-1 rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Show all
            </button>
            <button
              onClick={() => onSetCalendarsVisibility(false)}
              className="text-[10px] px-2 py-1 rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Hide all
            </button>
          </div>
          <div className="space-y-1">
            {calendars.map((cal) => (
              <button
                key={cal.id}
                onClick={() => onToggleCalendar(cal.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-accent)] transition-colors text-left"
              >
                <div className={`w-3 h-3 rounded-sm ${cal.color.dot}`} />
                <span className={`flex-1 text-sm truncate ${cal.visible ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {cal.name}
                </span>
                {cal.visible ? (
                  <Eye className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
