'use client';

import { useClaudeStatusQuery } from '@/hooks/queries';

export function ClaudeStatus() {
	const { data } = useClaudeStatusQuery();

	if (!data?.statusText) return null;

	return (
		<span className="text-[12px] text-[var(--text-tertiary)] truncate max-w-[200px]" title={data.statusText}>
			{data.statusText}
		</span>
	);
}
