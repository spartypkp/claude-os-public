'use client';

import 'temporal-polyfill/global';
import './schedule-x-overrides.css';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Menu,
  Calendar,
} from 'lucide-react';
import { CalendarEvent } from '@/lib/types';
import { API_BASE } from '@/lib/api';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';

// Schedule-X imports
import { useNextCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import {
  viewWeek,
  viewDay,
  viewMonthGrid,
  toJSDate,
  type CalendarEvent as SXCalendarEvent,
} from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop';
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls';
import { createCurrentTimePlugin } from '@schedule-x/current-time';

// Custom Schedule-X event components
import { ScheduleXTimeGridEvent } from './components/ScheduleXTimeGridEvent';
import { ScheduleXDateGridEvent } from './components/ScheduleXDateGridEvent';

// Kept components
import { EventModal } from './components/EventModal';
import { EventDetailPanel } from './components/EventDetailPanel';
import { CalendarSidebar } from './components/CalendarSidebar';
import { MonthDayDetail } from './components/MonthDayDetail';

// Kept utils
import {
  ViewMode,
  ProcessedEvent,
  CalendarInfo,
  DAY_NAMES,
  MONTH_NAMES,
  getWeekStart,
  getWeekDates,
  isSameDay,
  formatWeekRange,
  getCalendarColor,
  getEventColor,
  parseTags,
  formatTime,
} from './utils/calendarUtils';

// Calendars hidden by default (noise calendars)
const HIDDEN_CALENDARS = new Set([
  'Found in Natural Language',
  'Found in Mail',
  'Facebook Birthdays',
  'Scheduled Reminders',
  'Birthdays',
  'US Holidays',
  'Siri Suggestions',
]);

const CALENDAR_VISIBILITY_KEY = 'claude-os-calendar-visibility';

// Color palette for Schedule-X calendar types
const SX_CALENDAR_COLORS: Record<string, { main: string; container: string; onContainer: string }> = {
  blue: { main: '#3b82f6', container: 'rgba(59,130,246,0.2)', onContainer: '#93bbfd' },
  green: { main: '#10b981', container: 'rgba(16,185,129,0.2)', onContainer: '#6ee7b7' },
  orange: { main: '#f97316', container: 'rgba(249,115,22,0.2)', onContainer: '#fdba74' },
  purple: { main: '#8b5cf6', container: 'rgba(139,92,246,0.2)', onContainer: '#c4b5fd' },
  red: { main: '#ef4444', container: 'rgba(239,68,68,0.2)', onContainer: '#fca5a5' },
  cyan: { main: '#06b6d4', container: 'rgba(6,182,212,0.2)', onContainer: '#67e8f9' },
  pink: { main: '#ec4899', container: 'rgba(236,72,153,0.2)', onContainer: '#f9a8d4' },
  yellow: { main: '#f59e0b', container: 'rgba(245,158,11,0.2)', onContainer: '#fcd34d' },
  teal: { main: '#14b8a6', container: 'rgba(20,184,166,0.2)', onContainer: '#5eead4' },
  indigo: { main: '#6366f1', container: 'rgba(99,102,241,0.2)', onContainer: '#a5b4fc' },
};

// Map CalendarInfo color names to hex colors for custom event rendering
function getCalendarHexColor(calendarName: string, allCalendarNames: string[]): string {
  const calColor = getCalendarColor(calendarName, allCalendarNames);
  const sxColor = SX_CALENDAR_COLORS[calColor.name];
  return sxColor?.main || '#da7756';
}

// Convert our CalendarEvent to Schedule-X event format
function toScheduleXEvent(event: CalendarEvent, allCalendarNames: string[]): SXCalendarEvent {
  const startDate = new Date(event.start_ts);
  const endDate = new Date(event.end_ts);

  let start: any;
  let end: any;

  if (event.all_day) {
    start = Temporal.PlainDate.from({
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      day: startDate.getDate(),
    });
    // For all-day events, end is exclusive in many APIs but inclusive in Schedule-X
    const endAdj = new Date(endDate);
    if (endAdj.getHours() === 0 && endAdj.getMinutes() === 0) {
      endAdj.setDate(endAdj.getDate() - 1);
    }
    end = Temporal.PlainDate.from({
      year: endAdj.getFullYear(),
      month: endAdj.getMonth() + 1,
      day: endAdj.getDate(),
    });
  } else {
    const tz = Temporal.Now.timeZoneId();
    start = Temporal.ZonedDateTime.from({
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      day: startDate.getDate(),
      hour: startDate.getHours(),
      minute: startDate.getMinutes(),
      second: startDate.getSeconds(),
      timeZone: tz,
    });
    end = Temporal.ZonedDateTime.from({
      year: endDate.getFullYear(),
      month: endDate.getMonth() + 1,
      day: endDate.getDate(),
      hour: endDate.getHours(),
      minute: endDate.getMinutes(),
      second: endDate.getSeconds(),
      timeZone: tz,
    });
  }

  const calColor = getCalendarHexColor(event.calendar_name || '', allCalendarNames);
  const timeText = !event.all_day
    ? `${formatTime(startDate)} – ${formatTime(endDate)}`
    : '';

  return {
    id: event.id || `${event.summary}-${event.start_ts}`,
    start,
    end,
    title: event.summary,
    location: event.location || undefined,
    description: event.description || undefined,
    calendarId: event.calendar_name || 'default',
    // Custom fields for our event components
    _calendarColor: calColor,
    _timeText: timeText,
    _originalEvent: event,
  };
}

// Convert Schedule-X event back to ProcessedEvent for our detail panels
function sxEventToProcessed(sxEvent: SXCalendarEvent, allCalendarNames: string[]): ProcessedEvent {
  const original = sxEvent._originalEvent as CalendarEvent;
  if (original) {
    return {
      ...original,
      id: String(sxEvent.id),
      dragId: `${sxEvent.id}-detail`,
      startDate: new Date(original.start_ts),
      endDate: new Date(original.end_ts),
      topOffset: 0,
      height: 0,
      width: 100,
      leftOffset: 0,
      colorClass: getEventColor(original, allCalendarNames),
      hasConflict: false,
      parsedTags: parseTags(original.tags),
    };
  }
  // Fallback if no original event stored
  const startJs = sxEvent.start instanceof Temporal.ZonedDateTime
    ? new Date(sxEvent.start.epochMilliseconds)
    : new Date(sxEvent.start.year, sxEvent.start.month - 1, sxEvent.start.day);
  const endJs = sxEvent.end instanceof Temporal.ZonedDateTime
    ? new Date(sxEvent.end.epochMilliseconds)
    : new Date(sxEvent.end.year, sxEvent.end.month - 1, sxEvent.end.day);

  return {
    id: String(sxEvent.id),
    dragId: `${sxEvent.id}-detail`,
    summary: sxEvent.title || '',
    start_ts: startJs.toISOString(),
    end_ts: endJs.toISOString(),
    location: sxEvent.location || undefined,
    description: sxEvent.description || undefined,
    calendar_name: (sxEvent.calendarId as string) || undefined,
    calendar_id: undefined,
    all_day: sxEvent.start instanceof Temporal.PlainDate,
    startDate: startJs,
    endDate: endJs,
    topOffset: 0,
    height: 0,
    width: 100,
    leftOffset: 0,
    colorClass: { bg: 'bg-[var(--color-primary)]/70', border: 'border-[var(--color-primary)]', text: 'text-white' },
    hasConflict: false,
    parsedTags: [],
  } as ProcessedEvent;
}

// Custom components object — MUST be defined at module scope for stable reference
const customComponents = {
  timeGridEvent: ScheduleXTimeGridEvent,
  dateGridEvent: ScheduleXDateGridEvent,
  monthGridEvent: ScheduleXDateGridEvent,
};

// Schedule-X view name to our ViewMode mapping
const SX_VIEW_MAP: Record<string, ViewMode> = {
  'week': 'week',
  'day': 'day',
  'month-grid': 'month',
};
const VIEW_MODE_TO_SX: Record<ViewMode, string> = {
  'week': 'week',
  'day': 'day',
  'month': 'month-grid',
};

export function CalendarView() {
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ProcessedEvent | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [today, setToday] = useState<Date | null>(null);

  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventModalMode, setEventModalMode] = useState<'create' | 'edit'>('create');
  const [eventModalDate, setEventModalDate] = useState(new Date());
  const [eventModalHour, setEventModalHour] = useState(9);
  const [eventModalEvent, setEventModalEvent] = useState<ProcessedEvent | null>(null);
  const [monthDetailOpen, setMonthDetailOpen] = useState(false);
  const [monthDetailDate, setMonthDetailDate] = useState<Date | null>(null);

  // Raw events from API — stored for filtering and sidebar
  const [rawEvents, setRawEvents] = useState<CalendarEvent[]>([]);
  const allCalendarNamesRef = useRef<string[]>([]);
  const calendarsRef = useRef<CalendarInfo[]>([]);
  const fetchEventsRef = useRef<((start: Date, end: Date) => Promise<void>) | null>(null);

  // Schedule-X plugins — create once
  const eventsService = useMemo(() => createEventsServicePlugin(), []);
  const dragAndDrop = useMemo(() => createDragAndDropPlugin(15), []);
  const calendarControls = useMemo(() => createCalendarControlsPlugin(), []);
  const currentTimePlugin = useMemo(() => createCurrentTimePlugin(), []);

  // Build Schedule-X calendars config from our CalendarInfo
  const sxCalendars = useMemo(() => {
    const result: Record<string, any> = {};
    calendars.forEach((cal) => {
      const sxColor = SX_CALENDAR_COLORS[cal.color.name] || SX_CALENDAR_COLORS.blue;
      result[cal.name] = {
        colorName: cal.color.name,
        label: cal.name,
        darkColors: sxColor,
        lightColors: sxColor,
      };
    });
    // Default calendar for events without a calendar_name
    if (!result['default']) {
      result['default'] = {
        colorName: 'orange',
        label: 'Default',
        darkColors: SX_CALENDAR_COLORS.orange,
        lightColors: SX_CALENDAR_COLORS.orange,
      };
    }
    return result;
  }, [calendars]);

  // Create Schedule-X calendar app
  const calendarApp = useNextCalendarApp({
    views: [viewWeek, viewDay, viewMonthGrid],
    defaultView: 'week',
    selectedDate: Temporal.Now.plainDateISO(),
    theme: 'shadcn',
    isDark: false,
    locale: 'en-US',
    timezone: Temporal.Now.timeZoneId(),
    firstDayOfWeek: 1,
    dayBoundaries: { start: '07:00', end: '23:00' },
    weekOptions: { gridHeight: 1600 },
    calendars: sxCalendars,
    callbacks: {
      // Disable Schedule-X's responsive small-calendar breakpoint (forces day view at 690px)
      // Our calendar lives in a windowed desktop, not full-page — always allow week view
      isCalendarSmall: () => false,
      onEventClick(sxEvent, e) {
        const processed = sxEventToProcessed(sxEvent, allCalendarNamesRef.current);
        setSelectedEvent(processed);
      },
      onClickDateTime(dateTime) {
        const jsDate = new Date(dateTime.epochMilliseconds);
        openCreateModal(jsDate, jsDate.getHours());
      },
      onClickDate(date) {
        if (viewMode === 'month') {
          const jsDate = new Date(date.year, date.month - 1, date.day);
          setMonthDetailDate(jsDate);
          setMonthDetailOpen(true);
        }
      },
      onEventUpdate(updatedEvent) {
        handleDragUpdate(updatedEvent);
      },
      onRangeUpdate(range) {
        // Range changed — fetch new events via ref (avoids stale closure)
        if (range.start && range.end) {
          const startDate = range.start instanceof Temporal.ZonedDateTime
            ? new Date(range.start.epochMilliseconds)
            : new Date((range.start as any).year, (range.start as any).month - 1, (range.start as any).day);
          const endDate = range.end instanceof Temporal.ZonedDateTime
            ? new Date(range.end.epochMilliseconds)
            : new Date((range.end as any).year, (range.end as any).month - 1, (range.end as any).day);
          // Add a day buffer to end
          endDate.setDate(endDate.getDate() + 1);
          fetchEventsRef.current?.(startDate, endDate);
        }
      },
    },
  }, [eventsService, dragAndDrop, calendarControls, currentTimePlugin]);

  // Initialize
  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setCurrentDate(now);
    setToday(now);
  }, []);

  // Update today at midnight
  useEffect(() => {
    if (!mounted) return;
    const checkDayChange = () => {
      const now = new Date();
      setToday((prev) => {
        if (!prev || prev.getDate() !== now.getDate() ||
            prev.getMonth() !== now.getMonth() ||
            prev.getFullYear() !== now.getFullYear()) {
          return now;
        }
        return prev;
      });
    };
    const interval = setInterval(checkDayChange, 60000);
    return () => clearInterval(interval);
  }, [mounted]);

  // Mobile detection
  useEffect(() => {
    if (!mounted) return;
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setShowSidebar(!mobile);
      if (mobile && viewMode === 'week') {
        setViewMode('day');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mounted, viewMode]);

  // Modal functions
  const openCreateModal = useCallback((date: Date, hour: number) => {
    setEventModalMode('create');
    setEventModalEvent(null);
    setEventModalDate(date);
    setEventModalHour(hour);
    setEventModalOpen(true);
  }, []);

  const openEditModal = useCallback((event: ProcessedEvent) => {
    setEventModalMode('edit');
    setEventModalEvent(event);
    setEventModalDate(new Date(event.start_ts));
    setEventModalHour(new Date(event.start_ts).getHours());
    setEventModalOpen(true);
  }, []);

  // Keep calendarsRef in sync with state
  useEffect(() => {
    calendarsRef.current = calendars;
  }, [calendars]);

  // Fetch events from API and push to Schedule-X
  // Uses calendarsRef to avoid recreating on every calendars state change
  const fetchAndSetEvents = useCallback(async (rangeStart: Date, rangeEnd: Date) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        from_date: rangeStart.toISOString(),
        to_date: rangeEnd.toISOString(),
        limit: '500',
      });
      const response = await fetch(`${API_BASE}/api/calendar/events?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load events');
      const data = await response.json();
      const events: CalendarEvent[] = data.events || [];
      setRawEvents(events);
      setError(null);

      // Filter by visible calendars and convert to Schedule-X format
      const cals = calendarsRef.current;
      const visibleCalIds = new Set(cals.filter((c) => c.visible).map((c) => c.id));
      const visibleCalNames = new Set(cals.filter((c) => c.visible).map((c) => c.name));
      const filtered = cals.length === 0
        ? events
        : events.filter((e) => {
            if (e.calendar_id) return visibleCalIds.has(e.calendar_id);
            if (e.calendar_name) return visibleCalNames.has(e.calendar_name);
            return true;
          });

      const sxEvents = filtered.map((e) => toScheduleXEvent(e, allCalendarNamesRef.current));
      eventsService.set(sxEvents);
    } catch (err) {
      console.error('Error loading calendar:', err);
      setError('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }, [eventsService]);

  // Keep ref in sync so Schedule-X callbacks always call the latest version
  useEffect(() => {
    fetchEventsRef.current = fetchAndSetEvents;
  }, [fetchAndSetEvents]);

  // Load calendars
  const loadCalendars = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/calendar/calendars`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load calendars');
      const payload = await response.json();
      const rawCalendars = Array.isArray(payload) ? payload : payload.calendars || [];
      const calendarNames = rawCalendars.map((cal: any) => cal.name);
      allCalendarNamesRef.current = calendarNames;

      let savedVisibility: Record<string, boolean> = {};
      try {
        const stored = localStorage.getItem(CALENDAR_VISIBILITY_KEY);
        if (stored) savedVisibility = JSON.parse(stored);
      } catch {}

      setCalendars((prev) => {
        const existingVisibility = new Map(prev.map((cal) => [cal.id, cal.visible]));
        return rawCalendars.map((cal: any) => {
          const defaultVisible = !HIDDEN_CALENDARS.has(cal.name);
          const visible = existingVisibility.get(cal.id)
            ?? savedVisibility[cal.id]
            ?? defaultVisible;
          return {
            id: cal.id,
            name: cal.name,
            color: getCalendarColor(cal.name, calendarNames),
            provider: cal.provider || 'apple',
            writable: Boolean(cal.writable),
            primary: Boolean(cal.primary),
            visible,
          };
        });
      });
    } catch (err) {
      console.error('Error loading calendars:', err);
    }
  }, []);

  // Helper to get current range dates from calendarControls
  const getRangeDates = useCallback((): { start: Date; end: Date } | null => {
    const range = calendarControls.getRange?.();
    if (!range?.start || !range?.end) return null;
    const s = range.start instanceof Temporal.ZonedDateTime
      ? new Date(range.start.epochMilliseconds)
      : new Date((range.start as any).year, (range.start as any).month - 1, (range.start as any).day);
    const e = range.end instanceof Temporal.ZonedDateTime
      ? new Date(range.end.epochMilliseconds)
      : new Date((range.end as any).year, (range.end as any).month - 1, (range.end as any).day);
    e.setDate(e.getDate() + 1);
    return { start: s, end: e };
  }, [calendarControls]);

  // Initial load — runs once on mount
  useEffect(() => {
    if (!mounted) return;
    loadCalendars().then(() => {
      // Explicit initial fetch — onRangeUpdate may have fired before fetchEventsRef was ready
      setTimeout(() => {
        const dates = getRangeDates();
        if (dates) fetchEventsRef.current?.(dates.start, dates.end);
      }, 100);
    });

    // Visibility-based refresh
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const dates = getRangeDates();
        if (dates) fetchEventsRef.current?.(dates.start, dates.end);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Background polling every 60s
    const interval = setInterval(() => {
      const dates = getRangeDates();
      if (dates) fetchEventsRef.current?.(dates.start, dates.end);
    }, 60000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [mounted, loadCalendars, getRangeDates]);

  // Re-filter events when calendar visibility changes
  useEffect(() => {
    if (!mounted || rawEvents.length === 0) return;
    const visibleCalIds = new Set(calendars.filter((c) => c.visible).map((c) => c.id));
    const visibleCalNames = new Set(calendars.filter((c) => c.visible).map((c) => c.name));
    const filtered = calendars.length === 0
      ? rawEvents
      : rawEvents.filter((e) => {
          if (e.calendar_id) return visibleCalIds.has(e.calendar_id);
          if (e.calendar_name) return visibleCalNames.has(e.calendar_name);
          return true;
        });
    const sxEvents = filtered.map((e) => toScheduleXEvent(e, allCalendarNamesRef.current));
    eventsService.set(sxEvents);
  }, [mounted, rawEvents, calendars, eventsService]);

  // Handle drag-and-drop update
  const handleDragUpdate = useCallback(async (updatedEvent: SXCalendarEvent) => {
    const original = updatedEvent._originalEvent as CalendarEvent;
    if (!original) return;

    const newStart = updatedEvent.start instanceof Temporal.ZonedDateTime
      ? new Date(updatedEvent.start.epochMilliseconds)
      : new Date((updatedEvent.start as any).year, (updatedEvent.start as any).month - 1, (updatedEvent.start as any).day);
    const newEnd = updatedEvent.end instanceof Temporal.ZonedDateTime
      ? new Date(updatedEvent.end.epochMilliseconds)
      : new Date((updatedEvent.end as any).year, (updatedEvent.end as any).month - 1, (updatedEvent.end as any).day);

    try {
      const query = original.calendar_id
        ? `?calendar_id=${encodeURIComponent(original.calendar_id)}`
        : '';
      const response = await fetch(`${API_BASE}/api/calendar/events/${original.id}${query}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: original.summary,
          start_ts: newStart.toISOString(),
          end_ts: newEnd.toISOString(),
          all_day: original.all_day,
          location: original.location,
        }),
      });
      if (!response.ok) {
        console.error('Failed to update event via drag');
      }
    } catch (err) {
      console.error('Error updating event:', err);
    }
  }, []);

  // Persist calendar visibility
  const persistVisibility = useCallback((cals: CalendarInfo[]) => {
    try {
      const map: Record<string, boolean> = {};
      cals.forEach((c) => { map[c.id] = c.visible; });
      localStorage.setItem(CALENDAR_VISIBILITY_KEY, JSON.stringify(map));
    } catch {}
  }, []);

  const toggleCalendar = useCallback((calendarId: string) => {
    setCalendars((prev) => {
      const next = prev.map((c) => (c.id === calendarId ? { ...c, visible: !c.visible } : c));
      persistVisibility(next);
      return next;
    });
  }, [persistVisibility]);

  const setCalendarsVisibility = useCallback((visible: boolean) => {
    setCalendars((prev) => {
      const next = prev.map((c) => ({ ...c, visible }));
      persistVisibility(next);
      return next;
    });
  }, [persistVisibility]);

  // Visible events for sidebar and detail panels
  const visibleEvents = useMemo(() => {
    const visibleCalIds = new Set(calendars.filter((c) => c.visible).map((c) => c.id));
    const visibleCalNames = new Set(calendars.filter((c) => c.visible).map((c) => c.name));
    if (visibleCalIds.size === 0 && calendars.length === 0) return rawEvents;
    return rawEvents.filter((e) => {
      if (e.calendar_id) return visibleCalIds.has(e.calendar_id);
      if (e.calendar_name) return visibleCalNames.has(e.calendar_name);
      return true;
    });
  }, [rawEvents, calendars]);

  const allCalendarNames = useMemo(() => calendars.map((c) => c.name), [calendars]);

  // Navigation — use calendarControls plugin
  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    const tp = Temporal.PlainDate.from({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
    calendarControls.setDate(tp);
  }, [calendarControls]);

  const goToPrevious = useCallback(() => {
    if (!currentDate) return;
    const newDate = new Date(currentDate);
    if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
    else if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
    else newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
    const tp = Temporal.PlainDate.from({
      year: newDate.getFullYear(),
      month: newDate.getMonth() + 1,
      day: newDate.getDate(),
    });
    calendarControls.setDate(tp);
  }, [currentDate, viewMode, calendarControls]);

  const goToNext = useCallback(() => {
    if (!currentDate) return;
    const newDate = new Date(currentDate);
    if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
    else if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
    else newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
    const tp = Temporal.PlainDate.from({
      year: newDate.getFullYear(),
      month: newDate.getMonth() + 1,
      day: newDate.getDate(),
    });
    calendarControls.setDate(tp);
  }, [currentDate, viewMode, calendarControls]);

  // View switching
  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    calendarControls.setView(VIEW_MODE_TO_SX[mode]);
  }, [calendarControls]);

  // Sidebar date selection
  const handleDateSelect = useCallback((date: Date) => {
    setCurrentDate(date);
    const tp = Temporal.PlainDate.from({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    });
    calendarControls.setDate(tp);
  }, [calendarControls]);

  // Event deletion
  const handleDeleteEvent = useCallback(async (event: ProcessedEvent) => {
    if (!confirm('Delete this event?')) return;
    try {
      const query = event.calendar_id
        ? `?calendar_id=${encodeURIComponent(event.calendar_id)}`
        : '';
      const response = await fetch(`${API_BASE}/api/calendar/events/${event.id}${query}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete event');
      setSelectedEvent(null);
      // Refresh
      const range = calendarControls.getRange?.();
      if (range?.start && range?.end) {
        const s = range.start instanceof Temporal.ZonedDateTime
          ? new Date(range.start.epochMilliseconds)
          : new Date((range.start as any).year, (range.start as any).month - 1, (range.start as any).day);
        const e = range.end instanceof Temporal.ZonedDateTime
          ? new Date(range.end.epochMilliseconds)
          : new Date((range.end as any).year, (range.end as any).month - 1, (range.end as any).day);
        e.setDate(e.getDate() + 1);
        fetchAndSetEvents(s, e);
      }
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('Failed to delete event. Please try again.');
    }
  }, [calendarControls, fetchAndSetEvents]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 't': goToToday(); break;
        case 'd': handleViewChange('day'); break;
        case 'w': if (!isMobile) handleViewChange('week'); break;
        case 'm': handleViewChange('month'); break;
        case 'c':
          if (currentDate) openCreateModal(currentDate, 9);
          break;
        case 'arrowleft': goToPrevious(); break;
        case 'arrowright': goToNext(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, isMobile, currentDate, goToToday, goToPrevious, goToNext, handleViewChange, openCreateModal]);

  // Header text
  const getHeaderText = useCallback(() => {
    if (!currentDate) return '';
    if (viewMode === 'month') {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (viewMode === 'week') {
      const ws = getWeekStart(currentDate);
      return formatWeekRange(getWeekDates(ws));
    } else {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }, [currentDate, viewMode]);

  // Guard against pre-mount
  if (!mounted || !currentDate) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div data-testid="calendar-view" className="h-full flex bg-[var(--surface-base)]">
      {/* Sidebar */}
      {showSidebar && (
        <CalendarSidebar
          currentDate={currentDate}
          onDateSelect={handleDateSelect}
          events={visibleEvents}
          today={today}
          calendars={calendars}
          onToggleCalendar={toggleCalendar}
          onSetCalendarsVisibility={setCalendarsVisibility}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-raised)]">
        {/* Toolbar */}
        <div data-testid="calendar-toolbar" className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setShowSidebar((prev) => !prev)}
                className="btn btn-ghost btn-icon-sm"
                title="Toggle sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            <button onClick={goToPrevious} className="p-1 rounded hover:bg-[var(--surface-accent)] transition-colors" title={`Previous ${viewMode}`}>
              <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <button onClick={goToNext} className="p-1 rounded hover:bg-[var(--surface-accent)] transition-colors" title={`Next ${viewMode}`}>
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <h2 className="text-base font-semibold text-[var(--text-primary)] select-none">{getHeaderText()}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-accent)] transition-colors"
            >
              Today
            </button>

            {/* View segmented control */}
            <div className="flex rounded-md border border-[var(--border-subtle)] overflow-hidden">
              {(!isMobile ? ['week', 'day', 'month'] as const : ['day', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleViewChange(mode)}
                  className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    viewMode === mode
                      ? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                  title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view (${mode.charAt(0).toUpperCase()})`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              onClick={() => currentDate && openCreateModal(currentDate, 9)}
              className="p-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors"
              title="Create event (C)"
            >
              <Plus className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors"
              title="Calendar Settings"
            >
              <Settings className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {/* Schedule-X Calendar */}
        <div data-testid="calendar-grid" className="flex-1 overflow-hidden">
          {calendarApp && (
            <ScheduleXCalendar
              calendarApp={calendarApp}
              customComponents={customComponents}
            />
          )}
        </div>
      </div>

      {/* Event Detail Slide-over */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          allCalendarNames={allCalendarNames}
          onClose={() => setSelectedEvent(null)}
          onEdit={openEditModal}
          onDelete={handleDeleteEvent}
        />
      )}

      {/* Month Day Detail Panel */}
      {monthDetailOpen && monthDetailDate && (
        <MonthDayDetail
          date={monthDetailDate}
          events={visibleEvents}
          allCalendarNames={allCalendarNames}
          onClose={() => setMonthDetailOpen(false)}
          onSelectEvent={setSelectedEvent}
          onEditEvent={openEditModal}
          onDeleteEvent={handleDeleteEvent}
          onOpenDayView={(date) => {
            handleViewChange('day');
            handleDateSelect(date);
            setMonthDetailOpen(false);
          }}
          onCreateEvent={(date, hour) => {
            openCreateModal(date, hour);
            setMonthDetailOpen(false);
          }}
        />
      )}

      {/* Create/Edit Event Modal */}
      <EventModal
        isOpen={eventModalOpen}
        mode={eventModalMode}
        onClose={() => setEventModalOpen(false)}
        event={eventModalEvent}
        initialDate={eventModalDate}
        initialHour={eventModalHour}
        calendars={calendars}
        onSaved={() => {
          setSelectedEvent(null);
          const range = calendarControls.getRange?.();
          if (range?.start && range?.end) {
            const s = range.start instanceof Temporal.ZonedDateTime
              ? new Date(range.start.epochMilliseconds)
              : new Date((range.start as any).year, (range.start as any).month - 1, (range.start as any).day);
            const e = range.end instanceof Temporal.ZonedDateTime
              ? new Date(range.end.epochMilliseconds)
              : new Date((range.end as any).year, (range.end as any).month - 1, (range.end as any).day);
            e.setDate(e.getDate() + 1);
            fetchAndSetEvents(s, e);
          }
          loadCalendars();
        }}
      />

      {/* Empty state */}
      {visibleEvents.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-[var(--surface-base)]/80 px-8 py-6 rounded-lg">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-tertiary)]">
              No calendar events for this {viewMode}
            </p>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <CalendarSettingsPanel
          onClose={() => {
            setShowSettings(false);
            loadCalendars();
            const range = calendarControls.getRange?.();
            if (range?.start && range?.end) {
              const s = range.start instanceof Temporal.ZonedDateTime
                ? new Date(range.start.epochMilliseconds)
                : new Date((range.start as any).year, (range.start as any).month - 1, (range.start as any).day);
              const e = range.end instanceof Temporal.ZonedDateTime
                ? new Date(range.end.epochMilliseconds)
                : new Date((range.end as any).year, (range.end as any).month - 1, (range.end as any).day);
              e.setDate(e.getDate() + 1);
              fetchAndSetEvents(s, e);
            }
          }}
        />
      )}
    </div>
  );
}

export default CalendarView;
