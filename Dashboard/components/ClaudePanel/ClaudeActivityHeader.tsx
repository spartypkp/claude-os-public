'use client';

import type { ClaudeActivity } from '@/hooks/useClaudeConversation';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

// Claude-style activity icons - we cycle through these ourselves
const ACTIVITY_ICONS = ['✳', '✢', '✽', '⏺', '◆', '●'];

interface ClaudeActivityHeaderProps {
	activity: ClaudeActivity;
}

/**
 * Task header showing Claude's current context/task.
 * 
 * Displays the "cute message" from Claude Code (e.g., "Creating backend Roles Core App")
 * This goes right above the chat area.
 */
export function ClaudeActivityHeader({ activity }: ClaudeActivityHeaderProps) {
	// Only show when Claude is actively working (not idle)
	// lastTask persists in pane title even after Claude finishes - don't use it
	if (!activity.activeTask) {
		return null;
	}

	return (
		<div className="px-3 py-1.5 bg-[var(--surface-muted)]/30 border-b border-[var(--border-subtle)]">
			<div className="flex items-center gap-2">
				<span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-medium">
					Context
				</span>
				<span className="text-xs text-[var(--text-secondary)] truncate">
					{activity.activeTask}
				</span>
			</div>
		</div>
	);
}

/**
 * Thinking indicator shown at the bottom of chat transcript.
 * 
 * Shows animated dots and metadata (elapsed time, tokens) when Claude is thinking.
 */
interface ThinkingIndicatorProps {
	activity: ClaudeActivity;
}

export function ThinkingIndicator({ activity }: ThinkingIndicatorProps) {
	// Show when thinking OR has active task
	if (!activity.isThinking && !activity.activeTask) {
		return null;
	}

	return (
		<div className="flex items-center gap-2 py-2">
			{/* Claude avatar with spinner */}
			<div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#da7756] to-[#C15F3C] flex items-center justify-center flex-shrink-0">
				<Loader2 className="w-3 h-3 text-white animate-spin" />
			</div>

			{/* Simple thinking text with animated dots */}
			<span className="text-xs text-[var(--text-muted)]">Thinking</span>
			<span className="flex gap-0.5">
				<span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
				<span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
				<span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
			</span>
		</div>
	);
}

/**
 * Cute Claude message banner - shows above the input box when Claude is working.
 * 
 * Displays the active task with animated indicator and metadata.
 * e.g., "✳ Creating backend Roles Core App · 1m 40s · ↓2.4k tokens"
 */
interface ActiveTaskBannerProps {
	activity: ClaudeActivity;
}

export function ActiveTaskBanner({ activity }: ActiveTaskBannerProps) {
	const [iconIndex, setIconIndex] = useState(0);

	// Cycle through icons while active
	useEffect(() => {
		if (!activity.activeTask) return;

		const interval = setInterval(() => {
			setIconIndex(i => (i + 1) % ACTIVITY_ICONS.length);
		}, 400); // Cycle every 400ms for smooth animation

		return () => clearInterval(interval);
	}, [activity.activeTask]);

	// Show when there's an active task (Claude is working)
	if (!activity.activeTask) {
		return null;
	}

	return (
		<div className="px-2.5 py-1.5 bg-gradient-to-r from-[#da7756]/10 to-transparent border-t border-[var(--border-subtle)]">
			<div className="flex items-center gap-2">
				{/* Cycling activity icon */}
				<span className="text-[#da7756] w-4 text-center transition-all duration-150">
					{ACTIVITY_ICONS[iconIndex]}
				</span>

				{/* Task name */}
				<span className="text-xs text-[var(--text-secondary)] truncate flex-1">
					{activity.activeTask}
				</span>

				{/* Metadata */}
				<div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] tabular-nums flex-shrink-0">
					{activity.elapsedTime && (
						<span>{activity.elapsedTime}</span>
					)}
					{activity.tokenCount && (
						<>
							<span>·</span>
							<span>↓ {activity.tokenCount}</span>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

export default ClaudeActivityHeader;
