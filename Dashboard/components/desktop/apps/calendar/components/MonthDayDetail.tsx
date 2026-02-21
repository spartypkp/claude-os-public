'use client';

import { X, Plus } from 'lucide-react';
import { CalendarEvent } from '@/lib/types';
import {
  ProcessedEvent,
  eventSpansDate,
  getEventColor,
  getCalendarColor,
  formatTime,
  parseTags,
} from '../utils/calendarUtils';

interface MonthDayDetailProps {
  date: Date;
  events: CalendarEvent[];
  allCalendarNames: string[];
  onClose: () => void;
  onSelectEvent: (event: ProcessedEvent) => void;
  onEditEvent: (event: ProcessedEvent) => void;
  onDeleteEvent: (event: ProcessedEvent) => void;
  onOpenDayView: (date: Date) => void;
  onCreateEvent: (date: Date, hour: number) => void;
}

/**
 * Month day detail slide-over panel.
 */
export function MonthDayDetail({
  date,
  events,
  allCalendarNames,
  onClose,
  onSelectEvent,
  onEditEvent,
  onDeleteEvent,
  onOpenDayView,
  onCreateEvent,
}: MonthDayDetailProps) {
  const toProcessedEvent = (event: CalendarEvent, idx: number): ProcessedEvent => {
    const colorClass = getEventColor(event, allCalendarNames);
    return {
      ...event,
      id: event.id,
      dragId: `${event.id}-month-${idx}`,
      startDate: new Date(event.start_ts),
      endDate: new Date(event.end_ts),
      topOffset: 0,
      height: 24,
      width: 100,
      leftOffset: 0,
      colorClass,
      hasConflict: false,
      parsedTags: parseTags(event.tags),
    };
  };

  const dayEvents = events
    .filter(e => eventSpansDate(e, date))
    .sort((a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime());

  const allDayEvents = dayEvents.filter(e => e.all_day);
  const timedEvents = dayEvents.filter(e => !e.all_day);

  const isToday = (() => {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  })();

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-72 max-w-full bg-[var(--surface-raised)] shadow-2xl animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-semibold ${isToday ? 'text-[var(--color-primary)]' : 'text-[var(--text-primary)]'}`}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {isToday && (
                <span className="text-[10px] font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-1.5 py-0.5 rounded">
                  Today
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onCreateEvent(date, 9);
                onClose();
              }}
              className="p-1.5 rounded hover:bg-[var(--surface-accent)] transition-colors"
              title="New event"
            >
              <Plus className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--surface-accent)] transition-colors">
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {/* Events */}
        <div className="p-3 flex-1 overflow-y-auto">
          {dayEvents.length === 0 ? (
            <div className="text-[13px] text-[var(--text-muted)] text-center py-8">
              No events
            </div>
          ) : (
            <div className="space-y-1">
              {/* All-day events */}
              {allDayEvents.map((event, idx) => {
                const processed = toProcessedEvent(event, idx);
                const calColor = event.calendar_name
                  ? getCalendarColor(event.calendar_name, allCalendarNames)
                  : null;
                return (
                  <button
                    key={`allday-${idx}`}
                    onClick={() => onSelectEvent(processed)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors flex items-center gap-2"
                  >
                    {calColor && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${calColor.dot}`} />}
                    <span className="text-[13px] text-[var(--text-primary)] truncate">{event.summary}</span>
                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 ml-auto">all day</span>
                  </button>
                );
              })}

              {/* Timed events */}
              {timedEvents.map((event, idx) => {
                const processed = toProcessedEvent(event, idx);
                const calColor = event.calendar_name
                  ? getCalendarColor(event.calendar_name, allCalendarNames)
                  : null;
                const startTimeStr = formatTime(new Date(event.start_ts));
                return (
                  <button
                    key={`timed-${idx}`}
                    onClick={() => onSelectEvent(processed)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors flex items-center gap-2"
                  >
                    {calColor && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${calColor.dot}`} />}
                    <span className="text-[13px] text-[var(--text-primary)] truncate">{event.summary}</span>
                    <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 ml-auto tabular-nums">{startTimeStr}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => onOpenDayView(date)}
            className="text-[12px] text-[var(--color-primary)] hover:underline"
          >
            Open in day view
          </button>
        </div>
      </div>
    </div>
  );
}
