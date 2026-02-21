'use client';

import { useEmailBadgeQuery } from '@/hooks/queries';

export function EmailBadge() {
	const { data } = useEmailBadgeQuery();

	const count = data?.unread_count ?? 0;
	if (count === 0) return null;

	return (
		<span className="min-w-[16px] h-[14px] px-1 rounded-full bg-sky-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
			{count}
		</span>
	);
}
