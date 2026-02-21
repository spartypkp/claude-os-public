'use client';

import { Calendar, Clock, MapPin, FileText, Tag, X, Pencil, Trash2, Info } from 'lucide-react';
import { useState } from 'react';
import { ProcessedEvent, formatTime, getEventColor, getCalendarColor } from '../utils/calendarUtils';
import { EventInfoPanel } from './EventInfoPanel';
import { ChatButton } from '@/components/shared/ChatButton';

function buildCalendarContext(event: ProcessedEvent): string {
  const timeStr = event.all_day
    ? 'All day'
    : `${formatTime(event.startDate)} – ${formatTime(event.endDate)}`;
  const dateStr = event.startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  let msg = `[Calendar] ${event.summary} — ${dateStr} ${timeStr}`;
  if (event.location) msg += `\nLocation: ${event.location}`;
  return msg;
}

interface EventDetailPanelProps {
  event: ProcessedEvent;
  allCalendarNames: string[];
  onClose: () => void;
  onEdit: (event: ProcessedEvent) => void;
  onDelete: (event: ProcessedEvent) => void;
}

/**
 * Event detail slide-over panel.
 */
export function EventDetailPanel({
  event,
  allCalendarNames,
  onClose,
  onEdit,
  onDelete,
}: EventDetailPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const calColor = event.calendar_name
    ? getCalendarColor(event.calendar_name, allCalendarNames)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-80 max-w-full bg-[var(--surface-raised)] shadow-2xl flex flex-col animate-slide-in">
        {/* Color accent bar */}
        {calColor && (
          <div className="h-1 w-full" style={{ backgroundColor: `#${calColor.dot.replace('bg-[#', '').replace(']', '')}` }} />
        )}

        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
              {event.summary}
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-accent)] transition-colors flex-shrink-0 mt-0.5">
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Time — prominent */}
          <div className="mt-2 text-sm text-[var(--text-secondary)]">
            {event.all_day ? (
              'All day'
            ) : (
              <>
                {formatTime(event.startDate)} – {formatTime(event.endDate)}
              </>
            )}
            <span className="text-[var(--text-muted)] ml-1.5">
              {event.startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {/* Calendar */}
          {event.calendar_name && calColor && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
              <span className={`w-2 h-2 rounded-full ${calColor.dot}`} />
              {event.calendar_name}
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
              <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {/* Notes */}
          {event.description && (
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <div className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {event.description}
              </div>
            </div>
          )}

          {/* Tags */}
          {event.parsedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {event.parsedTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-accent)] text-[var(--text-secondary)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Conflict warning */}
          {event.hasConflict && (
            <div className="p-2.5 rounded-lg bg-[var(--color-error-dim)] border border-[var(--color-error)]/30">
              <div className="text-[13px] text-[var(--color-error)] font-medium">
                Scheduling Conflict
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <button
            onClick={() => setShowInfo(true)}
            className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Get Info
          </button>
          <div className="flex items-center gap-1">
            <ChatButton message={buildCalendarContext(event)} app="Calendar" size="md" />
            <button
              onClick={() => onEdit(event)}
              className="p-1.5 rounded hover:bg-[var(--surface-accent)] transition-colors"
              title="Edit event"
            >
              <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => onDelete(event)}
              className="p-1.5 rounded hover:bg-[var(--color-error-dim)] transition-colors"
              title="Delete event"
            >
              <Trash2 className="w-3.5 h-3.5 text-[var(--color-error)]" />
            </button>
          </div>
        </div>
      </div>

      {showInfo && (
        <EventInfoPanel
          event={event}
          allCalendarNames={allCalendarNames}
          onClose={() => setShowInfo(false)}
        />
      )}
    </div>
  );
}
