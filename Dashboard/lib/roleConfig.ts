/**
 * Role Configuration Utilities
 *
 * Provides icon mapping and Tailwind class generation from role display metadata.
 * Works with dynamic role data from the backend API.
 */

import type { LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import type { Role } from '@/hooks/queries/useRolesQuery';

// ==========================================
// ICON MAPPING
// ==========================================

/**
 * Maps icon names from role metadata to Lucide components.
 * Add new mappings here as roles are added.
 */
const ICON_MAP: Record<string, LucideIcon> = {
	'crown': Icons.Crown,
	'code-2': Icons.Code2,
	'terminal': Icons.Terminal,
	'target': Icons.Target,
	'briefcase': Icons.Briefcase,
	'lightbulb': Icons.Lightbulb,
	'users': Icons.Users,
	'crosshair': Icons.Crosshair,
};

/**
 * Get Lucide icon component from icon name.
 * Returns Crosshair icon as fallback if icon not found.
 */
export function getRoleIcon(iconName: string): LucideIcon {
	return ICON_MAP[iconName] || Icons.Crosshair;
}

// ==========================================
// COLOR UTILITIES
// ==========================================

/**
 * Precomputed Tailwind color maps for each base color.
 *
 * Using precomputed maps instead of template literals ensures
 * Tailwind includes these classes in the build.
 */
const COLOR_MAPS: Record<string, {
	text: string;
	bg: string;
	ring: string;
	gradient: string;
	gradientFrom: string;
	gradientTo: string;
}> = {
	amber: {
		text: 'text-amber-400',
		bg: 'bg-amber-500/10',
		ring: 'ring-amber-500/30',
		gradient: 'from-amber-400 to-amber-600',
		gradientFrom: 'from-amber-400',
		gradientTo: 'to-amber-600',
	},
	cyan: {
		text: 'text-cyan-400',
		bg: 'bg-cyan-500/10',
		ring: 'ring-cyan-500/30',
		gradient: 'from-cyan-400 to-cyan-600',
		gradientFrom: 'from-cyan-400',
		gradientTo: 'to-cyan-600',
	},
	purple: {
		text: 'text-purple-400',
		bg: 'bg-purple-500/10',
		ring: 'ring-purple-500/30',
		gradient: 'from-purple-400 to-purple-600',
		gradientFrom: 'from-purple-400',
		gradientTo: 'to-purple-600',
	},
	blue: {
		text: 'text-blue-400',
		bg: 'bg-blue-500/10',
		ring: 'ring-blue-500/30',
		gradient: 'from-blue-400 to-blue-600',
		gradientFrom: 'from-blue-400',
		gradientTo: 'to-blue-600',
	},
	green: {
		text: 'text-green-400',
		bg: 'bg-green-500/10',
		ring: 'ring-green-500/30',
		gradient: 'from-green-400 to-green-600',
		gradientFrom: 'from-green-400',
		gradientTo: 'to-green-600',
	},
	orange: {
		text: 'text-[var(--color-claude)]',           // Claude's terra cotta
		bg: 'bg-[var(--color-claude-dim)]',
		ring: 'ring-[var(--color-claude)]/30',
		gradient: 'from-[var(--color-claude)] to-[var(--color-claude-dark)]',
		gradientFrom: 'from-[var(--color-claude)]',
		gradientTo: 'to-[var(--color-claude-dark)]',
	},
};

/**
 * Get Tailwind color classes from base color name.
 * Returns amber colors as fallback if color not found.
 */
export function getRoleColors(baseColor: string) {
	return COLOR_MAPS[baseColor] || COLOR_MAPS.amber;
}

// ==========================================
// COMPLETE CONFIG
// ==========================================

export interface RoleConfig {
	label: string;
	icon: LucideIcon | null;
	isLogo?: boolean;
	color: string;      // text color class
	bgColor: string;    // background color class
	ringColor: string;  // ring color class
	gradient: string;   // gradient classes
}

/**
 * Get complete role configuration from Role object.
 * This is the main function consumers should use.
 */
export function getRoleConfig(role: Role): RoleConfig {
	const { icon: iconName, color: baseColor, is_logo } = role.display;
	const colors = getRoleColors(baseColor);

	return {
		label: role.name,
		icon: is_logo ? null : getRoleIcon(iconName),
		isLogo: is_logo,
		color: colors.text,
		bgColor: colors.bg,
		ringColor: colors.ring,
		gradient: colors.gradient,
	};
}

/**
 * Helper to find role by slug from roles array.
 * Returns undefined if not found.
 */
export function findRole(roles: Role[] | undefined, slug: string): Role | undefined {
	return roles?.find(r => r.slug === slug);
}

/**
 * Get role config by slug from roles array.
 * Returns null if role not found (consumer can handle fallback).
 */
export function getRoleConfigBySlug(roles: Role[] | undefined, slug: string): RoleConfig | null {
	const role = findRole(roles, slug);
	return role ? getRoleConfig(role) : null;
}
