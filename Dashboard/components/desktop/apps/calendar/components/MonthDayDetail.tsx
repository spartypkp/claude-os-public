'use client';

import { X, Pencil, Trash2 } from 'lucide-react';
import { CalendarEvent } from '@/lib/types';
import {
  ProcessedEvent,
  eventSpansDate,
  getEventColor,
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
 * Shows all events for a specific day in month view.
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
  // Convert CalendarEvent to ProcessedEvent
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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative w-80 max-w-full bg-[var(--surface-raised)] shadow-2xl animate-slide-in flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">
              {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {dayEvents.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] text-center py-8">
              No events for this day
            </div>
          ) : (
            <>
              {/* All-day events */}
              {allDayEvents.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-[var(--text-muted)] mb-2">All day</div>
                  <div className="space-y-1">
                    {allDayEvents.map((event, idx) => {
                      const processedEvent = toProcessedEvent(event, idx);
                      const colorClass = processedEvent.colorClass;
                      return (
                        <div
                          key={`allday-${idx}`}
                          className={`w-full px-2 py-1 rounded text-xs ${colorClass.bg} ${colorClass.text} flex items-center justify-between gap-2`}
                        >
                          <button
                            onClick={() => onSelectEvent(processedEvent)}
                            className="flex-1 text-left truncate hover:brightness-110"
                          >
                            {event.summary}
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onEditEvent(processedEvent)}
                              className="btn btn-ghost btn-icon-sm text-white/80 hover:text-white"
                              title="Edit event"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDeleteEvent(processedEvent)}
                              className="btn btn-ghost btn-icon-sm text-white/80 hover:text-white"
                              title="Delete event"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timed events */}
              {timedEvents.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-[var(--text-muted)] mb-2">Scheduled</div>
                  <div className="space-y-1">
                    {timedEvents.map((event, idx) => {
                      const processedEvent = toProcessedEvent(event, idx);
                      const colorClass = processedEvent.colorClass;
                      const startTime = formatTime(new Date(event.start_ts));
                      const endTime = formatTime(new Date(event.end_ts));

                      return (
                        <div
                          key={`timed-${idx}`}
                          className="w-full px-2 py-1 rounded text-xs border border-[var(--border-subtle)] hover:bg-[var(--surface-accent)] flex items-start justify-between gap-2"
                        >
                          <button
                            onClick={() => onSelectEvent(processedEvent)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${colorClass.bg}`} />
                              <span className="text-[var(--text-primary)]">{event.summary}</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-1">
                              {startTime} - {endTime}
                            </div>
                          </button>
                          <div className="flex items-center gap-1 pt-0.5">
                            <button
                              onClick={() => onEditEvent(processedEvent)}
                              className="btn btn-ghost btn-icon-sm"
                              title="Edit event"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDeleteEvent(processedEvent)}
                              className="btn btn-ghost btn-icon-sm text-[var(--color-error)]"
                              title="Delete event"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <button
            onClick={() => onOpenDayView(date)}
            className="btn btn-ghost btn-sm"
          >
            Open day view
          </button>
          <button
            onClick={() => {
              onCreateEvent(date, 9);
              onClose();
            }}
            className="btn btn-primary btn-sm"
          >
            New event
          </button>
        </div>
      </div>
    </div>
  );
}
