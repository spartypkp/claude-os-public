'use client';

import { useCalendarInlineQuery } from '@/hooks/queries';

export function CalendarInlineLabel() {
	const { data } = useCalendarInlineQuery();

	if (!data?.label) return null;

	return (
		<span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[180px]">
			{data.label}
		</span>
	);
}
