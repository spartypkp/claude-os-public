'use client';

import { CalendarView } from './CalendarView';

/**
 * Calendar app content for windowed mode.
 * Wraps the CalendarView with window-appropriate styling.
 */
export function CalendarWindowContent() {
  return (
    <div data-testid="calendar-app" className="h-full overflow-auto bg-[var(--surface-base)]">
      <CalendarView />
    </div>
  );
}

export default CalendarWindowContent;

