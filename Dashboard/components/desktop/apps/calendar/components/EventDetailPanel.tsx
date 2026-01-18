'use client';

import { Calendar, Clock, MapPin, FileText, Tag, X, Pencil, Trash2, Info } from 'lucide-react';
import { useState } from 'react';
import { ProcessedEvent, formatTime, getEventColor } from '../utils/calendarUtils';
import { EventInfoPanel } from './EventInfoPanel';

interface EventDetailPanelProps {
  event: ProcessedEvent;
  allCalendarNames: string[];
  onClose: () => void;
  onEdit: (event: ProcessedEvent) => void;
  onDelete: (event: ProcessedEvent) => void;
}

/**
 * Event detail slide-over panel.
 * Shows full event information with edit and delete actions.
 */
export function EventDetailPanel({
  event,
  allCalendarNames,
  onClose,
  onEdit,
  onDelete,
}: EventDetailPanelProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-96 max-w-full bg-[var(--surface-raised)] shadow-2xl animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate pr-2">
            {event.summary}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowInfo(true)}
              className="btn btn-ghost btn-icon-sm"
              title="Get Info"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={() => onEdit(event)}
              className="btn btn-ghost btn-icon-sm"
              title="Edit event"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(event)}
              className="btn btn-ghost btn-icon-sm text-[var(--color-error)]"
              title="Delete event"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-icon-sm flex-shrink-0"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-[var(--text-tertiary)] mt-0.5" />
            <div>
              <div className="text-sm text-[var(--text-primary)]">
                {event.all_day ? (
                  'All day'
                ) : (
                  <>
                    {formatTime(event.startDate)} - {formatTime(event.endDate)}
                  </>
                )}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {event.startDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {/* Calendar */}
          {event.calendar_name && (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[var(--text-tertiary)] mt-0.5" />
              <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <span className={`w-2.5 h-2.5 rounded-full ${getEventColor(event, allCalendarNames).bg}`} />
                <span>{event.calendar_name}</span>
              </div>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[var(--text-tertiary)] mt-0.5" />
              <div className="text-sm text-[var(--text-primary)]">
                {event.location}
              </div>
            </div>
          )}

          {/* Notes */}
          {event.description && (
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-[var(--text-tertiary)] mt-0.5" />
              <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                {event.description}
              </div>
            </div>
          )}

          {/* Tags */}
          {event.parsedTags.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="w-5 h-5 text-[var(--text-tertiary)] mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {event.parsedTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full text-xs bg-[var(--surface-accent)] text-[var(--text-secondary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Kind */}
          {event.kind && (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[var(--text-tertiary)] mt-0.5" />
              <div className="text-sm text-[var(--text-primary)] capitalize">
                {event.kind}
              </div>
            </div>
          )}

          {/* Conflict warning */}
          {event.hasConflict && (
            <div className="p-3 rounded-lg bg-[var(--color-error-dim)] border border-[var(--color-error)]/30">
              <div className="text-sm text-[var(--color-error)] font-medium">
                Scheduling Conflict
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                This event overlaps with another event on your calendar.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event Info Panel */}
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
