'use client';

import { Calendar, Clock, Hash, User, Database, Tag, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { ProcessedEvent, getEventColor } from '../utils/calendarUtils';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex gap-4 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <span className="w-24 shrink-0 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className={`flex-1 text-[13px] text-[var(--text-primary)] break-all ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}

interface EventInfoPanelProps {
  event: ProcessedEvent;
  allCalendarNames: string[];
  onClose: () => void;
}

/**
 * Event info panel - shows detailed metadata about a calendar event.
 * Similar to Finder's Get Info panel but for calendar events.
 */
export function EventInfoPanel({
  event,
  allCalendarNames,
  onClose,
}: EventInfoPanelProps) {
  // Format timestamps
  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (event.status?.toLowerCase()) {
      case 'confirmed':
        return <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />;
      case 'tentative':
        return <Loader2 className="w-3.5 h-3.5 text-[var(--color-warning)]" />;
      case 'cancelled':
        return <AlertCircle className="w-3.5 h-3.5 text-[var(--color-error)]" />;
      default:
        return null;
    }
  };

  // Get color info
  const colorInfo = getEventColor(event, allCalendarNames);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] z-[9999] animate-scale-in">
        <div className="bg-[var(--surface-raised)] backdrop-blur-xl rounded-xl border border-[var(--border-default)] shadow-2xl overflow-hidden">
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Event Info
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Icon and name header */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[var(--border-default)]">
              <div className={`w-14 h-14 rounded-xl ${colorInfo.bg} flex items-center justify-center`}>
                <Calendar className={`w-7 h-7 ${colorInfo.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {event.summary}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {event.all_day ? 'All-Day Event' : 'Scheduled Event'}
                </p>
              </div>
            </div>

            {/* Info rows */}
            <div className="space-y-0 max-h-[400px] overflow-y-auto">
              {/* Event ID */}
              <InfoRow
                label="Event ID"
                value={
                  <span className="flex items-center gap-2">
                    <Hash className="w-3 h-3 text-[var(--text-muted)]" />
                    {event.id || event.event_id || '—'}
                  </span>
                }
                mono
              />

              {/* Calendar Source */}
              {event.calendar_name && (
                <InfoRow
                  label="Calendar"
                  value={
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorInfo.bg}`} />
                      {event.calendar_name}
                    </span>
                  }
                />
              )}

              {/* Calendar ID */}
              {event.calendar_id && (
                <InfoRow
                  label="Calendar ID"
                  value={event.calendar_id}
                  mono
                />
              )}

              {/* Start Time */}
              <InfoRow
                label="Starts"
                value={
                  <span className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                    {formatTimestamp(event.start_ts)}
                  </span>
                }
              />

              {/* End Time */}
              <InfoRow
                label="Ends"
                value={
                  <span className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                    {formatTimestamp(event.end_ts)}
                  </span>
                }
              />

              {/* Status */}
              {event.status && (
                <InfoRow
                  label="Status"
                  value={
                    <span className="flex items-center gap-2 capitalize">
                      {getStatusIcon()}
                      {event.status}
                    </span>
                  }
                />
              )}

              {/* Organizer */}
              {(event.organizer_name || event.organizer_email) && (
                <InfoRow
                  label="Organizer"
                  value={
                    <span className="flex items-center gap-2">
                      <User className="w-3 h-3 text-[var(--text-muted)]" />
                      <span>
                        {event.organizer_name || event.organizer_email}
                        {event.organizer_name && event.organizer_email && (
                          <span className="text-[var(--text-muted)] ml-1 text-[11px]">
                            ({event.organizer_email})
                          </span>
                        )}
                      </span>
                    </span>
                  }
                />
              )}

              {/* Kind */}
              {event.kind && (
                <InfoRow
                  label="Kind"
                  value={
                    <span className="px-2 py-0.5 bg-[var(--surface-accent)] text-[var(--text-secondary)] rounded text-[11px] font-medium capitalize">
                      {event.kind}
                    </span>
                  }
                />
              )}

              {/* Tags */}
              {event.parsedTags && event.parsedTags.length > 0 && (
                <InfoRow
                  label="Tags"
                  value={
                    <span className="flex items-center gap-1 flex-wrap">
                      <Tag className="w-3 h-3 text-[var(--text-muted)] mr-1" />
                      {event.parsedTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-accent)] text-[var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  }
                />
              )}

              {/* All Day */}
              <InfoRow
                label="All Day"
                value={event.all_day ? 'Yes' : 'No'}
              />

              {/* Has Conflict */}
              {event.hasConflict && (
                <InfoRow
                  label="Conflict"
                  value={
                    <span className="flex items-center gap-2 text-[var(--color-error)]">
                      <AlertCircle className="w-3 h-3" />
                      Overlaps with another event
                    </span>
                  }
                />
              )}

              {/* Raw Timestamps */}
              <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  Raw Data
                </p>
                <div className="bg-[var(--surface-sunken)] rounded-lg p-3 font-mono text-[11px] text-[var(--text-secondary)] space-y-1">
                  <div className="truncate">start_ts: {event.start_ts}</div>
                  <div className="truncate">end_ts: {event.end_ts}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default EventInfoPanel;
