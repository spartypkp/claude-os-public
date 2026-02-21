'use client';

import { useEffect, useState } from 'react';

export function Clock() {
	const [time, setTime] = useState<string>('');

	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			const formatted = now.toLocaleTimeString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true,
			});
			setTime(formatted);
		};

		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, []);

	return (
		<span data-testid="menubar-clock" className="text-[13px] text-[var(--text-primary)] font-medium">
			{time}
		</span>
	);
}
