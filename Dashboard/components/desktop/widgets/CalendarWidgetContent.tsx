'use client';

import { fetchCalendarEvents } from '@/lib/api';
import { CalendarEvent } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import {
	Calendar,
	ChevronRight,
	Clock,
	Loader2,
	MapPin,
	Sparkles,
	Video,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

// ==========================================
// HELPERS
// ==========================================

function formatTime(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});
}

function formatTimeRange(start: string, end: string): string {
	return `${formatTime(start)} – ${formatTime(end)}`;
}

function isCurrentEvent(event: CalendarEvent): boolean {
	const now = new Date();
	const start = new Date(event.start_ts);
	const end = new Date(event.end_ts);
	return now >= start && now <= end;
}

function isPastEvent(event: CalendarEvent): boolean {
	return new Date(event.end_ts) < new Date();
}

function eventSpansDateRange(event: CalendarEvent, start: Date, end: Date): boolean {
	const eventStart = new Date(event.start_ts);
	const eventEnd = new Date(event.end_ts);
	return eventStart < end && eventEnd > start;
}

function getEventTiming(event: CalendarEvent): { label: string; isSoon: boolean; isNow: boolean } | null {
	const now = new Date();
	const start = new Date(event.start_ts);
	const end = new Date(event.end_ts);

	if (now >= start && now <= end) {
		const minutesRemaining = Math.round((end.getTime() - now.getTime()) / 60000);
		if (minutesRemaining < 60) {
			return { label: `${minutesRemaining}m left`, isSoon: false, isNow: true };
		}
		const hours = Math.floor(minutesRemaining / 60);
		const mins = minutesRemaining % 60;
		return { label: `${hours}h ${mins}m left`, isSoon: false, isNow: true };
	} else if (start > now) {
		const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);
		if (minutesUntil <= 5) {
			return { label: 'Starting now', isSoon: true, isNow: false };
		}
		if (minutesUntil < 60) {
			return { label: `in ${minutesUntil}m`, isSoon: minutesUntil <= 15, isNow: false };
		}
		if (minutesUntil < 180) {
			const hours = Math.floor(minutesUntil / 60);
			return { label: `in ${hours}h`, isSoon: false, isNow: false };
		}
	}
	return null;
}

function isZoomMeeting(event: CalendarEvent): boolean {
	const text = `${event.summary} ${event.location || ''}`.toLowerCase();
	return text.includes('zoom') || text.includes('meet.google') || text.includes('teams');
}

// ==========================================
// COMPONENT
// ==========================================

