'use client';

import { useMemo } from 'react';
import { usePrioritiesQuery } from '@/hooks/queries';

export function PriorityBadge() {
	const { data } = usePrioritiesQuery();

	const { completed, total } = useMemo(() => {
		if (!data) return { completed: 0, total: 0 };
		const all = [
			...(data.priorities.critical || []),
			...(data.priorities.medium || []),
			...(data.priorities.low || []),
		];
		return {
			completed: all.filter((p: { completed: boolean }) => p.completed).length,
			total: all.length,
		};
	}, [data]);

	if (total === 0) return null;

	const allDone = completed === total;
	const remaining = total - completed;

	return (
		<span className={`text-[11px] tabular-nums font-medium ${
			allDone
				? 'text-green-500'
				: remaining > 0
				? 'text-[var(--text-secondary)]'
				: 'text-[var(--text-muted)]'
		}`}>
			{allDone ? `${total}/${total}` : `${remaining} left`}
		</span>
	);
}
