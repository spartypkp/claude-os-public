import { fetchFileContent, updateFileContent } from '@/lib/api';
import { create } from 'zustand';

/**
 * File status for tracking state during editing.
 */
export type FileStatus =
	| 'clean'    // File content matches disk
	| 'dirty'    // User has made changes
	| 'saving'   // Currently saving to disk
	| 'conflict' // External modification detected
	| 'error';   // Save failed

/**
 * State for a single open file.
 */
export interface FileState {
	path: string;
	content: string;
	mtime: string;          // Last known mtime from server
	status: FileStatus;
	originalContent?: string;  // For rollback on error
	externalMtime?: string;    // mtime of external change (for conflict resolution)
}

/**
 * Conflict resolution options.
 */
export type ConflictResolution = 'keep_mine' | 'use_external' | 'merge';

/**
 * Desktop file management store.
 *
 * Handles:
 * - Loading file content with mtime
 * - Tracking dirty state during editing
 * - Optimistic saves with conflict detection
 * - External change handling via SSE events
 */
interface DesktopStore {
	// =========================================
	// STATE
	// =========================================

	/** Map of path -> file state for all loaded files */
	files: Map<string, FileState>;

	/** Currently selected file path (for single-file views) */
	activeFilePath: string | null;

	/** Global error message */
	error: string | null;

	// =========================================
	// ACTIONS - File Loading
	// =========================================

	/**
	 * Load a file from the server.
	 * Sets status to 'clean' after loading.
	 */
	loadFile: (path: string) => Promise<void>;

	/**
	 * Get a file's state (if loaded).
	 */
	getFile: (path: string) => FileState | undefined;

	/**
	 * Set the active file path.
	 */
	setActiveFile: (path: string | null) => void;

	// =========================================
	// ACTIONS - Editing
	// =========================================

	/**
	 * Update file content locally (marks as dirty).
	 * Does NOT save to server.
	 */
	setFileContent: (path: string, content: string) => void;

	/**
	 * Mark a file as dirty with new content.
	 * Preserves original content for rollback.
	 */
	markDirty: (path: string, newContent: string) => void;

	// =========================================
	// ACTIONS - Saving
	// =========================================

	/**
	 * Save file to server with conflict detection.
	 * Uses expected_mtime to detect concurrent modifications.
	 *
	 * @returns true if saved successfully, false if conflict or error
	 */
	saveFile: (path: string) => Promise<boolean>;

	/**
	 * Force save, ignoring conflicts (Keep Mine).
	 */
	forceSaveFile: (path: string) => Promise<boolean>;

	// =========================================
	// ACTIONS - Conflict Handling
	// =========================================

	/**
	 * Handle external file change notification from SSE.
	 *
	 * If file is clean: auto-refresh
	 * If file is dirty: mark as conflict
	 */
	handleExternalChange: (path: string, newMtime: string) => void;

	/**
	 * Resolve a conflict.
	 */
	resolveConflict: (path: string, resolution: ConflictResolution) => Promise<void>;

	/**
	 * Rollback to original content (discard changes).
	 */
	rollback: (path: string) => void;

	// =========================================
	// ACTIONS - Cleanup
	// =========================================

	/**
	 * Remove a file from the store.
	 */
	closeFile: (path: string) => void;

	/**
	 * Clear all files.
	 */
	clearAll: () => void;

	/**
	 * Set error message.
	 */
	setError: (error: string | null) => void;
}

