'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Menu,
  Calendar,
} from 'lucide-react';
import { CalendarEvent } from '@/lib/types';
import { fetchCalendarEvents } from '@/lib/api';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';

// Imported components
import { EventCard } from './components/EventCard';
import { EventModal } from './components/EventModal';
import { EventDetailPanel } from './components/EventDetailPanel';
import { CalendarSidebar } from './components/CalendarSidebar';
import { MonthDayDetail } from './components/MonthDayDetail';
import { TimeGrid, TimeSlot } from './components/TimeGrid';

// Imported utils
import {
  ViewMode,
  ProcessedEvent,
  CalendarInfo,
  DAY_NAMES,
  FULL_DAY_NAMES,
  MONTH_NAMES,
  HOURS,
  HOUR_HEIGHT,
  START_HOUR,
  getWeekStart,
  getWeekDates,
  getMonthDays,
  isSameDay,
  isSameMonth,
  eventSpansDate,
  formatWeekRange,
  processEventsForDay,
  getCalendarColor,
  getEventColor,
  parseTags,
  getDayStart,
  formatHour,
  formatTime,
} from './utils/calendarUtils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5001';

// Claude OS branded colors
const CLAUDE_CORAL = '#DA7756';

// Claude badge component
function ClaudeBadge() {
  return (
    <div
      className="w-5 h-5 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center"
      title="Claude Calendar"
    >
      <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
        <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
      </svg>
    </div>
  );
}

