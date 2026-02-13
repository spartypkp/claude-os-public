'use client';

import type { ConversationActivity } from '@/hooks/useConversation';
import { useEffect, useState } from 'react';

const ACTIVITY_ICONS = ['✳', '✢', '✽', '⏺', '◆', '●'];

/**
 * Cute Claude message banner - shows above the input box when Claude is working.
 *
 * Displays the active task with animated indicator.
 * e.g., "✳ Creating backend Roles Core App"
 */
interface ActiveTaskBannerProps {
	activity: ConversationActivity;
}

export function ActiveTaskBanner({ activity }: ActiveTaskBannerProps) {
	const [iconIndex, setIconIndex] = useState(0);

	useEffect(() => {
		if (!activity.activeTask) return;

		const interval = setInterval(() => {
			setIconIndex(i => (i + 1) % ACTIVITY_ICONS.length);
		}, 400);

		return () => clearInterval(interval);
	}, [activity.activeTask]);

	if (!activity.activeTask) {
		return null;
	}

	return (
		<div className="px-2.5 py-1.5 bg-gradient-to-r from-[#da7756]/10 to-transparent border-t border-[var(--border-subtle)]">
			<div className="flex items-center gap-2">
				<span className="text-[#da7756] w-4 text-center transition-all duration-150">
					{ACTIVITY_ICONS[iconIndex]}
				</span>
				<span className="text-xs text-[var(--text-secondary)] truncate">
					{activity.activeTask}
				</span>
			</div>
		</div>
	);
}
