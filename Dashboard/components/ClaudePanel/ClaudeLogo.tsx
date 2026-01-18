'use client';

/**
 * Claude Logo Component
 * 
 * SVG Claude logo used in session icons and minimized view.
 */

import { CLAUDE_LOGO_PATH } from './constants';

interface ClaudeLogoProps {
	className?: string;
}

export function ClaudeLogo({ className = "w-4 h-4" }: ClaudeLogoProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d={CLAUDE_LOGO_PATH} />
		</svg>
	);
}

