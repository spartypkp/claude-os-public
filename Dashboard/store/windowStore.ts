import { getDocumentType } from '@/lib/fileTypes';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

/**
 * Core app types that can open as windows.
 */
export type CoreAppType = 'calendar' | 'finder' | 'settings' | 'contacts' | 'widgets' | 'email' | 'messages' | 'missions' | 'roles';

/**
 * Window state for a floating desktop window.
 */
export interface WindowState {
	id: string;
	filePath: string;
	title: string;
	x: number;
	y: number;
	width: number;
	height: number;
	minimized: boolean;
	/** If set, this is a Core App window (not a file viewer) */
	appType?: CoreAppType;
	/** Initial path for Finder windows (relative to Desktop/) */
	initialPath?: string;
}


/**
 * Widget state (position, size, collapsed).
 */
export interface WidgetState {
	id: string;
	type: 'priorities' | 'calendar' | 'sessions';
	x: number;
	y: number;
	width: number;
	height: number;
	collapsed: boolean;
}

/**
 * Context menu state.
 * 
 * The context menu is target-aware: the same menu renders for the same
 * item type regardless of where in the app the right-click occurred.
 */
export interface ContextMenuState {
	x: number;
	y: number;
	targetType: 'icon' | 'desktop' | 'finder-item' | 'finder-empty' | 'trash' | 'widget' | 'dock-app' | 'dock-session' | 'dock-minimized' | 'panel-chief' | 'panel-specialist' | 'panel-attachment';
	targetPath?: string; // For item context menus (files/folders)
	isDirectory?: boolean; // Is the target a directory?
	hasLifeSpec?: boolean; // Does the folder contain LIFE-SPEC.md?
	hasAppSpec?: boolean; // Does the folder contain APP-SPEC.md?
	/** Current directory for "New File/Folder" actions (used in Finder windows) */
	currentDirectory?: string;
	/** Source window ID - used to target events back to the correct Finder window */
	sourceWindowId?: string;
	/** Widget ID - for widget context menus */
	widgetId?: string;
	/** Widget type - for widget context menus */
	widgetType?: 'priorities' | 'calendar' | 'sessions';
	/** Trash item count - for trash context menu */
	trashCount?: number;
	/** Dock app info - for dock app context menus */
	dockAppId?: string;
	dockAppName?: string;
	dockAppType?: CoreAppType;
	dockAppIsRunning?: boolean;
	/** Dock session info - for dock session context menus */
	dockSessionId?: string;
	dockSessionRole?: string;
	/** Minimized window ID - for dock minimized window context menus */
	minimizedWindowId?: string;
	minimizedWindowTitle?: string;
	/** Panel session info - for Claude Panel context menus */
	panelSessionId?: string;
	panelSessionRole?: string;
	panelSessionStatus?: string;
	/** Panel attachment info - for attached file context menus */
	attachmentPath?: string;
	attachmentName?: string;
}

/**
 * Window manager store.
 * Handles windows, icons, and widgets on the desktop.
 */
interface WindowStore {
	// =========================================
	// STATE
	// =========================================

	/** Open windows */
	windows: WindowState[];

	/** Window stack order (first = front) */
	windowStack: string[];

	/** Icon display order (paths in render order). Empty = use natural file order */
	iconOrder: string[];

	/** Widget states */
	widgets: WidgetState[];

	/** Menubar widget visibility (which widgets show in menubar) */
	menubarWidgets: Set<'priorities' | 'calendar' | 'sessions'>;

	/** Selected icons */
	selectedIcons: string[];

	/** Quick Look file path (null = closed) */
	quickLookPath: string | null;

	/** Context menu state (null = closed) */
	contextMenu: ContextMenuState | null;

	/** Path of icon currently being renamed (null = not renaming) */
	renamingPath: string | null;

	/** Dark mode enabled (default: false = light mode) */
	darkMode: boolean;