export function CalendarWidgetContent() {
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [currentTime, setCurrentTime] = useState<Date>(new Date());
	const { openAppWindow } = useWindowStore();

	const loadEvents = useCallback(async () => {
		try {
			const today = new Date();
			const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
			const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

			const data = await fetchCalendarEvents({
				fromDate: todayStart.toISOString(),
				toDate: todayEnd.toISOString(),
				usePreferred: false,
				limit: 200,
			});

			const todaysEvents = (data.events || [])
				.filter(event => eventSpansDateRange(event, todayStart, todayEnd))
				.sort((a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime());

			setEvents(todaysEvents);
		} catch (err) {
			console.error('Failed to load calendar:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadEvents();
		const timeInterval = setInterval(() => setCurrentTime(new Date()), 60000);
		const loadInterval = setInterval(loadEvents, 60000);
		return () => {
			clearInterval(timeInterval);
			clearInterval(loadInterval);
		};
	}, [loadEvents]);

	const allDayEvents = useMemo(() => events.filter(e => e.all_day), [events]);
	const timedEvents = useMemo(() => events.filter(e => !e.all_day), [events]);
	const currentEvent = timedEvents.find(e => isCurrentEvent(e));
	const upcomingEvents = timedEvents.filter(e => !isPastEvent(e) && !isCurrentEvent(e));
	const pastEvents = timedEvents.filter(e => isPastEvent(e));

	// Format today's date
	const todayLabel = currentTime.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
	});

	// ==========================================
	// RENDER
	// ==========================================

	// Loading
	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="w-5 h-5 animate-spin text-gray-400" />
			</div>
		);
	}

	// Empty state
	if (events.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-8 text-center">
				<div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400/10 to-indigo-400/10 border border-blue-400/20 flex items-center justify-center mb-4">
					<Calendar className="w-7 h-7 text-blue-400" />
				</div>
				<p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
					Clear schedule
				</p>
				<p className="text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-[200px]">
					No events scheduled for today
				</p>
				<button
					onClick={() => openAppWindow('calendar')}
					className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-400 to-indigo-400 rounded-lg hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
				>
					Open Calendar
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Date header */}
			<div className="px-3 py-2.5 bg-gradient-to-b from-gray-50 to-white dark:from-white/5 dark:to-transparent border-b border-gray-100/80 dark:border-white/5">
				<div className="flex items-center justify-between">
					<span className="text-xs font-semibold text-gray-900 dark:text-white">
						{todayLabel}
					</span>
					<span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 tabular-nums">
						{timedEvents.length} events
					</span>
				</div>
			</div>

			{/* Events */}
			<div className="flex-1 overflow-auto">
				{/* All-day events */}
				{allDayEvents.length > 0 && (
					<div className="p-2 space-y-1">
						{allDayEvents.map((event, i) => (
							<div
								key={`allday-${i}`}
								className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20"
							>
								<Calendar className="w-3.5 h-3.5 text-blue-500" />
								<span className="text-xs font-medium text-blue-600 dark:text-blue-400">
									All day
								</span>
								<span className="flex-1 truncate text-xs text-gray-900 dark:text-white">
									{event.summary}
								</span>
							</div>
						))}
					</div>
				)}

				{/* Current event (hero) */}
				{currentEvent && (
					<div className="p-2.5">
						<div className="p-3.5 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-400 text-white shadow-md shadow-blue-400/30">
							<div className="flex items-center gap-2 mb-2.5">
								<div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-sm" />
								<span className="text-[10px] font-semibold uppercase tracking-wider opacity-90">
									Happening now
								</span>
							</div>
							<div className="font-semibold mb-1.5 text-[15px]">{currentEvent.summary}</div>
							<div className="flex items-center gap-3 text-xs opacity-85">
								<span className="flex items-center gap-1">
									<Clock className="w-3 h-3" />
									{formatTimeRange(currentEvent.start_ts, currentEvent.end_ts)}
								</span>
								{currentEvent.location && (
									<span className="flex items-center gap-1 truncate">
										{isZoomMeeting(currentEvent) ? (
											<Video className="w-3 h-3" />
										) : (
											<MapPin className="w-3 h-3" />
										)}
										<span className="truncate">{currentEvent.location}</span>
									</span>
								)}
							</div>
						</div>
					</div>
				)}

				{/* Upcoming */}
				{upcomingEvents.length > 0 && (
					<div className="p-2 pt-0 space-y-1">
						{!currentEvent && (
							<div className="px-1 py-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
								Coming up
							</div>
						)}
						{upcomingEvents.slice(0, currentEvent ? 3 : 5).map((event, i) => (
							<EventItem key={i} event={event} />
						))}
					</div>
				)}

				{/* Past */}
				{pastEvents.length > 0 && upcomingEvents.length === 0 && !currentEvent && (
					<div className="p-2 space-y-1 opacity-50">
						<div className="flex items-center gap-2 py-1.5 px-1">
							<div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
							<span className="text-[10px] text-gray-400">passed</span>
							<div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
						</div>
						{pastEvents.slice(-2).map((event, i) => (
							<EventItem key={i} event={event} />
						))}
					</div>
				)}
			</div>

			{/* Footer */}
			<button
				onClick={() => openAppWindow('calendar')}
				className="flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-white/5 border-t border-gray-100/80 dark:border-white/5 transition-all hover:scale-[1.01]"
			>
				Full calendar
				<ChevronRight className="w-3 h-3" />
			</button>
		</div>
	);
}

// ==========================================
// EVENT ITEM
// ==========================================

interface EventItemProps {
	event: CalendarEvent;
}

function EventItem({ event }: EventItemProps) {
	const isPast = isPastEvent(event);
	const timing = getEventTiming(event);
	const isZoom = isZoomMeeting(event);

	return (
		<div
			className={`
				flex items-start gap-2 px-2 py-2 rounded-lg transition-colors
				${isPast
					? 'opacity-40'
					: 'bg-white dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10'
				}
			`}
		>
			{/* Time */}
			<div className="flex-shrink-0 w-14 text-right">
				<span className={`text-xs tabular-nums ${
					timing?.isSoon ? 'text-amber-500 font-medium' : 'text-gray-500 dark:text-gray-400'
				}`}>
					{formatTime(event.start_ts)}
				</span>
			</div>

			{/* Details */}
			<div className="flex-1 min-w-0">
				<div className={`text-sm ${isPast ? '' : 'text-gray-900 dark:text-white'}`}>
					{event.summary}
				</div>
				{event.location && (
					<div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
						{isZoom ? <Video className="w-2.5 h-2.5" /> : <MapPin className="w-2.5 h-2.5" />}
						<span className="truncate">{event.location}</span>
					</div>
				)}
			</div>

			{/* Timing badge */}
			{timing && !isPast && (
				<span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
					timing.isSoon
						? 'bg-amber-500/10 text-amber-500'
						: timing.isNow
						? 'bg-blue-500/10 text-blue-500'
						: 'text-gray-400 dark:text-gray-500'
				}`}>
					{timing.label}
				</span>
			)}
		</div>
	);
}

export default CalendarWidgetContent;
