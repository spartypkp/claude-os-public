'use client';

import { memo } from 'react';

/**
 * Custom date grid (all-day/multi-day) event component for Schedule-X.
 * Renders as a colored pill with readable font size.
 */
function ScheduleXDateGridEventInner({ calendarEvent }: { calendarEvent: any }) {
  const title = calendarEvent.title || calendarEvent.summary || 'Untitled';
  const calendarColor = calendarEvent._calendarColor || 'var(--color-claude)';

  return (
    <div
      className="rounded px-2 py-0.5 text-xs truncate font-medium cursor-pointer"
      style={{ backgroundColor: `${calendarColor}20`, color: calendarColor, borderLeft: `2px solid ${calendarColor}` }}
      title={title}
    >
      {title}
    </div>
  );
}

export const ScheduleXDateGridEvent = memo(ScheduleXDateGridEventInner);
