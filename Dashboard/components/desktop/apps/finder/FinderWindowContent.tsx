'use client';

import {
	finderCreateFile,
	finderCreateFolder,
	FinderItem,
	finderList,
	finderMove,
	finderRename,
	moveToTrash
} from '@/lib/api';
import { getFileIconSpec } from '@/lib/fileTypes';
import { CLAUDE_SYSTEM_FILES, CLAUDE_SYSTEM_FOLDERS, isProtectedFile } from '@/lib/systemFiles';
import { getFolderColorClass } from '@/lib/folderCategories';
import { FileTreeNode } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import {
	ChevronLeft,
	ChevronRight,
	Clock,
	Columns,
	Eye,
	EyeOff,
	FilePlus,
	FileText,
	FolderPlus,
	LayoutGrid,
	List,
	Loader2,
	Monitor,
	Search
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePromptModal } from '@/components/desktop/PromptModal';
import { toast } from 'sonner';
import { useFileEvents } from '@/hooks/useFileEvents';

// Use FinderItem from api.ts instead of local FileItem
type FileItem = FinderItem;

// Drag & drop state
interface DragState {
	item: FileItem;
	overPath: string | null;
}

// Claude OS themed colors
const CLAUDE_CORAL = '#DA7756';
const CLAUDE_CORAL_LIGHT = '#E8A088';
const CLAUDE_ACCENT = '#DA7756';

// Tiny Claude badge for list/column views
function ClaudeBadgeMini() {
	return (
		<div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center flex-shrink-0" title="Claude System File">
			<svg className="w-2 h-2 text-white" viewBox="0 0 16 16" fill="currentColor">
				<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
			</svg>
		</div>
	);
}

// Convert FinderItem to FileTreeNode for categorization
function toFileTreeNode(item: FileItem): FileTreeNode {
	return {
		name: item.name,
		path: item.path,
		type: item.type === 'folder' || item.type === 'domain' ? 'directory' : 'file',
	};
}

function getFileIcon(item: FileItem, isSelected: boolean, showBadge: boolean = true) {
	const iconClass = `w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white' : ''}`;
	const isSystemFile = CLAUDE_SYSTEM_FILES.has(item.name);

	const renderIcon = () => {
		if (item.type === 'folder' || item.type === 'domain') {
			// Use shared folder color system
			const node = toFileTreeNode(item);
			const colorClass = isSelected ? '' : getFolderColorClass(node);
			return (
				<svg viewBox="0 0 24 24" className={`w-4 h-4 flex-shrink-0 ${isSelected ? '' : colorClass}`} fill={isSelected ? 'white' : 'currentColor'}>
					<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
				</svg>
			);
		}

		if (item.type === 'app') {
			return (
				<div className={`w-4 h-4 rounded flex-shrink-0 ${isSelected ? 'bg-white/80' : 'bg-gradient-to-br from-blue-400 to-purple-500'}`} />
			);
		}

		// File icons by extension - system files get coral color
		const { icon: Icon, colorClass } = getFileIconSpec(item.name, { isSystemFile });
		return <Icon className={`${iconClass} ${isSelected ? '' : colorClass}`} />;
	};

	// If it's a system file and we want to show the badge, wrap with badge
	if (isSystemFile && showBadge && item.type === 'file') {
		return (
			<div className="flex items-center gap-1">
				{renderIcon()}
				<ClaudeBadgeMini />
			</div>
		);
	}

	return renderIcon();
}

function formatDate(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
	});
}

