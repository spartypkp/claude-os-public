/**
 * Error Message Bank
 *
 * Fun, on-brand messages for error states.
 * Same spirit as ClaudePanel's BREAK_MESSAGES.
 */

export interface ErrorMessage {
	headline: string;
	subtext: string;
	icon: string;
}

export const ERROR_MESSAGES: ErrorMessage[] = [
	{ headline: 'Recalibrating...', subtext: 'Claude was just here, things are settling', icon: '🔧' },
	{ headline: 'Under Construction', subtext: 'Components are being rebuilt. Stand by.', icon: '🏗️' },
	{ headline: 'Plot Twist', subtext: 'This component has opinions about rendering', icon: '🎭' },
	{ headline: 'Context Window Cleaning', subtext: 'Dusting off the attention heads', icon: '🧹' },
	{ headline: 'Technical Difficulties', subtext: 'Please stand by while Claude fixes this', icon: '📺' },
	{ headline: 'Consulting the Docs', subtext: 'Gone to read the ancient scrolls of documentation', icon: '📜' },
	{ headline: 'Reticulating Splines', subtext: 'This component needs a moment to collect itself', icon: '🌀' },
	{ headline: 'Intermission', subtext: 'Grab a coffee, this will sort itself out', icon: '☕' },
	{ headline: 'Loading Personality', subtext: 'Injecting wit and charm into error handling...', icon: '🧠' },
	{ headline: 'BRB', subtext: 'Back in a few render cycles', icon: '🔄' },
];

/** Get a stable random message based on error content (same error = same message) */
export function getErrorMessage(error?: Error): ErrorMessage {
	if (!error) return ERROR_MESSAGES[0];
	// Simple hash from error message for stable selection
	let hash = 0;
	const str = error.message || '';
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
	}
	return ERROR_MESSAGES[Math.abs(hash) % ERROR_MESSAGES.length];
}
