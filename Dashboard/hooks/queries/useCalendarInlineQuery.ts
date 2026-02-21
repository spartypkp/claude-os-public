'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

interface CalendarEvent {
	summary: string;
	start_ts: string;
	end_ts: string;
	all_day: boolean;
}

interface CalendarInlineData {
	label: string | null;
}

async function fetchCalendarInline(): Promise<CalendarInlineData> {
	const today = new Date();
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

	const res = await fetch(
		`${API_BASE}/api/calendar/events?from_date=${start.toISOString()}&to_date=${end.toISOString()}&use_preferred=true&limit=50`
	);
	if (!res.ok) return { label: null };
	const data = await res.json();

	const events = (data.events || [])
		.filter((e: CalendarEvent) => !e.all_day)
		.sort((a: CalendarEvent, b: CalendarEvent) =>
			new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime()
		);

	const now = new Date();

	// Current event?
	const current = events.find((e: CalendarEvent) => {
		const s = new Date(e.start_ts);
		const en = new Date(e.end_ts);
		return now >= s && now <= en;
	});

	if (current) {
		const minutesLeft = Math.round(
			(new Date(current.end_ts).getTime() - now.getTime()) / 60000
		);
		const timeStr = minutesLeft < 60
			? `${minutesLeft}m left`
			: `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`;
		const title = current.summary.length > 20
			? current.summary.slice(0, 18) + '...'
			: current.summary;
		return { label: `Now: ${title} (${timeStr})` };
	}

	// Next upcoming?
	const upcoming = events.find((e: CalendarEvent) =>
		new Date(e.start_ts) > now
	);

	if (upcoming) {
		const time = new Date(upcoming.start_ts).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});
		const title = upcoming.summary.length > 18
			? upcoming.summary.slice(0, 16) + '...'
			: upcoming.summary;
		return { label: `Next: ${title} \u2014 ${time}` };
	}

	return { label: null };
}

/**
 * Hook for calendar inline label in menubar.
 * SSE-invalidated via calendar.* events + 60s fallback for countdown updates.
 */
export function useCalendarInlineQuery() {
	return useQuery({
		queryKey: [...queryKeys.calendarEvents, 'inline'] as const,
		queryFn: fetchCalendarInline,
		refetchInterval: 60000,
	});
}
