import { CalendarEvent } from '@/lib/types';

// ============ Constants ============

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

// Calendar color palette using CSS-variable-compatible classes
export const CALENDAR_COLOR_PALETTE: CalendarColor[] = [
  { name: 'blue', bg: 'bg-[var(--color-primary)]', text: 'text-white', dot: 'bg-[var(--color-primary)]' },
  { name: 'green', bg: 'bg-[#10b981]', text: 'text-white', dot: 'bg-[#10b981]' },
  { name: 'orange', bg: 'bg-[#f97316]', text: 'text-white', dot: 'bg-[#f97316]' },
  { name: 'purple', bg: 'bg-[var(--color-info)]', text: 'text-white', dot: 'bg-[var(--color-info)]' },
  { name: 'red', bg: 'bg-[var(--color-error)]', text: 'text-white', dot: 'bg-[var(--color-error)]' },
  { name: 'cyan', bg: 'bg-[#06b6d4]', text: 'text-white', dot: 'bg-[#06b6d4]' },
  { name: 'pink', bg: 'bg-[#ec4899]', text: 'text-white', dot: 'bg-[#ec4899]' },
  { name: 'yellow', bg: 'bg-[var(--color-warning)]', text: 'text-black', dot: 'bg-[var(--color-warning)]' },
  { name: 'teal', bg: 'bg-[#14b8a6]', text: 'text-white', dot: 'bg-[#14b8a6]' },
  { name: 'indigo', bg: 'bg-[#6366f1]', text: 'text-white', dot: 'bg-[#6366f1]' },
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
  if (calendarName in CALENDAR_COLOR_ASSIGNMENTS) {
    return CALENDAR_COLOR_PALETTE[CALENDAR_COLOR_ASSIGNMENTS[calendarName]];
  }
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
  if (event.calendar_name) {
    const calColor = getCalendarColor(event.calendar_name, allCalendarNames);
    return {
      bg: calColor.bg,
      border: `border-${calColor.name}-600`,
      text: calColor.text,
    };
  }
  const tags = parseTags(event.tags);
  const kind = event.kind?.toLowerCase();
  if (kind && EVENT_COLORS[kind]) return EVENT_COLORS[kind];
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    if (EVENT_COLORS[lowerTag]) return EVENT_COLORS[lowerTag];
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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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
  const firstDayOfWeek = start.getDay();
  const startPadding = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const days: Date[] = [];
  for (let i = startPadding; i > 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(date.getFullYear(), date.getMonth(), i));
  }
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
