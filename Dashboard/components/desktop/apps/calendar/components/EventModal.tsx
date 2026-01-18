'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, MapPin, X, Loader2, Check } from 'lucide-react';
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
 * Handles event form state and submission.
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
  const titleRef = useRef<HTMLInputElement>(null);

  const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
  const formatTimeInput = (date: Date) => date.toTimeString().slice(0, 5);

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
      calendars.find(cal => cal.primary)?.id ||
      calendars[0]?.id ||
      '';

    const isAllDay = Boolean(event?.all_day);
    const modalEnd = new Date(baseEnd);
    if (isAllDay && modalEnd > baseStart) {
      modalEnd.setDate(modalEnd.getDate() - 1);
    }

    setTitle(event?.summary || '');
    setAllDay(isAllDay);
    setStartDate(formatDateInput(baseStart));
    setEndDate(formatDateInput(modalEnd));
    setStartTime(formatTimeInput(baseStart));
    setEndTime(formatTimeInput(baseEnd));
    setLocation(event?.location || '');
    setNotes(event?.description || '');
    setSelectedCalendarId(defaultCalendarId);

    setTimeout(() => titleRef.current?.focus(), 100);
  }, [isOpen, event, initialDate, initialHour, calendars]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const start = new Date(`${startDate}T${allDay ? '00:00' : startTime}`);
      let end = new Date(`${endDate}T${allDay ? '00:00' : endTime}`);

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

        if (!response.ok) {
          throw new Error('Failed to create event');
        }
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

        if (!response.ok) {
          throw new Error('Failed to update event');
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving event:', err);
      toast.error(`Failed to ${mode === 'create' ? 'create' : 'update'} event. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-[var(--surface-raised)] rounded-lg shadow-2xl w-[420px] max-w-[92vw]">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {mode === 'create' ? 'New Event' : 'Edit Event'}
            </h3>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-icon-sm">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add title"
                className="w-full px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                id="all-day-toggle"
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border-subtle)]"
              />
              <label htmlFor="all-day-toggle">All day</label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  required
                />
              </div>
            </div>

            {!allDay && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <span className="text-[var(--text-muted)]">-</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                className="flex-1 px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes"
                rows={3}
                className="w-full px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)]">Calendar</label>
              <select
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {calendars.length === 0 ? (
                  <option value="">No calendars available</option>
                ) : (
                  calendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="btn btn-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