export function CalendarView() {
  // Mount state to prevent hydration issues
  const [mounted, setMounted] = useState(false);

  // State - initialize date-dependent state as null
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ProcessedEvent | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [today, setToday] = useState<Date | null>(null);

  // New state for features
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

  // Mark as mounted and initialize dates (client-side only)
  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setCurrentDate(now);
    setCurrentTime(now);
    setToday(now);
  }, []);

  // Update "today" at midnight to keep highlighting accurate
  useEffect(() => {
    if (!mounted) return;

    const checkDayChange = () => {
      const now = new Date();
      setToday((prev) => {
        if (!prev) return now;
        // Check if day has changed
        if (
          prev.getDate() !== now.getDate() ||
          prev.getMonth() !== now.getMonth() ||
          prev.getFullYear() !== now.getFullYear()
        ) {
          return now;
        }
        return prev;
      });
    };

    // Check every minute for day change
    const interval = setInterval(checkDayChange, 60000);
    return () => clearInterval(interval);
  }, [mounted]);

  // Auto-switch to day view on mobile screens (only after mount)
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

  // Modal functions (must be defined before keyboard shortcuts that use them)
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

  // Keyboard shortcuts
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 't':
          goToToday();
          break;
        case 'd':
          setViewMode('day');
          break;
        case 'w':
          if (!isMobile) setViewMode('week');
          break;
        case 'm':
          setViewMode('month');
          break;
        case 'c':
          // Open create modal for current date
          if (currentDate) {
            openCreateModal(currentDate, 9);
          }
          break;
        case 'arrowleft':
          goToPrevious();
          break;
        case 'arrowright':
          goToNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, isMobile, currentDate, openCreateModal]);

  // Computed values - guard against null currentDate
  const weekStart = useMemo(
    () => (currentDate ? getWeekStart(currentDate) : new Date()),
    [currentDate]
  );
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const monthDays = useMemo(
    () => (currentDate ? getMonthDays(currentDate) : []),
    [currentDate]
  );

  const loadCalendars = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/calendar/calendars`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load calendars');
      }
      const payload = await response.json();
      const rawCalendars = Array.isArray(payload) ? payload : payload.calendars || [];
      const calendarNames = rawCalendars.map((cal: any) => cal.name);

      setCalendars((prev) => {
        const existingVisibility = new Map(prev.map((cal) => [cal.id, cal.visible]));
        return rawCalendars.map((cal: any) => ({
          id: cal.id,
          name: cal.name,
          color: getCalendarColor(cal.name, calendarNames),
          provider: cal.provider || 'apple',
          writable: Boolean(cal.writable),
          primary: Boolean(cal.primary),
          visible: existingVisibility.get(cal.id) ?? true,
        }));
      });
    } catch (err) {
      console.error('Error loading calendars:', err);
    }
  }, []);

  // Fetch calendar data
  const loadData = useCallback(async () => {
    if (!currentDate) return;

    try {
      setLoading(true);

      let rangeStart = new Date(currentDate);
      let rangeEnd = new Date(currentDate);

      if (viewMode === 'week') {
        rangeStart = getWeekStart(currentDate);
        rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeEnd.getDate() + 7);
      } else if (viewMode === 'month') {
        const monthGrid = getMonthDays(currentDate);
        rangeStart = new Date(monthGrid[0]);
        rangeEnd = new Date(monthGrid[monthGrid.length - 1]);
        rangeEnd.setDate(rangeEnd.getDate() + 1);
      } else {
        rangeStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate()
        );
        rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeEnd.getDate() + 1);
      }

      const data = await fetchCalendarEvents({
        fromDate: rangeStart.toISOString(),
        toDate: rangeEnd.toISOString(),
        usePreferred: false,
        limit: 500,
      });

      setEvents(data.events || []);
      setError(null);
    } catch (err) {
      console.error('Error loading calendar:', err);
      setError('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode]);

  // Initial load + visibility-based refresh + polling
  useEffect(() => {
    if (!mounted) return;

    // Refresh when tab becomes visible (instant feedback when switching back)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    // Initial load
    loadData();
    loadCalendars();

    // Visibility-based refresh
    document.addEventListener('visibilitychange', handleVisibility);

    // Background polling every 60 seconds (catches changes while tab is active)
    const interval = setInterval(loadData, 60000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [mounted, loadData, loadCalendars]);

  // Update current time every minute (only after mount)
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, [mounted]);

  // Navigation handlers
  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goToPrevious = useCallback(() => {
    if (!currentDate) return;
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  }, [currentDate, viewMode]);

  const goToNext = useCallback(() => {
    if (!currentDate) return;
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  }, [currentDate, viewMode]);

  // Toggle calendar visibility
  const toggleCalendar = useCallback((calendarId: string) => {
    setCalendars((prev) =>
      prev.map((c) => (c.id === calendarId ? { ...c, visible: !c.visible } : c))
    );
  }, []);

  const setCalendarsVisibility = useCallback((visible: boolean) => {
    setCalendars((prev) => prev.map((c) => ({ ...c, visible })));
  }, []);

  // Filter events by visible calendars
  const visibleEvents = useMemo(() => {
    const visibleCalIds = new Set(calendars.filter((c) => c.visible).map((c) => c.id));
    const visibleCalNames = new Set(calendars.filter((c) => c.visible).map((c) => c.name));
    // If no calendars tracked yet, show all
    if (visibleCalIds.size === 0 && calendars.length === 0) return events;
    return events.filter((e) => {
      if (e.calendar_id) return visibleCalIds.has(e.calendar_id);
      if (e.calendar_name) return visibleCalNames.has(e.calendar_name);
      return true;
    });
  }, [events, calendars]);

  // Get all calendar names for consistent color assignment
  const allCalendarNames = useMemo(() => calendars.map((c) => c.name), [calendars]);

  // Separate all-day events from timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    const timed: CalendarEvent[] = [];

    visibleEvents.forEach((event) => {
      if (event.all_day) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    });

    return { allDayEvents: allDay, timedEvents: timed };
  }, [visibleEvents]);

  const weekAllDayPlacements = useMemo(() => {
    if (viewMode !== 'week' || !currentDate) {
      return { placements: [], rows: 0 };
    }

    const weekStartDate = getWeekStart(currentDate);
    const weekStartDay = getDayStart(weekStartDate);
    const dayMs = 24 * 60 * 60 * 1000;

    const blocks = allDayEvents
      .map((event) => {
        const startDate = getDayStart(new Date(event.start_ts));
        const endDate = getDayStart(new Date(event.end_ts));
        if (event.all_day && endDate > startDate) {
          endDate.setDate(endDate.getDate() - 1);
        }

        let startIndex = Math.floor((startDate.getTime() - weekStartDay.getTime()) / dayMs);
        let endIndex = Math.floor((endDate.getTime() - weekStartDay.getTime()) / dayMs);

        if (endIndex < 0 || startIndex > 6) {
          return null;
        }

        startIndex = Math.max(0, startIndex);
        endIndex = Math.min(6, endIndex);

        return {
          event,
          startIndex,
          endIndex,
          span: endIndex - startIndex + 1,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (!a || !b) return 0;
        if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
        return b.span - a.span;
      }) as Array<{ event: CalendarEvent; startIndex: number; endIndex: number; span: number }>;

    const rows: number[] = [];
    const placements = blocks.map((block) => {
      let rowIndex = rows.findIndex((lastEnd) => lastEnd < block.startIndex);
      if (rowIndex === -1) {
        rowIndex = rows.length;
        rows.push(block.endIndex);
      } else {
        rows[rowIndex] = block.endIndex;
      }
      return { ...block, row: rowIndex };
    });

    return { placements, rows: rows.length };
  }, [allDayEvents, currentDate, viewMode]);

  // Get events for displayed days (use weekStart as fallback if currentDate is null)
  const displayedDays: Date[] =
    viewMode === 'week' ? weekDates : currentDate ? [currentDate] : [weekStart];

  const handleDeleteEvent = useCallback(
    async (event: ProcessedEvent) => {
      if (!confirm('Delete this event?')) return;

      try {
        const query = event.calendar_id
          ? `?calendar_id=${encodeURIComponent(event.calendar_id)}`
          : '';
        const response = await fetch(`${API_BASE}/api/calendar/events/${event.id}${query}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error('Failed to delete event');
        }
        setSelectedEvent(null);
        loadData();
      } catch (err) {
        console.error('Error deleting event:', err);
        alert('Failed to delete event. Please try again.');
      }
    },
    [loadData]
  );

  // Handle click on time slot to create event
  const handleSlotClick = useCallback(
    (date: Date, hour: number) => {
      openCreateModal(date, hour);
    },
    [openCreateModal]
  );

  // Handle date selection from mini calendar
  const handleDateSelect = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  // Handle click on month day
  const handleMonthDayClick = useCallback((date: Date) => {
    setMonthDetailDate(date);
    setMonthDetailOpen(true);
  }, []);

  // Get header text
  const getHeaderText = useCallback(() => {
    if (!currentDate) return '';
    if (viewMode === 'month') {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (viewMode === 'week') {
      return formatWeekRange(weekDates);
    } else {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }, [currentDate, viewMode, weekDates]);

  // Guard against pre-mount rendering
  if (!mounted || !currentDate) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[var(--surface-base)]">
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
        {/* Calendar Controls - Compact toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {isMobile && (
                <button
                  onClick={() => setShowSidebar((prev) => !prev)}
                  className="btn btn-ghost btn-icon-sm"
                  title="Toggle sidebar"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={goToPrevious}
                className="btn btn-ghost btn-icon-sm"
                title={`Previous ${viewMode}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToToday} className="btn btn-ghost btn-sm">
                Today
              </button>
              <button
                onClick={goToNext}
                className="btn btn-ghost btn-icon-sm"
                title={`Next ${viewMode}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <ClaudeBadge />
            <span className="text-sm text-[var(--text-secondary)]">{getHeaderText()}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Create button */}
            <button
              onClick={() => {
                if (currentDate) {
                  openCreateModal(currentDate, 9);
                }
              }}
              className="btn btn-ghost btn-icon-sm mr-2"
              title="Create event (C)"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* View toggles */}
            {!isMobile && (
              <button
                onClick={() => setViewMode('week')}
                className={`btn btn-ghost btn-sm ${
                  viewMode === 'week' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
                title="Week view (W)"
              >
                Week
              </button>
            )}
            <button
              onClick={() => setViewMode('day')}
              className={`btn btn-ghost btn-sm ${
                viewMode === 'day' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              }`}
              title="Day view (D)"
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`btn btn-ghost btn-sm ${
                viewMode === 'month' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              }`}
              title="Month view (M)"
            >
              Month
            </button>

            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="btn btn-ghost btn-icon-sm ml-2"
              title="Calendar Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Month View */}
        {viewMode === 'month' && (
          <div className="flex-1 overflow-auto p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-xs text-center text-[var(--text-muted)] py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-px bg-[var(--border-subtle)]">
              {monthDays.map((date, i) => {
                const isCurrentMonth = isSameMonth(date, currentDate);
                const isToday = today ? isSameDay(date, today) : false;
                const dayEvents = visibleEvents
                  .filter((e) => eventSpansDate(e, date))
                  .sort((a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime());
                const multiDayEvents = dayEvents.filter((event) => {
                  const start = new Date(event.start_ts);
                  const end = new Date(event.end_ts);
                  const duration = end.getTime() - start.getTime();
                  return event.all_day || duration >= 24 * 60 * 60 * 1000;
                });
                const timedEventsForDay = dayEvents.filter(
                  (event) => !multiDayEvents.includes(event)
                );
                const multiDayToShow = multiDayEvents.slice(0, 2);
                const remainingSlots = Math.max(0, 3 - multiDayToShow.length);
                const timedToShow = timedEventsForDay.slice(0, remainingSlots);
                const extraCount = dayEvents.length - (multiDayToShow.length + timedToShow.length);

                return (
                  <button
                    key={i}
                    onClick={() => handleMonthDayClick(date)}
                    className={`
                      group relative min-h-[100px] p-2 bg-[var(--surface-raised)] text-left
                      hover:bg-[var(--surface-accent)] transition-colors
                      ${!isCurrentMonth ? 'opacity-40' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div
                        className={`
                        text-sm font-medium
                        ${
                          isToday
                            ? 'w-7 h-7 flex items-center justify-center rounded-full bg-[var(--color-primary)] text-white'
                            : 'text-[var(--text-primary)]'
                        }
                      `}
                      >
                        {date.getDate()}
                      </div>
                      {isCurrentMonth && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCreateModal(date, 9);
                          }}
                          className="btn btn-ghost btn-icon-sm opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                          title="Add event"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Event dots/previews */}
                    <div className="space-y-0.5">
                      {multiDayToShow.map((event, idx) => {
                        const colorClass = getEventColor(event, allCalendarNames);
                        return (
                          <div
                            key={`multi-${idx}`}
                            className={`text-[10px] truncate px-2 py-0.5 rounded-full ${colorClass.bg} ${colorClass.text}`}
                            title={event.summary}
                          >
                            ↔ {event.summary}
                          </div>
                        );
                      })}
                      {timedToShow.map((event, idx) => {
                        const colorClass = getEventColor(event, allCalendarNames);
                        return (
                          <div
                            key={`timed-${idx}`}
                            className={`text-[10px] truncate px-1 py-0.5 rounded ${colorClass.bg} ${colorClass.text}`}
                          >
                            {event.summary}
                          </div>
                        );
                      })}
                      {extraCount > 0 && (
                        <div className="text-[10px] text-[var(--text-muted)]">
                          +{extraCount} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Week/Day View */}
        {viewMode !== 'month' && (
          <div className="flex-1 overflow-auto">
            <div className={viewMode === 'week' && !isMobile ? 'min-w-[800px]' : 'min-w-0'}>
              {/* All-day events section */}
              {allDayEvents.length > 0 && (
                <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                  {viewMode === 'week' ? (
                    <div className="grid grid-cols-[60px_repeat(7,1fr)]">
                      <div className="px-2 py-2 text-xs text-[var(--text-tertiary)]">All day</div>
                      <div
                        className="relative col-span-7 px-1 py-1 border-l border-[var(--border-subtle)]"
                        style={{ minHeight: `${Math.max(1, weekAllDayPlacements.rows) * 24}px` }}
                      >
                        {weekAllDayPlacements.placements.map((placement, idx) => {
                          const colorClass = getEventColor(placement.event, allCalendarNames);
                          const left = (placement.startIndex / 7) * 100;
                          const width = (placement.span / 7) * 100;
                          return (
                            <button
                              key={`${placement.event.id}-${idx}`}
                              onClick={() =>
                                setSelectedEvent({
                                  ...placement.event,
                                  id: placement.event.id,
                                  dragId: `${placement.event.id}-allday-week-${idx}`,
                                  startDate: new Date(placement.event.start_ts),
                                  endDate: new Date(placement.event.end_ts),
                                  topOffset: 0,
                                  height: 24,
                                  width: 100,
                                  leftOffset: 0,
                                  colorClass,
                                  hasConflict: false,
                                  parsedTags: parseTags(placement.event.tags),
                                })
                              }
                              className={`
                                absolute rounded text-xs px-2 py-0.5 truncate
                                ${colorClass.bg} ${colorClass.text}
                                hover:brightness-110 transition cursor-pointer
                              `}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                top: `${placement.row * 24}px`,
                              }}
                              title={placement.event.summary}
                            >
                              {placement.event.summary}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-2 space-y-1">
                      <div className="text-xs text-[var(--text-tertiary)]">All day</div>
                      {allDayEvents.map((event, idx) => {
                        const colorClass = getEventColor(event, allCalendarNames);
                        return (
                          <button
                            key={`allday-${idx}`}
                            onClick={() =>
                              setSelectedEvent({
                                ...event,
                                id: event.id,
                                dragId: `${event.id}-allday-day-${idx}`,
                                startDate: new Date(event.start_ts),
                                endDate: new Date(event.end_ts),
                                topOffset: 0,
                                height: 24,
                                width: 100,
                                leftOffset: 0,
                                colorClass,
                                hasConflict: false,
                                parsedTags: parseTags(event.tags),
                              })
                            }
                            className={`
                              w-full rounded text-xs px-2 py-1 text-left truncate
                              ${colorClass.bg} ${colorClass.text}
                              hover:brightness-110 transition cursor-pointer
                            `}
                            title={event.summary}
                          >
                            {event.summary}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Day Headers */}
              <div
                className={`grid ${
                  viewMode === 'week' ? 'grid-cols-[60px_repeat(7,1fr)]' : 'grid-cols-[60px_1fr]'
                } border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--surface-base)] z-10`}
              >
                <div /> {/* Time column spacer */}
                {displayedDays.map((date, i) => {
                  const isToday = today ? isSameDay(date, today) : false;
                  return (
                    <div
                      key={i}
                      className={`
                        px-2 py-3 text-center border-l border-[var(--border-subtle)]
                        ${isToday ? 'bg-[var(--color-primary-dim)]' : ''}
                      `}
                    >
                      <div className="text-xs text-[var(--text-muted)] uppercase">
                        {viewMode === 'week'
                          ? DAY_NAMES[date.getDay()]
                          : FULL_DAY_NAMES[date.getDay()]}
                      </div>
                      <div
                        className={`
                          text-lg font-semibold mt-1
                          ${isToday ? 'text-[var(--color-primary)]' : 'text-[var(--text-primary)]'}
                        `}
                      >
                        {date.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Time Grid */}
              <TimeGrid mode={viewMode === 'week' ? 'week' : 'day'}>
                {displayedDays.map((date, dayIndex) => {
                  const isToday = today ? isSameDay(date, today) : false;
                  const dayEvents = processEventsForDay(
                    timedEvents,
                    date,
                    viewMode,
                    allCalendarNames
                  );

                  // Current time indicator position
                  const currentTimeOffset =
                    isToday && currentTime
                      ? (currentTime.getHours() + currentTime.getMinutes() / 60 - START_HOUR) *
                        HOUR_HEIGHT
                      : null;
                  const showCurrentTime =
                    currentTimeOffset !== null &&
                    currentTimeOffset >= 0 &&
                    currentTimeOffset <= HOURS.length * HOUR_HEIGHT;

                  return (
                    <div
                      key={dayIndex}
                      className={`
                        relative border-l border-[var(--border-subtle)]
                        ${isToday ? 'bg-[var(--color-primary-glow)]' : ''}
                      `}
                      style={{ minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}
                    >
                      {/* Hour grid lines (clickable time slots) */}
                      {HOURS.map((hour) => (
                        <TimeSlot
                          key={hour}
                          hour={hour}
                          onClick={() => handleSlotClick(date, hour)}
                        />
                      ))}

                      {/* Events */}
                      <div className="absolute inset-0 px-1 pointer-events-none">
                        <div className="relative h-full pointer-events-auto">
                          {dayEvents.map((event) => (
                            <EventCard key={event.dragId} event={event} onSelect={setSelectedEvent} />
                          ))}
                        </div>
                      </div>

                      {/* Current time indicator */}
                      {showCurrentTime && (
                        <div
                          className="absolute left-0 right-0 h-0.5 bg-[var(--color-error)] z-20 pointer-events-none"
                          style={{ top: `${currentTimeOffset}px` }}
                        >
                          <div className="absolute -left-1.5 -top-1 w-3 h-3 bg-[var(--color-error)] rounded-full" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </TimeGrid>
            </div>
          </div>
        )}
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
            setViewMode('day');
            setCurrentDate(new Date(date));
            setMonthDetailOpen(false);
          }}
          onCreateEvent={(date, hour) => {
            openCreateModal(date, hour);
            setMonthDetailOpen(false);
          }}
        />
      )}

      {/* Create Event Modal */}
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
          loadData();
          loadCalendars();
        }}
      />

      {/* Empty state overlay if no events */}
      {visibleEvents.length === 0 && viewMode !== 'month' && (
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
            loadData(); // Refresh after settings change
            loadCalendars();
          }}
        />
      )}
    </div>
  );
}

export default CalendarView;
