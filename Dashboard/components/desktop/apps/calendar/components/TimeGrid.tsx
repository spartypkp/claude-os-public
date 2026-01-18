'use client';

import { ReactNode } from 'react';
import { HOURS, HOUR_HEIGHT, formatHour } from '../utils/calendarUtils';

interface TimeGridProps {
  children: ReactNode;
  mode: 'week' | 'day';
}

interface TimeSlotProps {
  hour: number;
  onClick: () => void;
}

/**
 * Clickable time slot for creating events.
 * Click to open event creation modal at this time.
 */
export function TimeSlot({ hour, onClick }: TimeSlotProps) {
  return (
    <div
      className="h-16 border-b border-[var(--border-subtle)] transition-colors cursor-pointer hover:bg-[var(--color-primary)]/5"
      onClick={onClick}
    />
  );
}

/**
 * Time grid with hour labels and columns.
 * Used by WeekView and DayView to show hourly schedule.
 */
export function TimeGrid({ children, mode }: TimeGridProps) {
  return (
    <div
      className={`grid ${
        mode === 'week' ? 'grid-cols-[60px_repeat(7,1fr)]' : 'grid-cols-[60px_1fr]'
      }`}
    >
      {/* Hour labels column */}
      <div>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="h-16 pr-2 text-right text-xs text-[var(--text-muted)] -mt-2"
          >
            {formatHour(hour)}
          </div>
        ))}
      </div>

      {/* Day columns - provided as children */}
      {children}
    </div>
  );
}