	/** Saved positions for app windows (persists after close) */
	appWindowPositions: Record<CoreAppType, { x: number; y: number; width: number; height: number; }>;

	// =========================================
	// WINDOW ACTIONS
	// =========================================

	/** Open a new window for a file */
	openWindow: (filePath: string, title: string) => void;

	/** Open a Core App window */
	openAppWindow: (appType: CoreAppType, initialPath?: string) => void;

	/** Get app window by type (if already open) */
	getAppWindow: (appType: CoreAppType) => WindowState | undefined;

	/** Close a window */
	closeWindow: (id: string) => void;

	/** Bring window to front */
	focusWindow: (id: string) => void;

	/** Update window position */
	moveWindow: (id: string, x: number, y: number) => void;

	/** Update window size */
	resizeWindow: (id: string, width: number, height: number) => void;

	/** Minimize a window (hide to dock) */
	minimizeWindow: (id: string) => void;

	/** Unminimize a window (restore from dock) */
	unminimizeWindow: (id: string) => void;

	/** Get all minimized windows */
	getMinimizedWindows: () => WindowState[];

	/** Check if a Core App has any open (non-minimized) windows */
	hasOpenWindow: (appType: CoreAppType) => boolean;

	/** Get window by file path (if already open) */
	getWindowByPath: (filePath: string) => WindowState | undefined;

	/** Get z-index for a window */
	getZIndex: (id: string) => number;

	// =========================================
	// ICON ACTIONS
	// =========================================

	/** Set custom icon order (for drag reordering) */
	setIconOrder: (order: string[]) => void;

	/** Move icon to new index in order */
	reorderIcon: (fromPath: string, toIndex: number) => void;

	/** Select an icon */
	selectIcon: (path: string, multiSelect?: boolean) => void;

	/** Select all icons (needs paths to be passed in) */
	selectAll: (allPaths: string[]) => void;

	/** Clear icon selection */
	clearSelection: () => void;

	/** Open Quick Look for a file */
	openQuickLook: (path: string) => void;

	/** Close Quick Look */
	closeQuickLook: () => void;

	/** Toggle Quick Look (open if closed, close if same file, switch if different) */
	toggleQuickLook: (path: string) => void;

	/** Get the focused window ID (front of stack) */
	getFocusedWindowId: () => string | null;

	/** Get the focused window state (front of stack, non-minimized) */
	getFocusedWindow: () => WindowState | null;

	/** Close the focused window */
	closeFocusedWindow: () => void;

	// =========================================
	// CONTEXT MENU ACTIONS
	// =========================================

	/** Open context menu at position */
	openContextMenu: (x: number, y: number, targetType: ContextMenuState['targetType'], targetPath?: string, meta?: Partial<Omit<ContextMenuState, 'x' | 'y' | 'targetType' | 'targetPath'>>) => void;

	/** Close context menu */
	closeContextMenu: () => void;

	// =========================================
	// RENAME ACTIONS
	// =========================================

	/** Start renaming an icon */
	startRename: (path: string) => void;

	/** Stop renaming (cancel or complete) */
	stopRename: () => void;

	// =========================================
	// WIDGET ACTIONS
	// =========================================

	/** Add a widget */
	addWidget: (type: 'priorities' | 'calendar' | 'sessions') => void;

	/** Remove a widget */
	removeWidget: (id: string) => void;

	/** Update widget position */
	moveWidget: (id: string, x: number, y: number) => void;

	/** Update widget size */
	resizeWidget: (id: string, width: number, height: number) => void;

	/** Toggle widget collapsed */
	toggleWidgetCollapse: (id: string) => void;

	// =========================================
	// MENUBAR WIDGET ACTIONS
	// =========================================

	/** Toggle menubar widget visibility */
	toggleMenubarWidget: (type: 'priorities' | 'calendar' | 'sessions') => void;

	// =========================================
	// SORT ACTIONS
	// =========================================

	/** Sort icons by name (alphabetically) */
	sortIconsByName: (files: { path: string; name: string; type: string; }[]) => void;

