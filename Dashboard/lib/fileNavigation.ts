/**
 * File navigation utilities for opening Finder at specific locations.
 * Works with absolute paths from the file tree.
 */

import { toDesktopRelative } from './pathUtils';

interface WindowActions {
	openAppWindow: (appType: 'finder', initialPath?: string) => void;
}

/**
 * Opens Finder window at the location of a file or folder.
 *
 * @param filePath - Absolute path or Desktop-relative path
 * @param windowActions - Window store actions
 */
export function showInFinder(filePath: string, windowActions: WindowActions) {
	const relative = toDesktopRelative(filePath);
	const parts = relative.split('/').filter(Boolean);

	if (parts.length <= 1) {
		// At Desktop root or single item - open root
		windowActions.openAppWindow('finder', '');
		return;
	}

	// Open parent directory
	const parentPath = parts.slice(0, -1).join('/');
	windowActions.openAppWindow('finder', parentPath);
}

/**
 * Opens Finder window at a specific folder path.
 *
 * @param folderPath - Path relative to Desktop/
 * @param windowActions - Window store actions
 */
export function openFinderAt(folderPath: string, windowActions: WindowActions) {
	windowActions.openAppWindow('finder', folderPath);
}

/**
 * Gets the parent folder path from a file path.
 *
 * @param filePath - Absolute path or Desktop-relative path
 * @returns Parent folder path relative to Desktop/, or '' for root
 */
export function getParentPath(filePath: string): string {
	const relative = toDesktopRelative(filePath);
	const parts = relative.split('/').filter(Boolean);

	if (parts.length <= 1) {
		return ''; // Root or single item at root
	}

	return parts.slice(0, -1).join('/');
}

/**
 * Checks if a path is at Desktop root (no subfolders).
 *
 * @param filePath - Absolute path or Desktop-relative path
 * @returns True if at root level
 */
export function isAtDesktopRoot(filePath: string): boolean {
	const relative = toDesktopRelative(filePath);
	const parts = relative.split('/').filter(Boolean);
	return parts.length <= 1;
}
