'use client';

import { memo } from 'react';
import { MapPin } from 'lucide-react';

/**
 * Custom time grid event component for Schedule-X.
 * Renders with left color stripe, semi-transparent background, and backdrop blur.
 * Receives calendarEvent prop from Schedule-X with our custom fields.
 */
function ScheduleXTimeGridEventInner({ calendarEvent }: { calendarEvent: any }) {
  const title = calendarEvent.title || calendarEvent.summary || 'Untitled';
  const location = calendarEvent.location;
  const calendarColor = calendarEvent._calendarColor || '#da7756';

  // Schedule-X provides the height in the DOM — we render content adaptively
  // based on available space via CSS overflow
  return (
    <div
      className="absolute inset-0 rounded-md overflow-hidden cursor-pointer backdrop-blur-sm"
      style={{ minHeight: '20px' }}
    >
      {/* Left color stripe */}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: calendarColor }}
      />

      {/* Background — solid color at low opacity */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: calendarColor, opacity: 0.15 }}
      />

      {/* Content — use calendar color for text (readable in both light/dark) */}
      <div className="relative pl-2.5 pr-2 py-1 h-full overflow-hidden">
        <div
          className="text-xs font-semibold leading-tight"
          style={{ color: calendarColor }}
        >
          {title}
        </div>
        {location && (
          <div
            className="text-[10px] flex items-center gap-1 mt-0.5 location-text leading-tight"
            style={{ color: calendarColor, opacity: 0.65 }}
          >
            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const ScheduleXTimeGridEvent = memo(ScheduleXTimeGridEventInner);
