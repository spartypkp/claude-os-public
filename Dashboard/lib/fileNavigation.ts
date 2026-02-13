/**
 * File navigation utilities for opening Finder at specific locations
 */

interface WindowActions {
	openAppWindow: (appType: 'finder', initialPath?: string) => void;
}

/**
 * Opens Finder window at the location of a file or folder.
 *
 * @param filePath - Full path including Desktop/ prefix (e.g., "Desktop/conversations/chief/spec.md")
 * @param windowActions - Window store actions
 */
export function showInFinder(filePath: string, windowActions: WindowActions) {
	// Parse path: "Desktop/conversations/chief/spec.md"
	const parts = filePath.split('/').filter(Boolean);

	// Remove "Desktop" prefix if present
	const pathParts = parts[0] === 'Desktop' ? parts.slice(1) : parts;

	if (pathParts.length === 0) {
		// Path is Desktop root
		windowActions.openAppWindow('finder', '');
		return;
	}

	if (pathParts.length === 1) {
		// File/folder at Desktop root (e.g., "Desktop/file.md")
		// Open Finder at root
		windowActions.openAppWindow('finder', '');
		return;
	}

	// File/folder in subfolder - open parent directory
	const parentPath = pathParts.slice(0, -1).join('/');
	windowActions.openAppWindow('finder', parentPath);
}

/**
 * Opens Finder window at a specific folder path.
 *
 * @param folderPath - Relative path from Desktop/ (e.g., "conversations/chief")
 * @param windowActions - Window store actions
 */
export function openFinderAt(folderPath: string, windowActions: WindowActions) {
	windowActions.openAppWindow('finder', folderPath);
}

/**
 * Gets the parent folder path from a file path.
 *
 * @param filePath - Full path including Desktop/ prefix
 * @returns Parent folder path relative to Desktop/, or '' for root
 */
export function getParentPath(filePath: string): string {
	const parts = filePath.split('/').filter(Boolean);

	// Remove "Desktop" prefix if present
	const pathParts = parts[0] === 'Desktop' ? parts.slice(1) : parts;

	if (pathParts.length <= 1) {
		return ''; // Root or single item at root
	}

	return pathParts.slice(0, -1).join('/');
}

/**
 * Checks if a path is at Desktop root (no subfolders).
 *
 * @param filePath - Full path including Desktop/ prefix
 * @returns True if at root level
 */
export function isAtDesktopRoot(filePath: string): boolean {
	const parts = filePath.split('/').filter(Boolean);
	const pathParts = parts[0] === 'Desktop' ? parts.slice(1) : parts;
	return pathParts.length <= 1;
}
