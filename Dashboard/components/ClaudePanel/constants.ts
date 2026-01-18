/**
 * ClaudePanel Constants
 * 
 * All configuration, role mappings, and static data for the ClaudePanel.
 */

import type { LucideIcon } from 'lucide-react';
import { Briefcase, Code2, HelpCircle, Lightbulb, Target } from 'lucide-react';

// =============================================================================
// PANEL DIMENSIONS
// =============================================================================

export const MIN_PANEL_WIDTH = 320;
export const MAX_PANEL_WIDTH = 800;
export const DEFAULT_PANEL_WIDTH = 440;
export const MINIMIZED_PANEL_WIDTH = 52;

// =============================================================================
// STORAGE KEYS
// =============================================================================

export const PANEL_WIDTH_KEY = 'claude-panel-width';

// =============================================================================
// FILE LIMITS
// =============================================================================

export const MAX_PREVIEW_BYTES = 20000;
export const MAX_PREVIEW_CHARS = 2000;
export const INBOX_PATH = 'Inbox';

// =============================================================================
// API
// =============================================================================

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// =============================================================================
// ROLE CONFIGURATION
// =============================================================================

export const ROLE_NAMES: Record<string, string> = {
	chief: 'Chief',
	builder: 'Builder',
	focus: 'Focus',
	project: 'Project',
	idea: 'Idea',
	interviewer: 'Interviewer',
};

export interface RoleIconConfig {
	icon: LucideIcon | null;
	color: string;
	isLogo?: boolean;
}

/**
 * @deprecated Use dynamic role config from useRolesQuery() hook instead.
 * See lib/roleConfig.ts and hooks/queries/useRolesQuery.ts for dynamic approach.
 * ClaudePanel components have been migrated to use the new system.
 */
export const ROLE_ICONS: Record<string, RoleIconConfig> = {
	chief: { icon: null, color: 'text-[#da7756]', isLogo: true },
	builder: { icon: Code2, color: 'text-blue-500' },
	'deep-work': { icon: Target, color: 'text-green-500' },
	project: { icon: Briefcase, color: 'text-purple-500' },
	idea: { icon: Lightbulb, color: 'text-yellow-500' },
};

// =============================================================================
// BREAK MESSAGES (Empty State)
// =============================================================================

export interface BreakMessage {
	headline: string;
	subtext: string;
	icon: string;
}

export const BREAK_MESSAGES: BreakMessage[] = [
	{ headline: "We'll be right back", subtext: "Claude is grabbing a coffee ☕", icon: "☕" },
	{ headline: "Technical Difficulties", subtext: "Just kidding, Chief is stretching its neural networks", icon: "🧘" },
	{ headline: "Please Stand By", subtext: "Recalibrating the vibes...", icon: "📺" },
	{ headline: "Gone Fishing", subtext: "Back in a few tokens", icon: "🎣" },
	{ headline: "BRB", subtext: "Consulting the ancient scrolls of documentation", icon: "📜" },
	{ headline: "Loading Personality", subtext: "Injecting wit and charm...", icon: "✨" },
	{ headline: "Out to Lunch", subtext: "Probably at In-N-Out with the other AI models", icon: "🍔" },
	{ headline: "Intermission", subtext: "Brought to you by Anthropic™", icon: "🎬" },
	{ headline: "Context Window Cleaning", subtext: "Dusting off the attention heads", icon: "🧹" },
	{ headline: "Rebooting Enthusiasm", subtext: "Enthusiasm levels: recharging...", icon: "🔋" },
];

// =============================================================================
// CLAUDE LOGO (SVG Path)
// =============================================================================

export const CLAUDE_LOGO_PATH = "m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z";

