import { CalendarEvent } from '@/lib/types';

// ============ Constants ============

export const HOUR_HEIGHT = 64; // pixels per hour
export const START_HOUR = 7; // 7 AM
export const END_HOUR = 22; // 10 PM
export const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ============ Types ============

export type ViewMode = 'week' | 'day' | 'month';

export interface ProcessedEvent extends CalendarEvent {
  id: string;
  dragId: string;
  startDate: Date;
  endDate: Date;
  topOffset: number;
  height: number;
  width: number;
  leftOffset: number;
  colorClass: { bg: string; border: string; text: string };
  hasConflict: boolean;
  parsedTags: string[];
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: CalendarColor;
  provider: string;
  writable: boolean;
  primary: boolean;
  visible: boolean;
}

export interface CalendarColor {
  name: string;
  bg: string;
  text: string;
  dot: string;
}

// ============ Color Configuration ============

export const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  focus: {
    bg: 'bg-[var(--color-primary)]/80',
    border: 'border-[var(--color-primary)]',
    text: 'text-white',
  },
  meeting: {
    bg: 'bg-[var(--color-info)]/80',
    border: 'border-[var(--color-info)]',
    text: 'text-white',
  },
  routine: {
    bg: 'bg-[var(--text-muted)]/60',
    border: 'border-[var(--text-muted)]',
    text: 'text-white',
  },
  health: {
    bg: 'bg-[var(--color-success)]/80',
    border: 'border-[var(--color-success)]',
    text: 'text-white',
  },
  personal: {
    bg: 'bg-[var(--color-warning)]/80',
    border: 'border-[var(--color-warning)]',
    text: 'text-white',
  },
  work: {
    bg: 'bg-[var(--color-cyan)]/80',
    border: 'border-[var(--color-cyan)]',
    text: 'text-white',
  },
  default: {
    bg: 'bg-[var(--color-primary)]/70',
    border: 'border-[var(--color-primary)]',
    text: 'text-white',
  },
};

// Apple Calendar-style color palette
export const CALENDAR_COLOR_PALETTE: CalendarColor[] = [
  { name: 'blue', bg: 'bg-blue-500', text: 'text-white', dot: 'bg-blue-500' },
  { name: 'green', bg: 'bg-emerald-500', text: 'text-white', dot: 'bg-emerald-500' },
  { name: 'orange', bg: 'bg-orange-500', text: 'text-white', dot: 'bg-orange-500' },
  { name: 'purple', bg: 'bg-purple-500', text: 'text-white', dot: 'bg-purple-500' },
  { name: 'red', bg: 'bg-red-500', text: 'text-white', dot: 'bg-red-500' },
  { name: 'cyan', bg: 'bg-cyan-500', text: 'text-white', dot: 'bg-cyan-500' },
  { name: 'pink', bg: 'bg-pink-500', text: 'text-white', dot: 'bg-pink-500' },
  { name: 'yellow', bg: 'bg-amber-500', text: 'text-black', dot: 'bg-amber-500' },
  { name: 'teal', bg: 'bg-teal-500', text: 'text-white', dot: 'bg-teal-500' },
  { name: 'indigo', bg: 'bg-indigo-500', text: 'text-white', dot: 'bg-indigo-500' },
];

// Map calendar names to specific colors
export const CALENDAR_COLOR_ASSIGNMENTS: Record<string, number> = {
  'Calendar': 0,        // blue
  'Holidays in United States': 1,  // green
  'Scheduled Reminders': 2,        // orange
  'Found in Natural Language': 3,  // purple
  'Work': 4,            // red
  'Home': 5,            // cyan
  'Family': 6,          // pink
};

// ============ Helper Functions ============

export function getCalendarColor(calendarName: string, allCalendars: string[]): CalendarColor {
  // Check if we have a pre-assigned color
  if (calendarName in CALENDAR_COLOR_ASSIGNMENTS) {
    return CALENDAR_COLOR_PALETTE[CALENDAR_COLOR_ASSIGNMENTS[calendarName]];
  }

  // Otherwise, assign based on position in the list (consistent coloring)
  const index = allCalendars.indexOf(calendarName);
  const colorIndex = index >= 0 ? index % CALENDAR_COLOR_PALETTE.length : 0;
  return CALENDAR_COLOR_PALETTE[colorIndex];
}

export function parseTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return tags.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