	/** Sort icons by kind (folders first, then files) */
	sortIconsByKind: (files: { path: string; name: string; type: string; }[]) => void;

	/** Reset to natural file order */
	resetIconOrder: () => void;

	// =========================================
	// APPEARANCE ACTIONS
	// =========================================

	/** Toggle dark mode */
	toggleDarkMode: () => void;
}

// Default window dimensions
const DEFAULT_WINDOW_WIDTH = 700;
const DEFAULT_WINDOW_HEIGHT = 500;

// Default widget configs
const WIDGET_DEFAULTS: Record<'priorities' | 'calendar' | 'sessions', Omit<WidgetState, 'id'>> = {
	priorities: {
		type: 'priorities',
		x: 50,
		y: 50,
		width: 320,
		height: 400,
		collapsed: false,
	},
	calendar: {
		type: 'calendar',
		x: 50,
		y: 480,
		width: 320,
		height: 300,
		collapsed: false,
	},
	sessions: {
		type: 'sessions',
		x: 400,
		y: 50,
		width: 280,
		height: 350,
		collapsed: false,
	},
};

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 10);

export const useWindowStore = create<WindowStore>()(
	persist(
		(set, get) => ({
			windows: [],
			windowStack: [],
			iconOrder: [],
			widgets: [
				{ id: 'priorities-default', ...WIDGET_DEFAULTS.priorities },
				{ id: 'calendar-default', ...WIDGET_DEFAULTS.calendar },
				{ id: 'sessions-default', ...WIDGET_DEFAULTS.sessions },
			],
			menubarWidgets: new Set<'priorities' | 'calendar' | 'sessions'>(['priorities', 'calendar', 'sessions']), // All widgets visible by default
			selectedIcons: [],
			quickLookPath: null,
			contextMenu: null,
			renamingPath: null,
			darkMode: false, // Light mode by default
			appWindowPositions: {} as Record<CoreAppType, { x: number; y: number; width: number; height: number; }>,

			// =========================================
			// WINDOW ACTIONS
			// =========================================

			openWindow: (filePath, title) => {
				const existing = get().getWindowByPath(filePath);
				if (existing) {
					// Already open - just focus it
					get().focusWindow(existing.id);
					return;
				}

				const id = generateId();
				const docType = getDocumentType(filePath);
				const windowTitle = docType === 'code' ? `${title} — Code in Claude Code` : title;
				// Cascade new windows
				const existingCount = get().windows.length;
				const x = 100 + (existingCount % 10) * 30;
				const y = 100 + (existingCount % 10) * 30;

				const newWindow: WindowState = {
					id,
					filePath,
					title: windowTitle,
					x,
					y,
					width: DEFAULT_WINDOW_WIDTH,
					height: DEFAULT_WINDOW_HEIGHT,
					minimized: false,
				};

				set((state) => ({
					windows: [...state.windows, newWindow],
					windowStack: [id, ...state.windowStack],
				}));
			},

			openAppWindow: (appType, initialPath) => {
				// For Finder with an initialPath, allow multiple windows
				// For other apps or Finder without a path, use singleton pattern
				if (appType !== 'finder' || !initialPath) {
					const existing = get().getAppWindow(appType);
					if (existing) {
						// Already open - unminimize if needed and focus
						if (existing.minimized) {
							get().unminimizeWindow(existing.id);
						} else {
							get().focusWindow(existing.id);
						}
						return;
					}
				}

				const id = `app-${appType}-${generateId()}`;

				// App-specific default sizes
				const appDefaults: Record<CoreAppType, { width: number; height: number; title: string; x: number; y: number; }> = {
					calendar: { width: 900, height: 650, title: 'Claude Calendar', x: 150, y: 80 },
					finder: { width: 950, height: 550, title: 'Claude Finder', x: 100, y: 60 },
					settings: { width: 650, height: 500, title: 'Claude Settings', x: 200, y: 100 },
					contacts: { width: 750, height: 550, title: 'Claude Contacts', x: 180, y: 90 },
					widgets: { width: 700, height: 500, title: 'Claude Widgets', x: 160, y: 70 },
					email: { width: 1000, height: 650, title: 'Claude Mail', x: 120, y: 70 },
					messages: { width: 900, height: 600, title: 'Claude Messages', x: 130, y: 75 },
					missions: { width: 700, height: 600, title: 'Claude Missions', x: 140, y: 80 },
					roles: { width: 700, height: 550, title: 'Claude Roles', x: 170, y: 85 },
				};

				const defaults = appDefaults[appType];

				// Use saved position if available, otherwise use defaults
				const savedPosition = get().appWindowPositions[appType];
				// For Finder with initialPath, cascade the window position
				const existingFinderCount = appType === 'finder' && initialPath
					? get().windows.filter(w => w.appType === 'finder').length
					: 0;
				const cascadeOffset = existingFinderCount * 30;

				const x = (savedPosition?.x ?? defaults.x) + cascadeOffset;
				const y = (savedPosition?.y ?? defaults.y) + cascadeOffset;
				const width = savedPosition?.width ?? defaults.width;
				const height = savedPosition?.height ?? defaults.height;

				// For Finder with path, use folder name as title
				let title = defaults.title;
				if (appType === 'finder' && initialPath) {
					const folderName = initialPath.split('/').pop() || 'Desktop';
					title = folderName.charAt(0).toUpperCase() + folderName.slice(1);
				}

				const newWindow: WindowState = {
					id,
					filePath: `app://${appType}${initialPath ? `/${initialPath}` : ''}`, // Virtual path for app windows
					title,
					x,
					y,
					width,
					height,
					minimized: false,
					appType,
					initialPath: initialPath || undefined,
				};

				set((state) => ({
					windows: [...state.windows, newWindow],
					windowStack: [id, ...state.windowStack],
				}));
			},

			getAppWindow: (appType) => {
				return get().windows.find((w) => w.appType === appType);
			},

			closeWindow: (id) => {
				set((state) => ({
					windows: state.windows.filter((w) => w.id !== id),
					windowStack: state.windowStack.filter((w) => w !== id),
				}));
			},

			focusWindow: (id) => {
				set((state) => ({
					windowStack: [id, ...state.windowStack.filter((w) => w !== id)],
				}));
			},

			moveWindow: (id, x, y) => {
				const win = get().windows.find((w) => w.id === id);
				set((state) => {
					const updates: Partial<WindowStore> = {
						windows: state.windows.map((w) =>
							w.id === id ? { ...w, x, y } : w
						),
					};
					// Save position for app windows
					if (win?.appType) {
						const existing = state.appWindowPositions[win.appType] || { width: win.width, height: win.height };
						updates.appWindowPositions = {
							...state.appWindowPositions,
							[win.appType]: { ...existing, x, y },
						};
					}
					return updates as WindowStore;
				});
			},

			resizeWindow: (id, width, height) => {
				const win = get().windows.find((w) => w.id === id);
				set((state) => {
					const updates: Partial<WindowStore> = {
						windows: state.windows.map((w) =>
							w.id === id ? { ...w, width, height } : w
						),
					};
					// Save size for app windows
					if (win?.appType) {
						const existing = state.appWindowPositions[win.appType] || { x: win.x, y: win.y };
						updates.appWindowPositions = {
							...state.appWindowPositions,
							[win.appType]: { ...existing, width, height },
						};
					}
					return updates as WindowStore;
				});
			},

			minimizeWindow: (id) => {
				set((state) => ({
					windows: state.windows.map((w) =>
						w.id === id ? { ...w, minimized: true } : w
					),
					// Remove from stack when minimized
					windowStack: state.windowStack.filter((wid) => wid !== id),
				}));
			},

			unminimizeWindow: (id) => {
				set((state) => ({
					windows: state.windows.map((w) =>
						w.id === id ? { ...w, minimized: false } : w
					),
					// Add to front of stack when unminimized
					windowStack: [id, ...state.windowStack.filter((wid) => wid !== id)],
				}));
			},

			getMinimizedWindows: () => {
				return get().windows.filter((w) => w.minimized);
			},

			hasOpenWindow: (appType) => {
				return get().windows.some((w) => w.appType === appType && !w.minimized);
			},

			getWindowByPath: (filePath) => {
				return get().windows.find((w) => w.filePath === filePath);
			},

			getZIndex: (id) => {
				const index = get().windowStack.indexOf(id);
				// Higher index = front. Start at 100 to stay above desktop.
				return index === -1 ? 100 : 200 - index;
			},

			// =========================================
			// ICON ACTIONS
			// =========================================

			setIconOrder: (order) => {
				set({ iconOrder: order });
			},

			reorderIcon: (fromPath, toIndex) => {
				set((state) => {
					const currentOrder = [...state.iconOrder];
					const fromIndex = currentOrder.indexOf(fromPath);
					if (fromIndex === -1) return state;

					// Remove from current position
					currentOrder.splice(fromIndex, 1);
					// Insert at new position
					currentOrder.splice(toIndex, 0, fromPath);

					return { iconOrder: currentOrder };
				});
			},

			selectIcon: (path, multiSelect = false) => {
				set((state) => ({
					selectedIcons: multiSelect
						? state.selectedIcons.includes(path)
							? state.selectedIcons.filter((p) => p !== path)
							: [...state.selectedIcons, path]
						: [path],
				}));
			},

			selectAll: (allPaths) => {
				set({ selectedIcons: allPaths });
			},

			clearSelection: () => {
				set({ selectedIcons: [], quickLookPath: null });
			},

			openQuickLook: (path) => {
				set({ quickLookPath: path });
			},

			closeQuickLook: () => {
				set({ quickLookPath: null });
			},

			toggleQuickLook: (path) => {
				const current = get().quickLookPath;
				if (current === path) {
					set({ quickLookPath: null });
				} else {
					set({ quickLookPath: path });
				}
			},

			getFocusedWindowId: () => {
				const stack = get().windowStack;
				return stack.length > 0 ? stack[0] : null;
			},

			getFocusedWindow: () => {
				const stack = get().windowStack;
				const windows = get().windows;
				// Find the first non-minimized window in the stack
				for (const id of stack) {
					const win = windows.find((w) => w.id === id && !w.minimized);
					if (win) return win;
				}
				return null;
			},

			closeFocusedWindow: () => {
				const focusedId = get().getFocusedWindowId();
				if (focusedId) {
					get().closeWindow(focusedId);
				}
			},

			// =========================================
			// CONTEXT MENU ACTIONS
			// =========================================

			openContextMenu: (x, y, targetType, targetPath, meta) => {
				set({
					contextMenu: {
						x,
						y,
						targetType,
						targetPath,
						...meta,
					},
				});
			},

			closeContextMenu: () => {
				set({ contextMenu: null });
			},

			// =========================================
			// RENAME ACTIONS
			// =========================================

			startRename: (path) => {
				set({ renamingPath: path, selectedIcons: [path] });
			},

			stopRename: () => {
				set({ renamingPath: null });
			},

			// =========================================
			// WIDGET ACTIONS
			// =========================================

			addWidget: (type) => {
				const existing = get().widgets.find((w) => w.type === type);
				if (existing) return; // Only one of each type

				const id = `${type}-${generateId()}`;
				const defaults = WIDGET_DEFAULTS[type];

				set((state) => ({
					widgets: [...state.widgets, { id, ...defaults }],
				}));
			},

			removeWidget: (id) => {
				set((state) => ({
					widgets: state.widgets.filter((w) => w.id !== id),
				}));
			},

			moveWidget: (id, x, y) => {
				set((state) => ({
					widgets: state.widgets.map((w) =>
						w.id === id ? { ...w, x, y } : w
					),
				}));
			},

			resizeWidget: (id, width, height) => {
				set((state) => ({
					widgets: state.widgets.map((w) =>
						w.id === id ? { ...w, width, height } : w
					),
				}));
			},

			toggleWidgetCollapse: (id) => {
				set((state) => ({
					widgets: state.widgets.map((w) =>
						w.id === id ? { ...w, collapsed: !w.collapsed } : w
					),
				}));
			},

			// =========================================
			// MENUBAR WIDGET ACTIONS
			// =========================================

			toggleMenubarWidget: (type) => {
				set((state) => {
					const newSet = new Set(state.menubarWidgets);
					if (newSet.has(type)) {
						newSet.delete(type);
					} else {
						newSet.add(type);
					}
					return { menubarWidgets: newSet };
				});
			},

			// =========================================
			// SORT ACTIONS
			// =========================================

			sortIconsByName: (files) => {
				// Sort files alphabetically by name (case-insensitive)
				const sorted = [...files].sort((a, b) =>
					a.name.toLowerCase().localeCompare(b.name.toLowerCase())
				);
				set({ iconOrder: sorted.map(f => f.path) });
			},

			sortIconsByKind: (files) => {
				// Sort: folders first (alphabetically), then files (alphabetically)
				const sorted = [...files].sort((a, b) => {
					const aIsFolder = a.type === 'directory';
					const bIsFolder = b.type === 'directory';

					if (aIsFolder && !bIsFolder) return -1;
					if (!aIsFolder && bIsFolder) return 1;
					return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
				});
				set({ iconOrder: sorted.map(f => f.path) });
			},

			resetIconOrder: () => {
				set({ iconOrder: [] });
			},

			// =========================================
			// APPEARANCE ACTIONS
			// =========================================

			toggleDarkMode: () => {
				set((state) => ({
					darkMode: !state.darkMode,
				}));
			},
		}),
		{
			name: 'claude-os-desktop',
			partialize: (state) => ({
				// Persist layout and window state
				iconOrder: state.iconOrder,
				widgets: state.widgets,
				menubarWidgets: state.menubarWidgets,
				darkMode: state.darkMode,
				windows: state.windows,
				windowStack: state.windowStack,
				appWindowPositions: state.appWindowPositions,
			}),
			storage: {
				getItem: (name) => {
					const str = localStorage.getItem(name);
					if (!str) return null;
					const parsed = JSON.parse(str);
					// Convert menubarWidgets array back to Set
					if (parsed.state?.menubarWidgets && Array.isArray(parsed.state.menubarWidgets)) {
						parsed.state.menubarWidgets = new Set(parsed.state.menubarWidgets);
					}
					return parsed;
				},
				setItem: (name, value) => {
					// Convert menubarWidgets Set to array for storage
					const toStore = {
						...value,
						state: {
							...value.state,
							menubarWidgets: value.state?.menubarWidgets
								? Array.from(value.state.menubarWidgets)
								: [],
						},
					};
					localStorage.setItem(name, JSON.stringify(toStore));
				},
				removeItem: (name) => localStorage.removeItem(name),
			},
			onRehydrateStorage: () => (state) => {
				// Validate and clean up persisted window state on restore
				if (!state) return;

				try {
					// Get viewport dimensions
					const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
					const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

					// Filter and validate windows
					const validatedWindows = (state.windows || []).filter((win) => {
						// Keep all Core App windows (they don't depend on files)
						if (win.appType) return true;

						// For file windows, we'll validate on mount
						// (can't check file existence here without async)
						return true;
					}).map((win) => {
						// Clamp positions to viewport
						const x = Math.max(0, Math.min(win.x, viewportWidth - 300));
						const y = Math.max(0, Math.min(win.y, viewportHeight - 200));

						// Ensure reasonable size
						const width = Math.max(300, Math.min(win.width, viewportWidth));
						const height = Math.max(200, Math.min(win.height, viewportHeight));

						return { ...win, x, y, width, height };
					});

					// Update state with validated windows
					state.windows = validatedWindows;
					state.windowStack = (state.windowStack || []).filter((id) =>
						validatedWindows.some((w) => w.id === id)
					);
				} catch (err) {
					console.error('Error rehydrating window state:', err);
					// On error, clear window state but keep other persisted data
					state.windows = [];
					state.windowStack = [];
				}
			},
		}
	)
);

