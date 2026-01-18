/**
 * Shared folder categorization for consistent colors across Desktop and Finder
 */

import { FileTreeNode } from '@/lib/types';
import { CLAUDE_SYSTEM_FOLDERS } from '@/lib/systemFiles';

export type FolderCategory = 'claude-system' | 'custom-app' | 'project' | 'regular';

// Color classes for each category
export const FOLDER_COLORS: Record<FolderCategory, string> = {
	'claude-system': 'text-[#DA7756]',  // Orange
	'custom-app': 'text-[#3B82F6]',     // Blue
	'project': 'text-[#22C55E]',        // Green
	'regular': 'text-gray-700 dark:text-gray-400', // Black/Gray
};

/**
 * Determine the semantic category of a folder for coloring
 */
export function getFolderCategory(node: FileTreeNode): FolderCategory {
	const name = node.name;
	const path = node.path;

	// Claude system folders (orange + badge, read-only)
	// Use isSystem from API if available, fallback to hardcoded check
	if (node.isSystem || CLAUDE_SYSTEM_FOLDERS.has(name)) {
		return 'claude-system';
	}

	// Projects folder or its contents
	if (name === 'projects' || path.startsWith('Desktop/projects/')) {
		return 'project';
	}

	// Custom apps: folder that DIRECTLY contains APP-SPEC.md
	if (node.type === 'directory' && node.children) {
		const hasAppSpec = node.children.some(c => c.name === 'APP-SPEC.md');
		if (hasAppSpec) return 'custom-app';
	}

	return 'regular';
}

/**
 * Get the color class for a folder based on its category
 */
export function getFolderColorClass(node: FileTreeNode): string {
	const category = getFolderCategory(node);
	return FOLDER_COLORS[category];
}