export function getEventColor(event: CalendarEvent, allCalendarNames: string[] = []): { bg: string; border: string; text: string } {
  // First priority: calendar_name (color by source calendar)
  if (event.calendar_name) {
    const calColor = getCalendarColor(event.calendar_name, allCalendarNames);
    return {
      bg: calColor.bg,
      border: `border-${calColor.name}-600`,
      text: calColor.text,
    };
  }

  // Fall back to tags/kind for events without calendar_name
  const tags = parseTags(event.tags);
  const kind = event.kind?.toLowerCase();

  // Check kind first
  if (kind && EVENT_COLORS[kind]) {
    return EVENT_COLORS[kind];
  }

  // Then check tags
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    if (EVENT_COLORS[lowerTag]) {
      return EVENT_COLORS[lowerTag];
    }
  }

  return EVENT_COLORS.default;
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });
}

export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthDays(date: Date): Date[] {
  const start = getMonthStart(date);
  const firstDayOfWeek = start.getDay(); // 0 = Sunday
  const startPadding = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Adjust for Monday start

  const days: Date[] = [];

  // Add padding days from previous month
  for (let i = startPadding; i > 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  // Add days of current month
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(date.getFullYear(), date.getMonth(), i));
  }

  // Add padding days for complete weeks (6 rows max)
  while (days.length < 42) {
    const lastDay = days[days.length - 1];
    const nextDay = new Date(lastDay);
    nextDay.setDate(nextDay.getDate() + 1);
    days.push(nextDay);
  }

  return days;
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

export function getDayStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getDayBounds(date: Date): { start: Date; end: Date } {
  const start = getDayStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function eventSpansDate(event: CalendarEvent, date: Date): boolean {
  const { start, end } = getDayBounds(date);
  const eventStart = new Date(event.start_ts);
  const eventEnd = new Date(event.end_ts);
  return eventStart < end && eventEnd > start;
}

export function formatWeekRange(weekDates: Date[]): string {
  const start = weekDates[0];
  const end = weekDates[6];

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

  if (start.getMonth() === end.getMonth()) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

export function processEventsForDay(
  events: CalendarEvent[],
  dayDate: Date,
  viewMode: ViewMode,
  allCalendarNames: string[] = []
): ProcessedEvent[] {
  const { start: dayStart, end: dayEnd } = getDayBounds(dayDate);

  // Filter events that overlap this day
  const dayEvents = events.filter((event) => {
    const eventStart = new Date(event.start_ts);
    const eventEnd = new Date(event.end_ts);
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  // Sort by start time
  dayEvents.sort((a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime());

  // Process each event
  const dayKey = dayDate.toISOString().slice(0, 10);
  const processedEvents: ProcessedEvent[] = dayEvents.map((event, idx) => {
    const rawStart = new Date(event.start_ts);
    const rawEnd = new Date(event.end_ts);
    const startDate = rawStart < dayStart ? new Date(dayStart) : rawStart;
    const endDate = rawEnd > dayEnd ? new Date(dayEnd) : rawEnd;

    // Calculate position
    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    const endHour = endDate.getHours() + endDate.getMinutes() / 60;

    // Clamp to visible hours
    const clampedStart = Math.max(startHour, START_HOUR);
    const clampedEnd = Math.min(endHour, END_HOUR + 1);

    const topOffset = (clampedStart - START_HOUR) * HOUR_HEIGHT;
    const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 24);

    return {
      ...event,
      id: event.id || `${event.summary}-${event.start_ts}-${idx}`,
      dragId: `${event.id || `${event.summary}-${event.start_ts}-${idx}`}-${dayKey}`,
      startDate,
      endDate,
      topOffset,
      height,
      width: 100,
      leftOffset: 0,
      colorClass: getEventColor(event, allCalendarNames),
      hasConflict: false,
      parsedTags: parseTags(event.tags),
    };
  });

  // Detect conflicts (overlapping events)
  for (let i = 0; i < processedEvents.length; i++) {
    for (let j = i + 1; j < processedEvents.length; j++) {
      const a = processedEvents[i];
      const b = processedEvents[j];

      // Check if they overlap
      if (a.startDate < b.endDate && b.startDate < a.endDate) {
        a.hasConflict = true;
        b.hasConflict = true;

        // Adjust widths for overlapping events
        a.width = 48;
        b.width = 48;
        b.leftOffset = 50;
      }
    }
  }

  return processedEvents;
}
