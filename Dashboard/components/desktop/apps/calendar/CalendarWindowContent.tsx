'use client';

import { CalendarView } from './CalendarView';

/**
 * Calendar app content for windowed mode.
 * Wraps the CalendarView with window-appropriate styling.
 */
export function CalendarWindowContent() {
  return (
    <div className="h-full overflow-auto bg-white dark:bg-[#1e1e1e]">
      <CalendarView />
    </div>
  );
}

export default CalendarWindowContent;

