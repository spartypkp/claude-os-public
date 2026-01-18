'use client';

import { memo } from 'react';
import { MapPin } from 'lucide-react';
import { ProcessedEvent, formatTime } from '../utils/calendarUtils';

interface EventCardProps {
  event: ProcessedEvent;
  onSelect: (event: ProcessedEvent) => void;
}

/**
 * Event card for week/day views.
 * Displays event information with color-coded styling.
 * Click to open event detail panel.
 */
export const EventCard = memo(function EventCard({ event, onSelect }: EventCardProps) {
  const { colorClass, hasConflict } = event;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
      className={`
        absolute rounded px-2 py-1 text-xs overflow-hidden
        transition-all hover:brightness-110 hover:z-30
        ${colorClass.bg} ${colorClass.text}
        ${hasConflict ? 'ring-2 ring-[var(--color-error)] ring-offset-1 ring-offset-[var(--surface-base)]' : ''}
        shadow-sm cursor-pointer text-left
      `}
      style={{
        top: `${event.topOffset}px`,
        height: `${event.height}px`,
        left: `${event.leftOffset}%`,
        width: `${event.width}%`,
        minHeight: '24px',
      }}
      title={`${event.summary}${event.location ? ` - ${event.location}` : ''}`}
    >
      <div className="truncate font-medium">{event.summary}</div>
      {event.height >= 40 && (
        <div className="truncate text-white/80 text-[10px]">
          {formatTime(event.startDate)} - {formatTime(event.endDate)}
        </div>
      )}
      {event.height >= 56 && event.location && (
        <div className="truncate text-white/70 text-[10px] flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5" />
          {event.location}
        </div>
      )}
    </button>
  );
});