export const useDesktopStore = create<DesktopStore>((set, get) => ({
	files: new Map(),
	activeFilePath: null,
	error: null,

	// =========================================
	// FILE LOADING
	// =========================================

	loadFile: async (path) => {
		try {
			const response = await fetchFileContent(path);

			set((state) => {
				const newFiles = new Map(state.files);
				newFiles.set(path, {
					path,
					content: response.content,
					mtime: response.mtime || new Date().toISOString(),
					status: 'clean',
				});
				return { files: newFiles, error: null };
			});
		} catch (err) {
			set({ error: `Failed to load ${path}: ${err}` });
		}
	},

	getFile: (path) => {
		return get().files.get(path);
	},

	setActiveFile: (path) => {
		set({ activeFilePath: path });
	},

	// =========================================
	// EDITING
	// =========================================

	setFileContent: (path, content) => {
		set((state) => {
			const newFiles = new Map(state.files);
			const file = newFiles.get(path);

			if (file) {
				newFiles.set(path, {
					...file,
					content,
					status: file.status === 'conflict' ? 'conflict' : 'dirty',
					originalContent: file.originalContent ?? file.content,
				});
			}

			return { files: newFiles };
		});
	},

	markDirty: (path, newContent) => {
		set((state) => {
			const newFiles = new Map(state.files);
			const file = newFiles.get(path);

			if (file) {
				newFiles.set(path, {
					...file,
					content: newContent,
					status: 'dirty',
					originalContent: file.originalContent ?? file.content,
				});
			}

			return { files: newFiles };
		});
	},

	// =========================================
	// SAVING
	// =========================================

	saveFile: async (path) => {
		const file = get().files.get(path);
		if (!file) return false;

		// Mark as saving
		set((state) => {
			const newFiles = new Map(state.files);
			newFiles.set(path, { ...file, status: 'saving' });
			return { files: newFiles };
		});

		try {
			const response = await updateFileContent(path, file.content, file.mtime);

			if (!response.success) {
				// Check for conflict
				if (response.error === 'conflict') {
					set((state) => {
						const newFiles = new Map(state.files);
						newFiles.set(path, {
							...file,
							status: 'conflict',
							externalMtime: response.mtime,
						});
						return { files: newFiles };
					});
					return false;
				}

				// Other error
				set((state) => {
					const newFiles = new Map(state.files);
					newFiles.set(path, { ...file, status: 'error' });
					return { files: newFiles, error: response.error || 'Save failed' };
				});
				return false;
			}

			// Success - update mtime and clear dirty state
			set((state) => {
				const newFiles = new Map(state.files);
				newFiles.set(path, {
					...file,
					status: 'clean',
					mtime: response.mtime || file.mtime,
					originalContent: undefined,
				});
				return { files: newFiles, error: null };
			});

			return true;
		} catch (err) {
			set((state) => {
				const newFiles = new Map(state.files);
				newFiles.set(path, { ...file, status: 'error' });
				return { files: newFiles, error: `Save failed: ${err}` };
			});
			return false;
		}
	},

	forceSaveFile: async (path) => {
		const file = get().files.get(path);
		if (!file) return false;

		// Mark as saving
		set((state) => {
			const newFiles = new Map(state.files);
			newFiles.set(path, { ...file, status: 'saving' });
			return { files: newFiles };
		});

		try {
			// Don't send expected_mtime to force overwrite
			const response = await updateFileContent(path, file.content);

			if (!response.success) {
				set((state) => {
					const newFiles = new Map(state.files);
					newFiles.set(path, { ...file, status: 'error' });
					return { files: newFiles, error: response.error || 'Save failed' };
				});
				return false;
			}

			// Success
			set((state) => {
				const newFiles = new Map(state.files);
				newFiles.set(path, {
					...file,
					status: 'clean',
					mtime: response.mtime || new Date().toISOString(),
					originalContent: undefined,
					externalMtime: undefined,
				});
				return { files: newFiles, error: null };
			});

			return true;
		} catch (err) {
			set((state) => {
				const newFiles = new Map(state.files);
				newFiles.set(path, { ...file, status: 'error' });
				return { files: newFiles, error: `Save failed: ${err}` };
			});
			return false;
		}
	},

	// =========================================
	// CONFLICT HANDLING
	// =========================================

	handleExternalChange: (path, newMtime) => {
		const file = get().files.get(path);
		if (!file) return;

		if (file.status === 'clean') {
			// Auto-refresh since no local changes
			get().loadFile(path);
		} else if (file.status === 'dirty' || file.status === 'saving') {
			// User is editing - mark as conflict
			set((state) => {
				const newFiles = new Map(state.files);
				newFiles.set(path, {
					...file,
					status: 'conflict',
					externalMtime: newMtime,
				});
				return { files: newFiles };
			});
		}
		// If already in conflict, keep conflict state
	},

	resolveConflict: async (path, resolution) => {
		const file = get().files.get(path);
		if (!file || file.status !== 'conflict') return;

		switch (resolution) {
			case 'keep_mine':
				// Force save our version
				await get().forceSaveFile(path);
				break;

			case 'use_external':
				// Reload from server, discarding local changes
				await get().loadFile(path);
				break;

			case 'merge':
				// For now, treat merge like keep_mine
				// A real merge would need a diff view
				await get().forceSaveFile(path);
				break;
		}
	},

	rollback: (path) => {
		const file = get().files.get(path);
		if (!file || !file.originalContent) return;

		set((state) => {
			const newFiles = new Map(state.files);
			newFiles.set(path, {
				...file,
				content: file.originalContent!,
				status: 'clean',
				originalContent: undefined,
				externalMtime: undefined,
			});
			return { files: newFiles };
		});
	},

	// =========================================
	// CLEANUP
	// =========================================

	closeFile: (path) => {
		set((state) => {
			const newFiles = new Map(state.files);
			newFiles.delete(path);
			return {
				files: newFiles,
				activeFilePath: state.activeFilePath === path ? null : state.activeFilePath,
			};
		});
	},

	clearAll: () => {
		set({ files: new Map(), activeFilePath: null, error: null });
	},

	setError: (error) => {
		set({ error });
	},
}));