// =============================================================================
// SELECTOR HOOKS
// =============================================================================
// Use these instead of destructuring the entire store.
// Components only re-render when their specific slice changes.

// State selectors
export const useWindows = () => useWindowStore((s) => s.windows);
export const useWindowStack = () => useWindowStore((s) => s.windowStack);
export const useWidgets = () => useWindowStore((s) => s.widgets);
export const useMenubarWidgets = () => useWindowStore((s) => s.menubarWidgets);
export const useIconOrder = () => useWindowStore((s) => s.iconOrder);
export const useSelectedIcons = () => useWindowStore((s) => s.selectedIcons);
export const useQuickLookPath = () => useWindowStore((s) => s.quickLookPath);
export const useContextMenu = () => useWindowStore((s) => s.contextMenu);
export const useRenamingPath = () => useWindowStore((s) => s.renamingPath);
export const useDarkMode = () => useWindowStore((s) => s.darkMode);

// Action selectors (use useShallow to avoid infinite SSR loop)
export const useWindowActions = () => useWindowStore(
	useShallow((s) => ({
		openWindow: s.openWindow,
		openAppWindow: s.openAppWindow,
		closeWindow: s.closeWindow,
		focusWindow: s.focusWindow,
		moveWindow: s.moveWindow,
		resizeWindow: s.resizeWindow,
		minimizeWindow: s.minimizeWindow,
		unminimizeWindow: s.unminimizeWindow,
		getAppWindow: s.getAppWindow,
		getWindowByPath: s.getWindowByPath,
		getMinimizedWindows: s.getMinimizedWindows,
		hasOpenWindow: s.hasOpenWindow,
		getZIndex: s.getZIndex,
		getFocusedWindowId: s.getFocusedWindowId,
		getFocusedWindow: s.getFocusedWindow,
		closeFocusedWindow: s.closeFocusedWindow,
	}))
);

