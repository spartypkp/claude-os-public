'use client';

import type { ContextWarning } from '@/hooks/useClaudeConversation';
import { AlertTriangle, RotateCcw, Zap } from 'lucide-react';

interface ContextWarningBannerProps {
	warning: ContextWarning;
	onCompact?: () => void;
	onReset?: () => void;
}

/**
 * Context warning banner that appears when Claude Code detects low context.
 * 
 * This uses the authoritative warning from Claude Code's native
 * "Context low (X% remaining)" message, NOT our custom statusline calculation.
 * 
 * Shows:
 * - Warning level (low vs critical)
 * - Percentage remaining
 * - Action buttons (/compact, Reset)
 */
export function ContextWarningBanner({ warning, onCompact, onReset }: ContextWarningBannerProps) {
	const isCritical = warning.percentRemaining <= 10;

	return (
		<div
			className={`
        px-3 py-2 flex items-center gap-2
        ${isCritical
					? 'bg-red-500/10 border-b border-red-500/20'
					: 'bg-amber-500/10 border-b border-amber-500/20'
				}
      `}
		>
			{/* Warning icon */}
			<AlertTriangle
				className={`w-4 h-4 flex-shrink-0 ${isCritical ? 'text-red-500' : 'text-amber-500'}`}
			/>

			{/* Warning message */}
			<span
				className={`text-xs flex-1 ${isCritical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
			>
				Context {isCritical ? 'critical' : 'low'} ({warning.percentRemaining}% remaining)
			</span>

			{/* Action buttons */}
			<div className="flex items-center gap-1.5 flex-shrink-0">
				{onCompact && (
					<button
						onClick={onCompact}
						className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium
              transition-colors
              ${isCritical
								? 'bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30'
								: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
							}
            `}
					>
						<Zap className="w-3 h-3" />
						/compact
					</button>
				)}

				{warning.shouldForceReset && onReset && (
					<button
						onClick={onReset}
						className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
					>
						<RotateCcw className="w-3 h-3" />
						Reset
					</button>
				)}
			</div>
		</div>
	);
}

export default ContextWarningBanner;

