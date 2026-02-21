'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ProcessedEvent, CalendarInfo } from '../utils/calendarUtils';
import { API_BASE } from '@/lib/api';
import { toast } from 'sonner';

interface EventModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  onClose: () => void;
  event: ProcessedEvent | null;
  initialDate: Date;
  initialHour: number;
  calendars: CalendarInfo[];
  onSaved: () => void;
}

/**
 * Modal for creating and editing calendar events.
 */
export function EventModal({
  isOpen,
  mode,
  onClose,
  event,
  initialDate,
  initialHour,
  calendars,
  onSaved,
}: EventModalProps) {
  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
  const formatTimeInput = (date: Date) => date.toTimeString().slice(0, 5);

  // Only show writable calendars in selector
  const writableCalendars = calendars.filter((c) => c.writable);

  useEffect(() => {
    if (!isOpen) return;

    const baseStart = event ? new Date(event.start_ts) : new Date(initialDate);
    const baseEnd = event ? new Date(event.end_ts) : new Date(initialDate);

    if (!event) {
      baseStart.setHours(initialHour, 0, 0, 0);
      baseEnd.setHours(Math.min(initialHour + 1, 23), 0, 0, 0);
    }

    const calendarMatch = event?.calendar_name
      ? calendars.find(cal => cal.name === event.calendar_name)?.id
      : '';
    const defaultCalendarId =
      event?.calendar_id ||
      calendarMatch ||
      writableCalendars.find(cal => cal.primary)?.id ||
      writableCalendars[0]?.id ||
      '';

    const isAllDay = Boolean(event?.all_day);
    const modalEnd = new Date(baseEnd);
    if (isAllDay && modalEnd > baseStart) {
      modalEnd.setDate(modalEnd.getDate() - 1);
    }

    const isDifferentDay = formatDateInput(baseStart) !== formatDateInput(modalEnd);

    setTitle(event?.summary || '');
    setAllDay(isAllDay);
    setStartDate(formatDateInput(baseStart));
    setEndDate(formatDateInput(modalEnd));
    setStartTime(formatTimeInput(baseStart));
    setEndTime(formatTimeInput(baseEnd));
    setLocation(event?.location || '');
    setNotes(event?.description || '');
    setSelectedCalendarId(defaultCalendarId);
    setMultiDay(isDifferentDay);

    setTimeout(() => titleRef.current?.focus(), 100);
  }, [isOpen, event, initialDate, initialHour, calendars]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const effectiveEndDate = multiDay ? endDate : startDate;
      const start = new Date(`${startDate}T${allDay ? '00:00' : startTime}`);
      let end = new Date(`${effectiveEndDate}T${allDay ? '00:00' : endTime}`);

      if (allDay) {
        end.setDate(end.getDate() + 1);
      } else if (end <= start) {
        end.setDate(end.getDate() + 1);
      }

      if (mode === 'create') {
        const response = await fetch(`${API_BASE}/api/calendar/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            all_day: allDay,
            location: location.trim() || undefined,
            description: notes.trim() || undefined,
            calendar_id: selectedCalendarId || undefined,
          }),
        });

        if (!response.ok) throw new Error('Failed to create event');
      } else if (event) {
        const response = await fetch(`${API_BASE}/api/calendar/events/${event.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: title.trim(),
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            all_day: allDay,
            location: location.trim() || undefined,
            description: notes.trim() || undefined,
            calendar_id: selectedCalendarId || undefined,
          }),
        });

        if (!response.ok) throw new Error('Failed to update event');
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving event:', err);
      toast.error(`Failed to ${mode === 'create' ? 'create' : 'update'} event.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-[var(--surface-raised)] rounded-xl shadow-2xl w-[380px] max-w-[92vw] overflow-hidden">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {mode === 'create' ? 'New Event' : 'Edit Event'}
            </h3>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-accent)] transition-colors">
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Title */}
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              required
            />

            {/* Date + time row */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
                  required
                />
                {!allDay && (
                  <>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-28 px-2.5 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
                    />
                    <span className="text-[var(--text-muted)] text-xs">–</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-28 px-2.5 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
                    />
                  </>
                )}
              </div>

              {/* Multi-day end date */}
              {multiDay && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)] w-6 text-right">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
                    required
                  />
                </div>
              )}

              {/* Toggles */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border-subtle)]"
                  />
                  <span className="text-[12px] text-[var(--text-secondary)]">All day</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiDay}
                    onChange={(e) => setMultiDay(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border-subtle)]"
                  />
                  <span className="text-[12px] text-[var(--text-secondary)]">Multi-day</span>
                </label>
              </div>
            </div>

            {/* Location */}
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="w-full px-3 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
            />

            {/* Notes */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              rows={2}
              className="w-full px-3 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 resize-none"
            />

            {/* Calendar selector */}
            {writableCalendars.length > 1 && (
              <select
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
                className="w-full px-3 py-1.5 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              >
                {writableCalendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--text-secondary)] rounded-md hover:bg-[var(--surface-accent)] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-4 py-1.5 text-sm font-medium bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