// =========================================
// STATE SELECTORS
// =========================================

/** Get all loaded files */
export const useFiles = () => useDesktopStore((s) => s.files);

/** Get active file path */
export const useActiveFilePath = () => useDesktopStore((s) => s.activeFilePath);

/** Get store error */
export const useDesktopError = () => useDesktopStore((s) => s.error);

/**
 * Check if any file has unsaved changes.
 */
export const useHasUnsavedChanges = () => useDesktopStore((state) => {
	for (const file of state.files.values()) {
		if (file.status === 'dirty' || file.status === 'saving' || file.status === 'conflict') {
			return true;
		}
	}
	return false;
});

/**
 * Get all files in conflict state.
 */
export const useConflictedFiles = () => useDesktopStore((state) =>
	Array.from(state.files.values()).filter((f) => f.status === 'conflict')
);

/**
 * Get the active file state (single subscription).
 */
export const useActiveFile = () => useDesktopStore((state) =>
	state.activeFilePath ? state.files.get(state.activeFilePath) : undefined
);

// =========================================
// ACTION SELECTORS
// =========================================

/** File loading actions */
export const useFileLoadActions = () => useDesktopStore((s) => ({
	loadFile: s.loadFile,
	getFile: s.getFile,
	setActiveFile: s.setActiveFile,
}));

/** File editing actions */
export const useFileEditActions = () => useDesktopStore((s) => ({
	setFileContent: s.setFileContent,
	markDirty: s.markDirty,
}));

/** File save actions */
export const useFileSaveActions = () => useDesktopStore((s) => ({
	saveFile: s.saveFile,
	forceSaveFile: s.forceSaveFile,
}));

/** Conflict handling actions */
export const useConflictActions = () => useDesktopStore((s) => ({
	handleExternalChange: s.handleExternalChange,
	resolveConflict: s.resolveConflict,
	rollback: s.rollback,
}));

/** Cleanup actions */
export const useFileCleanupActions = () => useDesktopStore((s) => ({
	closeFile: s.closeFile,
	clearAll: s.clearAll,
	setError: s.setError,
}));