function formatSize(bytes: number | null): string {
	if (bytes === null || bytes === 0) return '--';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Sidebar favorites (no Recents for now - would need backend support)
const SIDEBAR_FAVORITES = [
	{ name: 'Desktop', path: '', icon: Monitor },
];

type ViewMode = 'list' | 'columns' | 'icons';

interface FinderWindowContentProps {
	/** Unique window ID for event targeting */
	windowId: string;
	/** Initial path to open (relative to Desktop/), e.g., "career" or "finance" */
	initialPath?: string;
}

/**
 * macOS-style Finder content for windowed mode.
 */
export function FinderWindowContent({ windowId, initialPath }: FinderWindowContentProps) {
	const router = useRouter();
	const { openWindow, openAppWindow, openContextMenu } = useWindowStore();
	// Initialize with the provided initialPath or root
	const [currentPath, setCurrentPath] = useState(initialPath || '');
	const [items, setItems] = useState<FileItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [viewMode, setViewMode] = useState<ViewMode>('list');
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedItem, setSelectedItem] = useState<string | null>(null);
	// Initialize history with the initial path
	const [history, setHistory] = useState<string[]>([initialPath || '']);
	const [historyIndex, setHistoryIndex] = useState(0);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	// Hide system files toggle - persisted to localStorage
	const [hideSystemFiles, setHideSystemFiles] = useState(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('finder-hide-system-files');
			return saved !== null ? saved === 'true' : true; // Default: hidden
		}
		return true;
	});

	// Persist hide system files preference
	useEffect(() => {
		localStorage.setItem('finder-hide-system-files', String(hideSystemFiles));
	}, [hideSystemFiles]);

	// Keyboard shortcut: Cmd+Shift+H to toggle system files visibility
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'h') {
				e.preventDefault();
				setHideSystemFiles(prev => !prev);
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Dynamic domains and apps - loaded from items
	const [domains, setDomains] = useState<FileItem[]>([]);
	const [customApps, setCustomApps] = useState<FileItem[]>([]);

	// Miller column state: array of columns, each with path, items, and selected item
	const [columns, setColumns] = useState<{ path: string; items: FileItem[]; selected: string | null; }[]>([]);
	const columnsContainerRef = useRef<HTMLDivElement>(null);

	// Rename state
	const [renamingItem, setRenamingItem] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const renameInputRef = useRef<HTMLInputElement>(null);

	// Drag & drop state
	const [dragState, setDragState] = useState<DragState | null>(null);

	// Prompt modal for new file/folder
	const { showPrompt, PromptModal } = usePromptModal();

	// Track if we need to reload on next render
	const [needsReload, setNeedsReload] = useState(false);

	// Listen for file system changes and reload current directory
	useFileEvents({
		onCreated: (event) => {
			// Check if the change is in the current directory
			const eventDir = event.path.substring(0, event.path.lastIndexOf('/'));
			const currentDir = currentPath ? `Desktop/${currentPath}` : 'Desktop';
			if (eventDir === currentDir) {
				setNeedsReload(true);
			}
		},
		onDeleted: (event) => {
			const eventDir = event.path.substring(0, event.path.lastIndexOf('/'));
			const currentDir = currentPath ? `Desktop/${currentPath}` : 'Desktop';
			if (eventDir === currentDir) {
				setNeedsReload(true);
			}
		},
		onMoved: (event) => {
			// Reload if source or destination is in current directory
			const sourceDir = event.path.substring(0, event.path.lastIndexOf('/'));
			const currentDir = currentPath ? `Desktop/${currentPath}` : 'Desktop';
			if (sourceDir === currentDir || event.dest_path?.startsWith(currentDir + '/')) {
				setNeedsReload(true);
			}
		},
		onModified: () => {
			// Don't reload on modifications (just content changes, not structure)
		}
	});

	// Load directory contents using the typed API
	const loadDirectory = useCallback(async (path: string) => {
		setLoading(true);
		try {
			const data = await finderList(path);
			setItems(data.items);

			// If we're at root, extract domains and custom apps for sidebar
			if (path === '') {
				const rootDomains = data.items.filter(item => item.type === 'domain');
				const rootApps = data.items.filter(item => item.type === 'app');
				setDomains(rootDomains);
				setCustomApps(rootApps);
			}

			// For column view, initialize with the current directory
			if (viewMode === 'columns') {
				// Build column path from root to current
				const pathParts = path ? path.split('/') : [];
				const initialColumns: { path: string; items: FileItem[]; selected: string | null; }[] = [];

				// Load each parent path to build columns
				let accPath = '';
				for (let i = 0; i <= pathParts.length; i++) {
					if (i === pathParts.length) {
						// Last column is current path
						initialColumns.push({ path: accPath, items: data.items, selected: null });
					} else {
						// For parent paths, we need to load them
						// For now, just start with current directory
						accPath = pathParts.slice(0, i + 1).join('/');
					}
				}
				// Start with just root column
				setColumns([{ path: '', items: data.items, selected: null }]);
			}
		} catch (err) {
			console.error('Load error:', err);
		} finally {
			setLoading(false);
		}
	}, [viewMode]);

	useEffect(() => {
		loadDirectory(currentPath);
	}, [currentPath, loadDirectory]);

	// Reload when file system changes detected
	useEffect(() => {
		if (needsReload) {
			loadDirectory(currentPath);
			setNeedsReload(false);
		}
	}, [needsReload, currentPath, loadDirectory]);

	// Load root on mount to populate sidebar (domains/apps) even if starting in subdirectory
	useEffect(() => {
		const loadSidebar = async () => {
			try {
				const data = await finderList('');
				const rootDomains = data.items.filter(item => item.type === 'domain');
				const rootApps = data.items.filter(item => item.type === 'app');
				setDomains(rootDomains);
				setCustomApps(rootApps);
			} catch (err) {
				console.error('Failed to load sidebar items:', err);
			}
		};

		// Only load if we're not already at root (avoid double load)
		if (currentPath !== '') {
			loadSidebar();
		}
	}, []); // Run once on mount

	// Initialize columns when switching to column view
	useEffect(() => {
		if (viewMode === 'columns' && columns.length === 0 && items.length > 0) {
			setColumns([{ path: currentPath, items, selected: null }]);
		}
	}, [viewMode, columns.length, items, currentPath]);

	const navigateTo = useCallback((path: string, addToHistory = true) => {
		if (addToHistory && path !== currentPath) {
			const newHistory = [...history.slice(0, historyIndex + 1), path];
			setHistory(newHistory);
			setHistoryIndex(newHistory.length - 1);
		}
		setCurrentPath(path);
		setSelectedItem(null);
	}, [currentPath, history, historyIndex]);

	const goBack = useCallback(() => {
		if (historyIndex > 0) {
			setHistoryIndex(historyIndex - 1);
			setCurrentPath(history[historyIndex - 1]);
			setSelectedItem(null);
		}
	}, [history, historyIndex]);

	const goForward = useCallback(() => {
		if (historyIndex < history.length - 1) {
			setHistoryIndex(historyIndex + 1);
			setCurrentPath(history[historyIndex + 1]);
			setSelectedItem(null);
		}
	}, [history, historyIndex]);

	const handleItemClick = useCallback((item: FileItem) => {
		setSelectedItem(item.path);
	}, []);

	const handleItemDoubleClick = useCallback((item: FileItem) => {
		// Don't navigate if renaming
		if (renamingItem === item.path) return;

		if (item.type === 'folder' || item.type === 'domain') {
			navigateTo(item.path);
		} else if (item.type === 'app') {
			const appName = item.name.toLowerCase().replace(/\s+/g, '-');
			router.push(`/${appName}`);
		} else if (item.type === 'file') {
			// Open file in a new window on the Desktop
			// The path needs to be prefixed with Desktop/ for the file viewer
			const fullPath = `Desktop/${item.path}`;
			openWindow(fullPath, item.name);
		}
	}, [navigateTo, router, renamingItem, openWindow]);

	// =========================================
	// CRUD Operations
	// =========================================

	const handleNewFolder = useCallback(() => {
		const path = currentPath;
		showPrompt('New Folder', 'Enter folder name', async (name) => {
			try {
				const folderPath = path ? `${path}/${name}` : name;
				await finderCreateFolder(folderPath);
				loadDirectory(path);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to create folder');
			}
		});
	}, [currentPath, loadDirectory, showPrompt]);

	const handleNewFile = useCallback(() => {
		const path = currentPath;
		showPrompt('New File', 'Enter filename (e.g., notes.md)', async (name) => {
			try {
				const filePath = path ? `${path}/${name}` : name;
				let content = '';
				if (name.endsWith('.md')) {
					content = `# ${name.replace('.md', '')}\n\n`;
				}
				await finderCreateFile(filePath, content);
				loadDirectory(path);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to create file');
			}
		});
	}, [currentPath, loadDirectory, showPrompt]);

	const handleRenameStart = useCallback((item: FileItem) => {
		// Protect system files
		if (isProtectedFile(item.name)) {
			toast.error('Cannot rename system files');
			return;
		}

		setRenamingItem(item.path);
		setRenameValue(item.name);
		setTimeout(() => {
			if (renameInputRef.current) {
				renameInputRef.current.focus();
				// Select name without extension
				const dotIndex = item.name.lastIndexOf('.');
				if (dotIndex > 0) {
					renameInputRef.current.setSelectionRange(0, dotIndex);
				} else {
					renameInputRef.current.select();
				}
			}
		}, 0);
	}, []);

	const handleRenameSubmit = useCallback(async () => {
		if (!renamingItem || !renameValue.trim()) {
			setRenamingItem(null);
			return;
		}

		const currentName = renamingItem.split('/').pop();
		if (renameValue.trim() === currentName) {
			setRenamingItem(null);
			return;
		}

		try {
			await finderRename(renamingItem, renameValue.trim());
			loadDirectory(currentPath);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to rename');
		} finally {
			setRenamingItem(null);
		}
	}, [renamingItem, renameValue, currentPath, loadDirectory]);

	const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRenameSubmit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setRenamingItem(null);
		}
	}, [handleRenameSubmit]);

	const handleMoveToTrash = useCallback(async (item: FileItem) => {
		// Protect system files
		if (isProtectedFile(item.name)) {
			toast.error('Cannot delete system files');
			return;
		}

		try {
			await moveToTrash(item.path);
			loadDirectory(currentPath);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
		}
	}, [currentPath, loadDirectory]);

	// Context menu handler - uses global context menu system for consistency
	const handleContextMenu = useCallback((e: React.MouseEvent, item: FileItem | null) => {
		e.preventDefault();
		e.stopPropagation();

		if (item) {
			setSelectedItem(item.path);
			// Use full path with Desktop/ prefix for consistency with desktop icons
			const fullPath = `Desktop/${item.path}`;
			const isDir = item.type === 'folder' || item.type === 'domain';
			openContextMenu(e.clientX, e.clientY, 'finder-item', fullPath, {
				isDirectory: isDir,
				hasLifeSpec: item.type === 'domain',
				hasAppSpec: item.type === 'app',
				currentDirectory: currentPath,
				sourceWindowId: windowId,
			});
		} else {
			// Empty space - for creating new items
			openContextMenu(e.clientX, e.clientY, 'finder-empty', undefined, {
				currentDirectory: currentPath,
				sourceWindowId: windowId,
			});
		}
	}, [openContextMenu, currentPath, windowId]);

	// Listen for refresh events from global context menu actions
	// Refresh if the event has no windowId (Desktop context) or matches our windowId
	useEffect(() => {
		const handleRefresh = (e: CustomEvent<{ windowId?: string; }>) => {
			// Refresh if event has no windowId (created from Desktop) or matches this window
			if (!e.detail?.windowId || e.detail.windowId === windowId) {
				loadDirectory(currentPath);
			}
		};
		window.addEventListener('refresh-finder', handleRefresh as EventListener);
		return () => window.removeEventListener('refresh-finder', handleRefresh as EventListener);
	}, [currentPath, loadDirectory, windowId]);

	// Listen for navigate events from global context menu (for "Open" on folders)
	// Only handle events targeted at this specific window
	useEffect(() => {
		const handleNavigate = (e: CustomEvent<{ path: string; windowId: string; }>) => {
			if (e.detail.windowId === windowId) {
				navigateTo(e.detail.path);
			}
		};
		window.addEventListener('finder-navigate', handleNavigate as EventListener);
		return () => window.removeEventListener('finder-navigate', handleNavigate as EventListener);
	}, [navigateTo, windowId]);

	// =========================================
	// Drag & Drop Logic
	// =========================================

	const handleDragStart = useCallback((e: React.DragEvent, item: FileItem) => {
		e.dataTransfer.setData('text/plain', item.path);
		e.dataTransfer.effectAllowed = 'move';
		setDragState({ item, overPath: null });
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent, targetItem: FileItem | null) => {
		e.preventDefault();

		// Can only drop into folders
		if (targetItem && (targetItem.type === 'folder' || targetItem.type === 'domain')) {
			e.dataTransfer.dropEffect = 'move';
			setDragState(prev => prev ? { ...prev, overPath: targetItem.path } : null);
		} else {
			e.dataTransfer.dropEffect = 'none';
			setDragState(prev => prev ? { ...prev, overPath: null } : null);
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		// Only clear if leaving the item entirely (not entering a child)
		const relatedTarget = e.relatedTarget as HTMLElement;
		if (!relatedTarget?.closest('[data-droppable]')) {
			setDragState(prev => prev ? { ...prev, overPath: null } : null);
		}
	}, []);

	const handleDrop = useCallback(async (e: React.DragEvent, targetItem: FileItem) => {
		e.preventDefault();
		e.stopPropagation();

		if (!dragState || dragState.item.path === targetItem.path) {
			setDragState(null);
			return;
		}

		// Can only drop into folders
		if (targetItem.type !== 'folder' && targetItem.type !== 'domain') {
			setDragState(null);
			return;
		}

		// Don't allow dropping a folder into itself
		if (targetItem.path.startsWith(dragState.item.path + '/')) {
			setDragState(null);
			return;
		}

		try {
			await finderMove(dragState.item.path, targetItem.path);
			loadDirectory(currentPath);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to move');
		} finally {
			setDragState(null);
		}
	}, [dragState, currentPath, loadDirectory]);

	const handleDragEnd = useCallback(() => {
		setDragState(null);
	}, []);

	// =========================================
	// Miller Column View Logic
	// =========================================

	// Handle selection in a column - loads next column if folder
	const handleColumnSelect = useCallback(async (columnIndex: number, item: FileItem) => {
		// Update selection in this column
		const newColumns = columns.slice(0, columnIndex + 1).map((col, i) =>
			i === columnIndex ? { ...col, selected: item.path } : col
		);

		// If it's a folder, load its contents into next column
		if (item.type === 'folder' || item.type === 'domain') {
			try {
				const data = await finderList(item.path);
				newColumns.push({ path: item.path, items: data.items, selected: null });
			} catch (err) {
				console.error('Failed to load column:', err);
			}
		}

		setColumns(newColumns);
		setSelectedItem(item.path);

		// Scroll to show new column
		setTimeout(() => {
			if (columnsContainerRef.current) {
				columnsContainerRef.current.scrollLeft = columnsContainerRef.current.scrollWidth;
			}
		}, 50);
	}, [columns]);

	// Navigate into a folder from column view (double-click)
	const handleColumnNavigate = useCallback((item: FileItem) => {
		if (item.type === 'folder' || item.type === 'domain') {
			navigateTo(item.path);
		} else if (item.type === 'app') {
			const appName = item.name.toLowerCase().replace(/\s+/g, '-');
			router.push(`/${appName}`);
		} else if (item.type === 'file') {
			// Open file in a new window on the Desktop
			const fullPath = `Desktop/${item.path}`;
			openWindow(fullPath, item.name);
		}
	}, [navigateTo, router, openWindow]);

	// Path breadcrumbs
	const pathParts = useMemo(() => {
		if (!currentPath) return [{ name: 'Desktop', path: '' }];
		const parts = currentPath.split('/').filter(Boolean);
		return [
			{ name: 'Desktop', path: '' },
			...parts.map((part, i) => ({
				name: part,
				path: parts.slice(0, i + 1).join('/'),
			})),
		];
	}, [currentPath]);

	// Sort items: folders first (alphabetically), then files (alphabetically)
	const sortedItems = useMemo(() => {
		const sorted = [...items].sort((a, b) => {
			// Folders (including domains and apps) come before files
			const aIsFolder = a.type === 'folder' || a.type === 'domain' || a.type === 'app';
			const bIsFolder = b.type === 'folder' || b.type === 'domain' || b.type === 'app';

			if (aIsFolder && !bIsFolder) return -1;
			if (!aIsFolder && bIsFolder) return 1;

			// Within same type, sort alphabetically (case-insensitive)
			return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
		});
		return sorted;
	}, [items]);

	// Filter sorted items by search and system file visibility
	const filteredItems = useMemo(() => {
		let filtered = sortedItems;

		// Filter out system files/folders when hideSystemFiles is true (only at root)
		if (hideSystemFiles && currentPath === '') {
			filtered = filtered.filter(item => {
				if (CLAUDE_SYSTEM_FILES.has(item.name)) return false;
				if (CLAUDE_SYSTEM_FOLDERS.has(item.name)) return false;
				return true;
			});
		}

		// Apply search filter
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(item => item.name.toLowerCase().includes(q));
		}

		return filtered;
	}, [sortedItems, searchQuery, hideSystemFiles, currentPath]);

	// Get current folder name for display
	const currentFolderName = pathParts[pathParts.length - 1]?.name || 'Desktop';

	return (
		<div className="flex flex-col h-full bg-[var(--surface-base)] select-none">
			{/* Toolbar - macOS style */}
			<div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-[#E8E8E8] to-[#D4D4D4] dark:from-[#3d3d3d] dark:to-[#323232] border-b border-[#B8B8B8] dark:border-[#2a2a2a]">
				{/* Navigation buttons */}
				<div className="flex items-center">
					<button
						onClick={goBack}
						disabled={historyIndex <= 0}
						className="p-1.5 rounded-l-md bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a] border-r-0 hover:bg-white/80 dark:hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
					>
						<ChevronLeft className="w-3.5 h-3.5 text-[#4A4A4A] dark:text-[#c0c0c0]" />
					</button>
					<button
						onClick={goForward}
						disabled={historyIndex >= history.length - 1}
						className="p-1.5 rounded-r-md bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a] hover:bg-white/80 dark:hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
					>
						<ChevronRight className="w-3.5 h-3.5 text-[#4A4A4A] dark:text-[#c0c0c0]" />
					</button>
				</div>

				{/* Current folder name */}
				<div className="flex-1 min-w-0 flex items-center gap-1.5 px-2">
					<svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill={CLAUDE_CORAL}>
						<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
					</svg>
					<span className="text-sm font-medium text-[var(--text-primary)] truncate">
						{currentFolderName}
					</span>
				</div>

				{/* View mode toggle - segmented control style */}
				<div className="flex items-center bg-white/60 dark:bg-black/20 rounded-md border border-[#C0C0C0] dark:border-[#4a4a4a] p-0.5">
					<button
						onClick={() => setViewMode('icons')}
						className={`p-1 rounded transition-colors ${viewMode === 'icons'
							? 'bg-white dark:bg-[#4a4a4a] shadow-sm'
							: 'hover:bg-white/50 dark:hover:bg-white/10'
							}`}
						title="Icon view"
					>
						<LayoutGrid className={`w-3.5 h-3.5 ${viewMode === 'icons' ? 'text-[#DA7756]' : 'text-[#6E6E73] dark:text-[#8e8e93]'}`} />
					</button>
					<button
						onClick={() => setViewMode('list')}
						className={`p-1 rounded transition-colors ${viewMode === 'list'
							? 'bg-white dark:bg-[#4a4a4a] shadow-sm'
							: 'hover:bg-white/50 dark:hover:bg-white/10'
							}`}
						title="List view"
					>
						<List className={`w-3.5 h-3.5 ${viewMode === 'list' ? 'text-[#DA7756]' : 'text-[#6E6E73] dark:text-[#8e8e93]'}`} />
					</button>
					<button
						onClick={() => setViewMode('columns')}
						className={`p-1 rounded transition-colors ${viewMode === 'columns'
							? 'bg-white dark:bg-[#4a4a4a] shadow-sm'
							: 'hover:bg-white/50 dark:hover:bg-white/10'
							}`}
						title="Column view"
					>
						<Columns className={`w-3.5 h-3.5 ${viewMode === 'columns' ? 'text-[#DA7756]' : 'text-[#6E6E73] dark:text-[#8e8e93]'}`} />
					</button>
				</div>

				{/* Hide system files toggle */}
				<button
					onClick={() => setHideSystemFiles(!hideSystemFiles)}
					className={`p-1.5 rounded-md border transition-colors ${
						hideSystemFiles
							? 'bg-[#DA7756]/10 border-[#DA7756]/30 hover:bg-[#DA7756]/20'
							: 'bg-white/50 dark:bg-white/10 border-[#C0C0C0] dark:border-[#4a4a4a] hover:bg-white/80 dark:hover:bg-white/20'
					}`}
					title={hideSystemFiles ? 'Show system files (⌘⇧H)' : 'Hide system files (⌘⇧H)'}
				>
					{hideSystemFiles ? (
						<EyeOff className="w-3.5 h-3.5 text-[#DA7756]" />
					) : (
						<Eye className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#8e8e93]" />
					)}
				</button>

				{/* Search */}
				<div className="relative">
					<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search"
						className="w-32 pl-7 pr-2 py-1 text-xs bg-white/80 dark:bg-black/20 border border-[#C0C0C0] dark:border-[#4a4a4a] rounded-md placeholder-[#8E8E93] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#DA7756]/50 focus:border-[#DA7756]"
					/>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-1 border-l border-[#C0C0C0] dark:border-[#4a4a4a] pl-2 ml-2">
					<button
						onClick={handleNewFolder}
						className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						title="New Folder"
					>
						<FolderPlus className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#8e8e93]" />
					</button>
					<button
						onClick={handleNewFile}
						className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						title="New File"
					>
						<FilePlus className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#8e8e93]" />
					</button>
				</div>
			</div>

			{/* Main content area */}
			<div className="flex flex-1 min-h-0">
				{/* Sidebar - Claude OS branded */}
				{!sidebarCollapsed && (
					<div className="w-44 flex-shrink-0 bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl border-r border-[#D1D1D1] dark:border-[#3a3a3a] overflow-y-auto">
						{/* Claude OS branding header */}
						<div className="px-3 py-2 border-b border-[#D1D1D1] dark:border-[#3a3a3a]">
							<div className="flex items-center gap-2">
								<div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center">
									<svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="currentColor">
										<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
									</svg>
								</div>
								<div>
									<div className="text-[10px] font-semibold text-[#DA7756]">Life Files</div>
									<div className="text-[9px] text-[#8E8E93]">Claude OS</div>
								</div>
							</div>
						</div>

						{/* Favorites section */}
						<div className="p-2">
							<div className="px-2 py-1 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">
								Favorites
							</div>
							{SIDEBAR_FAVORITES.map((fav) => {
								const Icon = fav.icon;
								const isActive = fav.path === currentPath;
								return (
									<button
										key={fav.name}
										onClick={() => navigateTo(fav.path)}
										className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-colors ${isActive
											? 'bg-[#DA7756] text-white'
											: 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
											}`}
									>
										<Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#DA7756]'}`} />
										<span className="text-xs font-medium truncate">{fav.name}</span>
									</button>
								);
							})}
						</div>

						{/* Applications section - dynamic from customApps */}
						{customApps.length > 0 && (
							<div className="p-2 border-t border-[#D1D1D1] dark:border-[#3a3a3a]">
								<div className="px-2 py-1 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">
									Applications
								</div>
								<div className="space-y-0.5">
									{customApps.map((app) => {
										const isActive = currentPath === app.path;
										return (
											<button
												key={app.path}
												onClick={() => navigateTo(app.path)}
												className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-colors ${isActive
													? 'bg-[#DA7756] text-white'
													: 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
													}`}
											>
												<div className={`w-4 h-4 rounded flex-shrink-0 ${isActive ? 'bg-white/80' : 'bg-gradient-to-br from-blue-400 to-blue-600'}`} />
												<span className="text-xs font-medium truncate">{app.name}</span>
											</button>
										);
									})}
								</div>
							</div>
						)}

						{/* Life Domains section - dynamic from domains */}
						{domains.length > 0 && (
							<div className="p-2 border-t border-[#D1D1D1] dark:border-[#3a3a3a]">
								<div className="px-2 py-1 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">
									Life Domains
								</div>
								<div className="space-y-0.5">
									{domains.map((domain) => {
										const isActive = currentPath === domain.path;
										// Use shared color system for domain folders
										const node = toFileTreeNode(domain);
										const colorClass = getFolderColorClass(node);
										return (
											<button
												key={domain.path}
												onClick={() => navigateTo(domain.path)}
												className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-colors ${isActive
													? 'bg-[#DA7756] text-white'
													: 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
													}`}
											>
												<svg viewBox="0 0 24 24" className={`w-4 h-4 ${isActive ? '' : colorClass}`} fill={isActive ? 'white' : 'currentColor'}>
													<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
												</svg>
												<span className="text-xs font-medium capitalize truncate">{domain.name}</span>
											</button>
										);
									})}
								</div>
							</div>
						)}

					</div>
				)}

				{/* File list area */}
				<div className="flex-1 flex flex-col min-w-0 bg-[var(--surface-raised)]">
					{loading ? (
						<div className="flex-1 flex items-center justify-center">
							<Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
						</div>
					) : filteredItems.length === 0 ? (
						<div className="flex-1 flex flex-col items-center justify-center text-[#8E8E93]">
							<svg viewBox="0 0 24 24" className="w-16 h-16 mb-3 opacity-30" fill={CLAUDE_CORAL}>
								<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
							</svg>
							<p className="text-sm">
								{searchQuery ? 'No items match your search' : 'This folder is empty'}
							</p>
						</div>
					) : viewMode === 'list' ? (
						/* List View - macOS style */
						<div className="flex-1 overflow-auto">
							{/* Column headers */}
							<div className="sticky top-0 flex items-center px-3 py-1 bg-[#F5F5F5] dark:bg-[#2a2a2a] border-b border-[#E5E5E5] dark:border-[#3a3a3a] text-[10px] font-medium text-[#8E8E93] uppercase tracking-wide">
								<div className="flex-1 min-w-0">Name</div>
								<div className="w-24 text-right">Date Modified</div>
								<div className="w-20 text-right">Size</div>
								<div className="w-16 text-right">Kind</div>
							</div>

							{/* File rows */}
							<div
								className="divide-y divide-[#E5E5E5] dark:divide-[#2a2a2a]"
								onContextMenu={(e) => handleContextMenu(e, null)}
							>
								{filteredItems.map((item) => {
									const isSelected = selectedItem === item.path;
									const isRenaming = renamingItem === item.path;
									const isDragging = dragState?.item.path === item.path;
									const isDropTarget = dragState && dragState.overPath === item.path;
									const isFolder = item.type === 'folder' || item.type === 'domain';
									const kind = isFolder
										? 'Folder'
										: item.type === 'app'
											? 'App'
											: item.name.split('.').pop()?.toUpperCase() || 'File';

									return (
										<div
											key={item.path}
											draggable={!isRenaming}
											onDragStart={(e) => handleDragStart(e, item)}
											onDragOver={(e) => handleDragOver(e, item)}
											onDragLeave={handleDragLeave}
											onDrop={(e) => handleDrop(e, item)}
											onDragEnd={handleDragEnd}
											data-droppable={isFolder ? 'true' : undefined}
											onClick={() => handleItemClick(item)}
											onDoubleClick={() => handleItemDoubleClick(item)}
											onContextMenu={(e) => handleContextMenu(e, item)}
											className={`flex items-center px-3 py-1 cursor-default transition-colors ${isDragging
												? 'opacity-50'
												: isDropTarget
													? 'bg-[#DA7756]/30 ring-2 ring-[#DA7756]'
													: isSelected
														? 'bg-[#DA7756] text-white'
														: 'hover:bg-[#F0F0F0] dark:hover:bg-[#2a2a2a]'
												}`}
										>
											<div className="flex-1 min-w-0 flex items-center gap-2">
												{getFileIcon(item, isSelected)}
												{isRenaming ? (
													<input
														ref={renameInputRef}
														type="text"
														value={renameValue}
														onChange={(e) => setRenameValue(e.target.value)}
														onKeyDown={handleRenameKeyDown}
														onBlur={handleRenameSubmit}
														onClick={(e) => e.stopPropagation()}
														onDoubleClick={(e) => e.stopPropagation()}
														className="text-xs px-1 py-0.5 bg-white dark:bg-gray-800 text-[var(--text-primary)] border border-blue-400 rounded outline-none focus:ring-1 focus:ring-blue-500 min-w-[100px] max-w-[200px]"
														autoFocus
													/>
												) : (
													<span className={`text-xs truncate ${isSelected ? 'text-white' : 'text-[var(--text-primary)]'}`}>
														{item.name}
													</span>
												)}
												{item.type === 'app' && !isRenaming && (
													<span className={`text-[10px] px-1.5 py-0.5 rounded ${isSelected
														? 'bg-white/20 text-white'
														: 'bg-[#DA7756]/10 text-[#DA7756]'
														}`}>
														App
													</span>
												)}
											</div>
											<div className={`w-24 text-right text-[11px] ${isSelected ? 'text-white/80' : 'text-[#8E8E93]'}`}>
												{formatDate(item.modified)}
											</div>
											<div className={`w-20 text-right text-[11px] ${isSelected ? 'text-white/80' : 'text-[#8E8E93]'}`}>
												{formatSize(item.size)}
											</div>
											<div className={`w-16 text-right text-[11px] ${isSelected ? 'text-white/80' : 'text-[#8E8E93]'}`}>
												{kind}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					) : viewMode === 'icons' ? (
						/* Icon View - macOS style */
						<div className="flex-1 overflow-auto p-4">
							<div className="grid grid-cols-4 gap-4">
								{filteredItems.map((item) => {
									const isSelected = selectedItem === item.path;
									const isDragging = dragState?.item.path === item.path;
									const isDropTarget = dragState && dragState.overPath === item.path;
									const isFolder = item.type === 'folder' || item.type === 'domain';

									return (
										<div
											key={item.path}
											draggable
											onDragStart={(e) => handleDragStart(e, item)}
											onDragOver={(e) => handleDragOver(e, item)}
											onDragLeave={handleDragLeave}
											onDrop={(e) => handleDrop(e, item)}
											onDragEnd={handleDragEnd}
											data-droppable={isFolder ? 'true' : undefined}
											onClick={() => handleItemClick(item)}
											onDoubleClick={() => handleItemDoubleClick(item)}
											onContextMenu={(e) => handleContextMenu(e, item)}
											className={`flex flex-col items-center p-2 rounded-lg cursor-default transition-colors ${isDragging
												? 'opacity-50'
												: isDropTarget
													? 'bg-[#DA7756]/30 ring-2 ring-[#DA7756]'
													: isSelected
														? 'bg-[#DA7756]/20'
														: 'hover:bg-black/5 dark:hover:bg-white/5'
												}`}
										>
											{/* Large icon */}
											{isFolder ? (
												(() => {
													const node = toFileTreeNode(item);
													const colorClass = getFolderColorClass(node);
													return (
														<svg viewBox="0 0 24 24" className={`w-14 h-14 mb-1 ${colorClass}`} fill="currentColor">
															<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
														</svg>
													);
												})()
											) : item.type === 'app' ? (
												<div className="w-14 h-14 mb-1 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 shadow-lg" />
											) : CLAUDE_SYSTEM_FILES.has(item.name) ? (
												<div className="relative w-14 h-14 mb-1 flex items-center justify-center">
													<div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center ring-1 ring-[#DA7756]/40">
														<FileText className="w-8 h-8 text-[#DA7756]" />
													</div>
													{/* Claude badge */}
													<div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-[#2a2a2a]">
														<svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
															<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
														</svg>
													</div>
												</div>
											) : (
												<div className="w-14 h-14 mb-1 flex items-center justify-center">
													<FileText className="w-10 h-10 text-gray-400" />
												</div>
											)}
											{/* Name */}
											<span className={`text-[11px] text-center leading-tight px-1 py-0.5 rounded max-w-full truncate ${isSelected
												? 'bg-[#DA7756] text-white'
												: 'text-[var(--text-primary)]'
												}`}>
												{item.name}
											</span>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						/* Column View - macOS Miller columns */
						<div
							ref={columnsContainerRef}
							className="flex-1 flex overflow-x-auto"
						>
							{columns.map((column, columnIndex) => {
								// Filter items in this column by search
								const columnItems = searchQuery
									? column.items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
									: column.items;

								return (
									<div
										key={column.path || 'root'}
										className="min-w-[220px] max-w-[280px] border-r border-[#E5E5E5] dark:border-[#3a3a3a] overflow-y-auto flex-shrink-0"
									>
										{columnItems.length === 0 ? (
											<div className="p-4 text-center text-[#8E8E93] text-xs">
												{searchQuery ? 'No matches' : 'Empty folder'}
											</div>
										) : (
											columnItems.map((item) => {
												const isSelected = column.selected === item.path;
												const isFolder = item.type === 'folder' || item.type === 'domain';

												return (
													<div
														key={item.path}
														onClick={() => handleColumnSelect(columnIndex, item)}
														onDoubleClick={() => handleColumnNavigate(item)}
														onContextMenu={(e) => handleContextMenu(e, item)}
														className={`flex items-center gap-2 px-3 py-1.5 cursor-default transition-colors ${isSelected
															? 'bg-[#DA7756] text-white'
															: 'hover:bg-[#F0F0F0] dark:hover:bg-[#2a2a2a]'
															}`}
													>
														{getFileIcon(item, isSelected)}
														<span className={`flex-1 text-xs truncate ${isSelected ? 'text-white' : 'text-[var(--text-primary)]'}`}>
															{item.name}
														</span>
														{isFolder && (
															<ChevronRight className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-white' : 'text-[#8E8E93]'}`} />
														)}
													</div>
												);
											})
										)}
									</div>
								);
							})}
							{/* Preview column for selected file */}
							{columns.length > 0 && columns[columns.length - 1].selected && (() => {
								const lastColumn = columns[columns.length - 1];
								const selectedFile = lastColumn.items.find(i => i.path === lastColumn.selected);
								if (selectedFile && selectedFile.type === 'file') {
									const isSystemFile = CLAUDE_SYSTEM_FILES.has(selectedFile.name);
									return (
										<div className="min-w-[280px] flex-1 bg-[#FAFAFA] dark:bg-[#1a1a1a] p-4 flex flex-col items-center justify-center text-center">
											{isSystemFile ? (
												<div className="relative mb-3">
													<div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center ring-1 ring-[#DA7756]/40">
														<FileText className="w-10 h-10 text-[#DA7756]" />
													</div>
													<div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center shadow-lg ring-2 ring-[#FAFAFA] dark:ring-[#1a1a1a]">
														<svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="currentColor">
															<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
														</svg>
													</div>
												</div>
											) : (
												<FileText className="w-16 h-16 text-[#8E8E93] mb-3" />
											)}
											<div className="text-sm font-medium text-[var(--text-primary)] mb-1">
												{selectedFile.name}
											</div>
											{isSystemFile && (
												<div className="text-[10px] text-[#DA7756] font-medium mb-1 px-2 py-0.5 rounded bg-[#DA7756]/10">
													Claude System File
												</div>
											)}
											<div className="text-xs text-[#8E8E93]">
												{formatSize(selectedFile.size)} • {formatDate(selectedFile.modified)}
											</div>
										</div>
									);
								}
								return null;
							})()}
						</div>
					)}
				</div>
			</div>

			{/* Path bar - macOS style */}
			<div className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] dark:bg-[#252525] border-t border-[#D1D1D1] dark:border-[#3a3a3a]">
				{pathParts.map((part, i) => (
					<div key={part.path} className="flex items-center">
						{i > 0 && <ChevronRight className="w-3 h-3 text-[#8E8E93] mx-0.5" />}
						<button
							onClick={() => navigateTo(part.path)}
							className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						>
							{i === 0 ? (
								<Monitor className="w-3 h-3 text-[#DA7756]" />
							) : (
								<svg viewBox="0 0 24 24" className="w-3 h-3" fill={CLAUDE_CORAL}>
									<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
								</svg>
							)}
							<span className="text-[11px] text-[var(--text-primary)]">
								{part.name}
							</span>
						</button>
					</div>
				))}

				{/* Item count on right */}
				<div className="ml-auto text-[11px] text-[#8E8E93]">
					{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
				</div>
			</div>

			{/* Context menu is now handled globally by ContextMenu.tsx */}

			{/* Prompt Modal for new file/folder */}
			<PromptModal />
		</div>
	);
}

export default FinderWindowContent;
