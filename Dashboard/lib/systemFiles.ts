/**
 * Shared constants for Claude system files
 *
 * Special files managed by Claude that should be protected from deletion/rename
 * and displayed with a Claude badge in the UI.
 */

// Claude system files (orange + badge)
export const CLAUDE_SYSTEM_FILES = new Set([
	'TODAY.md',
	'MEMORY.md',
	'IDENTITY.md',
	'SYSTEM-INDEX.md',
]);

// Claude system folders (orange + badge)
// Note: This is a fallback - prefer using isSystem from API response
export const CLAUDE_SYSTEM_FOLDERS = new Set([
	'sessions',
	'working',
	'logs',
	'conversations',
]);

/**
 * Check if a file is a protected Claude system file
 */
export function isProtectedFile(name: string): boolean {
	return CLAUDE_SYSTEM_FILES.has(name);
}
