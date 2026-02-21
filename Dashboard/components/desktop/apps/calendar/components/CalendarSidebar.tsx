'use client';

import { useMemo } from 'react';
import { CalendarEvent } from '@/lib/types';
import { CalendarInfo } from '../utils/calendarUtils';
import { MiniCalendar } from './MiniCalendar';

const OTHER_CALENDARS = new Set([
  'Found in Natural Language',
  'Found in Mail',
  'Facebook Birthdays',
  'Scheduled Reminders',
  'Birthdays',
  'US Holidays',
  'Siri Suggestions',
]);

interface CalendarSidebarProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events: CalendarEvent[];
  today: Date | null;
  calendars: CalendarInfo[];
  onToggleCalendar: (calendarId: string) => void;
  onSetCalendarsVisibility: (visible: boolean) => void;
}

function CalendarItem({ cal, onToggle }: { cal: CalendarInfo; onToggle: (id: string) => void }) {
  return (
    <button
      onClick={() => onToggle(cal.id)}
      className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--surface-accent)] transition-colors text-left group"
    >
      <div
        className={`w-2.5 h-2.5 rounded-sm transition-opacity ${cal.color.dot} ${cal.visible ? 'opacity-100' : 'opacity-25'}`}
      />
      <span className={`flex-1 text-[12px] truncate transition-colors ${cal.visible ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
        {cal.name}
      </span>
    </button>
  );
}

/**
 * Calendar sidebar with mini calendar and calendar filters.
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
  const { myCalendars, otherCalendars } = useMemo(() => {
    const my: CalendarInfo[] = [];
    const other: CalendarInfo[] = [];
    calendars.forEach((cal) => {
      if (OTHER_CALENDARS.has(cal.name)) {
        other.push(cal);
      } else {
        my.push(cal);
      }
    });
    return { myCalendars: my, otherCalendars: other };
  }, [calendars]);

  return (
    <div data-testid="calendar-sidebar" className="w-52 border-r border-[var(--border-subtle)] bg-[var(--surface-base)] flex flex-col">
      <MiniCalendar
        currentDate={currentDate}
        onDateSelect={onDateSelect}
        events={events}
        today={today}
      />

      {/* Calendar filters */}
      {calendars.length > 0 && (
        <div className="px-3 pt-3 pb-4 flex-1 overflow-y-auto">
          <h4 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-2">
            My Calendars
          </h4>
          <div className="space-y-0">
            {myCalendars.map((cal) => (
              <CalendarItem key={cal.id} cal={cal} onToggle={onToggleCalendar} />
            ))}
          </div>

          {otherCalendars.length > 0 && (
            <>
              <div className="border-t border-[var(--border-subtle)] my-2.5" />
              <h4 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-2">
                Other
              </h4>
              <div className="space-y-0">
                {otherCalendars.map((cal) => (
                  <CalendarItem key={cal.id} cal={cal} onToggle={onToggleCalendar} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