export const useIconActions = () => useWindowStore(
	useShallow((s) => ({
		setIconOrder: s.setIconOrder,
		reorderIcon: s.reorderIcon,
		selectIcon: s.selectIcon,
		selectAll: s.selectAll,
		clearSelection: s.clearSelection,
		sortIconsByName: s.sortIconsByName,
		sortIconsByKind: s.sortIconsByKind,
		resetIconOrder: s.resetIconOrder,
	}))
);

export const useQuickLookActions = () => useWindowStore(
	useShallow((s) => ({
		openQuickLook: s.openQuickLook,
		closeQuickLook: s.closeQuickLook,
		toggleQuickLook: s.toggleQuickLook,
	}))
);

export const useContextMenuActions = () => useWindowStore(
	useShallow((s) => ({
		openContextMenu: s.openContextMenu,
		closeContextMenu: s.closeContextMenu,
	}))
);

export const useWidgetActions = () => useWindowStore(
	useShallow((s) => ({
		addWidget: s.addWidget,
		removeWidget: s.removeWidget,
		moveWidget: s.moveWidget,
		resizeWidget: s.resizeWidget,
		toggleWidgetCollapse: s.toggleWidgetCollapse,
		toggleMenubarWidget: s.toggleMenubarWidget,
	}))
);

export const useRenameActions = () => useWindowStore(
	useShallow((s) => ({
		startRename: s.startRename,
		stopRename: s.stopRename,
	}))
);

export const useAppearanceActions = () => useWindowStore(
	useShallow((s) => ({
		toggleDarkMode: s.toggleDarkMode,
	}))
);
