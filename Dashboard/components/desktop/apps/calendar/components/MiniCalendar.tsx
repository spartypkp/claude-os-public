'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarEvent } from '@/lib/types';
import {
  getMonthDays,
  isSameMonth,
  isSameDay,
  SHORT_MONTH_NAMES
} from '../utils/calendarUtils';

interface MiniCalendarProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events: CalendarEvent[];
  today: Date | null;
}

/**
 * Mini calendar for date navigation in sidebar.
 * Shows current month with event dots and date selection.
 */
export function MiniCalendar({
  currentDate,
  onDateSelect,
  events,
  today
}: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(currentDate);

  useEffect(() => {
    setViewMonth(currentDate);
  }, [currentDate]);

  const monthDays = useMemo(() => getMonthDays(viewMonth), [viewMonth]);

  // Get event dates for dots
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    events.forEach(e => {
      const start = new Date(e.start_ts);
      const end = new Date(e.end_ts);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      if (e.all_day && end > start) {
        end.setDate(end.getDate() - 1);
      }
      const cursor = new Date(start);
      while (cursor <= end) {
        dates.add(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return dates;
  }, [events]);

  const hasEvents = (date: Date) => {
    return eventDates.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
  };

  return (
    <div className="p-3 border-b border-[var(--border-subtle)]">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => {
            const d = new Date(viewMonth);
            d.setMonth(d.getMonth() - 1);
            setViewMonth(d);
          }}
          className="btn btn-ghost btn-icon-sm"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <span className="text-xs font-medium text-[var(--text-primary)]">
          {SHORT_MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          onClick={() => {
            const d = new Date(viewMonth);
            d.setMonth(d.getMonth() + 1);
            setViewMonth(d);
          }}
          className="btn btn-ghost btn-icon-sm"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
          <div key={i} className="text-[10px] text-center text-[var(--text-muted)]">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {monthDays.map((date, i) => {
          const isCurrentMonth = isSameMonth(date, viewMonth);
          const isToday = today ? isSameDay(date, today) : false;
          const isSelected = isSameDay(date, currentDate);
          const hasEvent = hasEvents(date);

          return (
            <button
              key={i}
              onClick={() => onDateSelect(date)}
              className={`
                relative w-6 h-6 text-[10px] rounded-full
                flex items-center justify-center
                transition-colors
                ${!isCurrentMonth ? 'text-[var(--text-muted)]/50' : 'text-[var(--text-secondary)]'}
                ${isToday ? 'bg-[var(--color-primary)] text-white' : ''}
                ${isSelected && !isToday ? 'bg-[var(--surface-accent)]' : ''}
                hover:bg-[var(--surface-accent)]
              `}
            >
              {date.getDate()}
              {hasEvent && !isToday && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--color-primary)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
