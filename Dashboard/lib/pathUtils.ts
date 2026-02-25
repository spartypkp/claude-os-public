/**
 * Path utilities for the absolute paths system.
 *
 * The backend returns absolute paths (e.g., $HOME/claude-os/Desktop/foo.md).
 * These utilities handle conversion, display, and comparison.
 *
 * Initialized by ClaudeOS on first file tree load with actual root paths.
 * Falls back to string heuristics before initialization.
 */

// Set by ClaudeOS.loadTree() on first file tree fetch
let _repoRoot = '';
let _desktopRoot = '';

/** Initialize path roots from file tree response. Call once on app load. */
export function initPaths(repoRoot: string, desktopRoot: string) {
	_repoRoot = repoRoot.replace(/\/+$/, '');
	_desktopRoot = desktopRoot.replace(/\/+$/, '');
}

export function getRepoRoot(): string { return _repoRoot; }
export function getDesktopRoot(): string { return _desktopRoot; }

/** True if path starts with / */
export function isAbsolutePath(path: string): boolean {
	return path.startsWith('/');
}

/** True if path is within the Desktop folder. Works before init (falls back to string check). */
export function isDesktopPath(path: string): boolean {
	if (_desktopRoot) {
		return path.startsWith(_desktopRoot + '/') || path === _desktopRoot;
	}
	return path.startsWith('Desktop/') || path === 'Desktop';
}

/** True if path is within the Claude OS repo. */
export function isRepoPath(path: string): boolean {
	if (_repoRoot) {
		return path.startsWith(_repoRoot + '/') || path === _repoRoot;
	}
	return true; // Assume yes before init
}

/**
 * Get path relative to Desktop root.
 *   $HOME/claude-os/Desktop/foo.md → foo.md
 *   $HOME/claude-os/Desktop/conversations/spec.md → conversations/spec.md
 *   Desktop/foo.md → foo.md (legacy format)
 *   foo.md → foo.md (already relative)
 */
export function toDesktopRelative(path: string): string {
	if (_desktopRoot && path.startsWith(_desktopRoot + '/')) {
		return path.slice(_desktopRoot.length + 1);
	}
	if (_desktopRoot && path === _desktopRoot) {
		return '';
	}
	if (path.startsWith('Desktop/')) {
		return path.slice(8);
	}
	if (path === 'Desktop') {
		return '';
	}
	return path;
}

/**
 * Convert a Desktop-relative path to absolute.
 *   conversations/spec.md → $HOME/claude-os/Desktop/conversations/spec.md
 *   Already absolute paths are returned as-is.
 */
export function toAbsoluteDesktopPath(relativePath: string): string {
	if (isAbsolutePath(relativePath)) return relativePath;
	if (relativePath.startsWith('Desktop/')) {
		if (_repoRoot) return `${_repoRoot}/${relativePath}`;
		return relativePath; // Can't resolve without roots
	}
	if (_desktopRoot) {
		return relativePath ? `${_desktopRoot}/${relativePath}` : _desktopRoot;
	}
	return relativePath ? `Desktop/${relativePath}` : 'Desktop';
}

/** Get just the filename from any path. */
export function getFileName(path: string): string {
	return path.split('/').pop() || path;
}

/** Get the parent directory path (preserves absolute/relative format). */
export function getParent(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return '';
	return parts.slice(0, -1).join('/');
}

/**
 * Get breadcrumb segments for a path.
 * Returns [{ name, fullPath }] where fullPath is absolute.
 */
export function getPathSegments(path: string): { name: string; fullPath: string }[] {
	const relative = toDesktopRelative(path);
	if (!relative) return [];

	const parts = relative.split('/').filter(Boolean);
	const segments: { name: string; fullPath: string }[] = [];

	for (let i = 0; i < parts.length; i++) {
		const partialRelative = parts.slice(0, i + 1).join('/');
		segments.push({
			name: parts[i],
			fullPath: toAbsoluteDesktopPath(partialRelative),
		});
	}

	return segments;
}

/**
 * Check if a child path is directly inside a parent path (not nested deeper).
 * Both should be absolute.
 */
export function isDirectChild(childPath: string, parentPath: string): boolean {
	const parent = parentPath.replace(/\/+$/, '');
	if (!childPath.startsWith(parent + '/')) return false;
	const rest = childPath.slice(parent.length + 1);
	return !rest.includes('/');
}

/**
 * Check if a path is at Desktop root level (direct child of Desktop/).
 */
export function isAtDesktopRoot(path: string): boolean {
	const relative = toDesktopRelative(path);
	return !relative.includes('/');
}
