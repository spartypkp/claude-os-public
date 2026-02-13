'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileTree, finderMove, finderUpload, listTrash, moveToTrash } from '@/lib/api';
import { CLAUDE_SYSTEM_FILES } from '@/lib/systemFiles';
import { getFolderCategory } from '@/lib/folderCategories';
import { FileTreeNode } from '@/lib/types';
import { useDesktopStore } from '@/store/desktopStore';
import {
	useContextMenuActions,
	useDarkMode,
	useIconActions,
	useQuickLookActions,
	useQuickLookPath,
	useSelectedIcons,
	useWindowActions,
	useWindowStore,
	useWindows,
} from '@/store/windowStore';
import {
	DndContext,
	DragEndEvent,
	DragOverEvent,
	DragOverlay,
	DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarWindowContent } from './apps/calendar/CalendarWindowContent';
import { ContactsWindowContent } from './apps/contacts/ContactsWindowContent';
import { EmailWindowContent } from './apps/email/EmailWindowContent';
import { MessagesWindowContent } from './apps/messages/MessagesWindowContent';
import { FinderWindowContent } from './apps/finder/FinderWindowContent';
import { RolesWindow } from './apps/roles/RolesWindow';
import { SettingsWindowContent } from './apps/settings/SettingsWindowContent';

import { ContextMenu } from './ContextMenu';
import { DesktopIcon } from './DesktopIcon';
import { DesktopIconPreview } from './DesktopIconPreview';
import { DesktopWindow } from './DesktopWindow';
import { DocumentRouter } from './editors/DocumentRouter';
import { QuickLook } from './QuickLook';
import { TrashIcon } from './TrashIcon';

// Grid cell size (must match icon dimensions in DesktopIcon.tsx)
const GRID_CELL_WIDTH = 96;
const GRID_CELL_HEIGHT = 112;

/**
 * Claude OS - Mac-style virtual desktop.
 * Maps to Desktop/ folder.
 */
export function ClaudeOS() {
	// Mount and loading state
	const [mounted, setMounted] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// File tree data
	const [files, setFiles] = useState<FileTreeNode[]>([]);

	// Drag state (dnd-kit for internal icons)
	const [activeDragId, setActiveDragId] = useState<string | null>(null);

	// Native drag-drop state (for files from OS Finder)
	const [isNativeDragOver, setIsNativeDragOver] = useState(false);
	const [isUploading, setIsUploading] = useState(false);

	// Window store - using selectors to avoid re-renders on unrelated state changes
	const windows = useWindows();
	const selectedIcons = useSelectedIcons();
	const quickLookPath = useQuickLookPath();
	const darkMode = useDarkMode();

	// Actions (stable references, won't cause re-renders)
	const { openWindow, openAppWindow, closeFocusedWindow } = useWindowActions();
	const { selectIcon, selectAll, clearSelection } = useIconActions();
	const { toggleQuickLook, closeQuickLook } = useQuickLookActions();
	const { openContextMenu, closeContextMenu } = useContextMenuActions();

	// DnD sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // Prevent accidental drags
			},
		})
	);

	// Mount effect
	useEffect(() => {
		setMounted(true);
	}, []);

	// Load file tree
	const loadTree = useCallback(async () => {
		try {
			setLoading(true);
			const fullTree = await fetchFileTree();
			const docsFolder = fullTree.find(
				(n) => n.name === 'Desktop' && n.type === 'directory'
			);

			if (docsFolder?.children) {
				setFiles(docsFolder.children);
			}
			setError(null);
		} catch (err) {
			console.error('Error loading desktop:', err);
			setError('Failed to load desktop');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!mounted) return;
		loadTree();
	}, [mounted, loadTree]);

	// Desktop store for file sync
	const handleExternalChange = useDesktopStore((state) => state.handleExternalChange);

	// Listen for file system changes
	useFileEvents({
		onCreated: () => loadTree(),
		onDeleted: () => loadTree(),
		onMoved: () => loadTree(),
		onModified: (event) => {
			// Notify desktop store of external modification
			// This will update any open editors tracking this file
			handleExternalChange(event.path, event.mtime);
		},
		enabled: mounted,
	});

	// Listen for refresh events from context menu
	useEffect(() => {
		const handleRefresh = () => {
			loadTree();
		};

		window.addEventListener('refresh-desktop', handleRefresh);
		return () => window.removeEventListener('refresh-desktop', handleRefresh);
	}, [loadTree]);

	// Close file windows when files are moved (path becomes stale)
	useEffect(() => {
		const handleCloseFileWindow = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.path) {
				const { windows, closeWindow } = useWindowStore.getState();
				const win = windows.find(w => w.filePath === detail.path);
				if (win) closeWindow(win.id);
			}
		};

		window.addEventListener('close-file-window', handleCloseFileWindow);
		return () => window.removeEventListener('close-file-window', handleCloseFileWindow);
	}, []);

	// Handle drag start
	const handleDragStart = useCallback((event: DragStartEvent) => {
		setActiveDragId(event.active.id as string);
	}, []);

	// Track if we're over the trash
	const [overTrash, setOverTrash] = useState(false);

	// Handle drag over
	const handleDragOver = useCallback((event: DragOverEvent) => {
		setOverTrash(event.over?.id === 'trash-drop-zone');
	}, []);

	// Handle drag end - reorder icons based on drop position
	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;
			const draggedPath = active.id as string;

			// Check if dropped on trash
			if (over?.id === 'trash-drop-zone') {
				try {
					await moveToTrash(draggedPath);
					// Notify TrashIcon to update count
					window.dispatchEvent(new CustomEvent('trash-updated'));
					// File system watcher will refresh the desktop
				} catch (err) {
					console.error('Failed to move to trash:', err);
					toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
				}
				setActiveDragId(null);
				setOverTrash(false);
				return;
			}

			// Check if dropped on another icon
			if (over && over.id !== draggedPath) {
				const targetPath = over.id as string;
				const targetFile = files.find(f => f.path === targetPath);

				if (targetFile?.type === 'directory') {
					// Drop on folder → move file into it
					try {
						await finderMove(draggedPath, targetPath);
						window.dispatchEvent(new CustomEvent('refresh-desktop'));
						toast.success(`Moved to ${targetFile.name}`);
					} catch (err) {
						console.error('Failed to move:', err);
						toast.error(err instanceof Error ? err.message : 'Failed to move');
					}
				}
				// Drop on non-folder → no-op (no more swapping)
			}

			setActiveDragId(null);
			setOverTrash(false);
		},
		[files]
	);

	// Handle icon selection
	const handleSelectIcon = useCallback(
		(path: string, e: React.MouseEvent) => {
			e.stopPropagation();
			selectIcon(path, e.metaKey || e.ctrlKey);
		},
		[selectIcon]
	);

	// Handle icon open (double-click)
	const handleOpenIcon = useCallback(
		(node: FileTreeNode) => {
			if (node.type === 'file') {
				openWindow(node.path, node.name);
			} else {
				// For directories, open a Finder window at that path
				// Extract relative path from Desktop/ (e.g., "Desktop/career" -> "career")
				const relativePath = node.path.replace(/^Desktop\//, '');
				openAppWindow('finder', relativePath);
			}
		},
		[openWindow, openAppWindow]
	);

	// Handle desktop click (clear selection)
	const handleDesktopClick = useCallback(() => {
		clearSelection();
	}, [clearSelection]);

	// Handle desktop right-click (context menu)
	const handleDesktopContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			// Only show desktop menu if clicking on empty space
			// (icon right-clicks are handled by DesktopIcon)
			openContextMenu(e.clientX, e.clientY, 'desktop');
		},
		[openContextMenu]
	);

	// Handle icon right-click (context menu)
	const handleIconContextMenu = useCallback(
		(path: string, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			// Select the icon if not already selected
			if (!selectedIcons.includes(path)) {
				selectIcon(path);
			}

			// Find the file to get metadata
			const file = files.find(f => f.path === path);
			const isDirectory = file?.type === 'directory';

			// Check if folder has APP-SPEC.md or LIFE-SPEC.md
			let hasAppSpec = false;
			let hasLifeSpec = false;
			if (file?.children) {
				hasAppSpec = file.children.some(c => c.name === 'APP-SPEC.md');
				hasLifeSpec = file.children.some(c => c.name === 'LIFE-SPEC.md');
			}

			openContextMenu(e.clientX, e.clientY, 'icon', path, {
				isDirectory,
				hasAppSpec,
				hasLifeSpec,
			});
		},
		[selectedIcons, selectIcon, openContextMenu, files]
	);

	// Handle trash right-click
	const handleTrashContextMenu = useCallback(
		async (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			// Get current trash count for the menu
			try {
				const result = await listTrash();
				openContextMenu(e.clientX, e.clientY, 'trash', undefined, {
					trashCount: result.count,
				});
			} catch (err) {
				// If we can't get count, still show menu with 0
				openContextMenu(e.clientX, e.clientY, 'trash', undefined, {
					trashCount: 0,
				});
			}
		},
		[openContextMenu]
	);

	// Sort priority: 0=claude system, 1=projects, 2=custom apps, 3=regular folders, 4=regular files
	const getSortGroup = useCallback((node: FileTreeNode): number => {
		if (node.type === 'file') {
			return CLAUDE_SYSTEM_FILES.has(node.name) ? 0 : 4;
		}
		const category = getFolderCategory(node);
		if (category === 'claude-system') return 0;
		if (category === 'project') return 1;
		if (category === 'custom-app') return 2;
		return 3;
	}, []);

	// Sort: claude system → projects → custom apps → regular folders → regular files
	const orderedFiles = useMemo(() => {
		return [...files].sort((a, b) => {
			const aGroup = getSortGroup(a);
			const bGroup = getSortGroup(b);
			if (aGroup !== bGroup) return aGroup - bGroup;
			return a.name.localeCompare(b.name);
		});
	}, [files, getSortGroup]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't handle if typing in an input/textarea
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			const allPaths = files.map((f) => f.path);

			// Cmd+W: Close focused window
			if (e.metaKey && e.key === 'w') {
				e.preventDefault();
				closeFocusedWindow();
				return;
			}

			// Cmd+R: Refresh desktop
			if (e.metaKey && e.key === 'r') {
				e.preventDefault();
				loadTree();
				return;
			}

			// Cmd+A: Select all
			if (e.metaKey && e.key === 'a') {
				e.preventDefault();
				selectAll(allPaths);
				return;
			}

			// Escape: Close Quick Look or clear selection
			if (e.key === 'Escape') {
				e.preventDefault();
				if (quickLookPath) {
					closeQuickLook();
				} else {
					clearSelection();
				}
				return;
			}

			// Space: Toggle Quick Look for selected icon
			if (e.key === ' ') {
				e.preventDefault();
				if (selectedIcons.length === 1) {
					toggleQuickLook(selectedIcons[0]);
				} else if (quickLookPath) {
					closeQuickLook();
				}
				return;
			}

			// Enter: Open selected icons (files and folders)
			if (e.key === 'Enter') {
				e.preventDefault();
				selectedIcons.forEach((path) => {
					const file = files.find((f) => f.path === path);
					if (file) {
						if (file.type === 'file') {
							openWindow(file.path, file.name);
						} else {
							// Open folder in Finder
							const relativePath = file.path.replace(/^Desktop\//, '');
							openAppWindow('finder', relativePath);
						}
					}
				});
				// Close Quick Look if open
				if (quickLookPath) {
					closeQuickLook();
				}
				return;
			}

			// Delete/Backspace: Move selected items to trash
			if (e.key === 'Delete' || e.key === 'Backspace') {
				e.preventDefault();
				if (selectedIcons.length > 0) {
					// Move all selected items to trash
					Promise.all(selectedIcons.map((path) => moveToTrash(path)))
						.then(() => {
							window.dispatchEvent(new CustomEvent('trash-updated'));
							clearSelection();
						})
						.catch((err) => {
							console.error('Failed to move to trash:', err);
							toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
						});
				}
				return;
			}

			// Arrow key navigation - move through ordered files sequentially
			if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
				e.preventDefault();

				// Need at least one selected icon to navigate from
				if (selectedIcons.length === 0 && orderedFiles.length > 0) {
					selectIcon(orderedFiles[0].path);
					return;
				}

				// Navigate from the first selected icon
				const currentPath = selectedIcons[0];
				const currentIndex = orderedFiles.findIndex(f => f.path === currentPath);
				if (currentIndex === -1) return;

				// Calculate target index based on direction
				// Grid flows column-first (vertical), so Up/Down move by 1, Left/Right move by "column height"
				// For simplicity, just use sequential navigation
				let targetIndex = currentIndex;
				switch (e.key) {
					case 'ArrowUp':
					case 'ArrowLeft':
						targetIndex = Math.max(0, currentIndex - 1);
						break;
					case 'ArrowDown':
					case 'ArrowRight':
						targetIndex = Math.min(orderedFiles.length - 1, currentIndex + 1);
						break;
				}

				if (targetIndex !== currentIndex) {
					const targetFile = orderedFiles[targetIndex];
					selectIcon(targetFile.path, e.shiftKey);
					// Update Quick Look if open
					if (quickLookPath && !e.shiftKey) {
						toggleQuickLook(targetFile.path);
					}
				}
				return;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		files,
		orderedFiles,
		selectedIcons,
		quickLookPath,
		selectIcon,
		selectAll,
		clearSelection,
		openWindow,
		openAppWindow,
		closeFocusedWindow,
		toggleQuickLook,
		closeQuickLook,
		loadTree,
	]);

	// Get active drag node for overlay
	const activeDragNode = useMemo(() => {
		if (!activeDragId) return null;
		return files.find((f) => f.path === activeDragId);
	}, [activeDragId, files]);

	// Native drag-drop handlers (for files from macOS Finder or Finder windows)
	const handleNativeDragOver = useCallback((e: React.DragEvent) => {
		// Accept macOS file uploads OR cross-view Claude file drags
		if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/claude-file')) {
			e.preventDefault();
			e.stopPropagation();
			setIsNativeDragOver(true);
		}
	}, []);

	const handleNativeDragLeave = useCallback((e: React.DragEvent) => {
		// Only trigger if leaving the container entirely
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			setIsNativeDragOver(false);
		}
	}, []);

	const handleNativeDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsNativeDragOver(false);

		// Check for cross-view Claude file drag (from Finder window)
		const claudeFile = e.dataTransfer.getData('application/claude-file');
		if (claudeFile) {
			// Move file to Desktop root
			try {
				await finderMove(claudeFile, '');
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
				toast.success('Moved to Desktop');
			} catch (err) {
				console.error('Error moving file:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to move');
			}
			return;
		}

		// Handle macOS file uploads
		const droppedFiles = Array.from(e.dataTransfer.files);
		if (droppedFiles.length === 0) return;

		setIsUploading(true);
		try {
			for (const file of droppedFiles) {
				await finderUpload(file);
			}
			// File watcher will refresh the tree
		} catch (err) {
			console.error('Error uploading files:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to upload files');
		} finally {
			setIsUploading(false);
		}
	}, []);

	// Loading state
	if (loading && files.length === 0) {
		return (
			<div className={`absolute inset-0 flex items-center justify-center ${darkMode ? 'dark' : ''}`}>
				<Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-[#808080]" />
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className={`absolute inset-0 flex items-center justify-center ${darkMode ? 'dark' : ''}`}>
				<div className="text-center">
					<XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
					<p className="text-gray-600 dark:text-[#808080] mb-4">{error}</p>
					<button
						onClick={loadTree}
						className="btn btn-ghost flex items-center gap-2 mx-auto"
					>
						<RefreshCw className="w-4 h-4" />
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			data-testid="desktop"
			className={`relative flex-1 overflow-hidden ${darkMode ? 'dark' : ''}`}
			style={{
				backgroundColor: '#ffffff',
			}}
			onClick={handleDesktopClick}
			onContextMenu={handleDesktopContextMenu}
			onDragOver={handleNativeDragOver}
			onDragLeave={handleNativeDragLeave}
			onDrop={handleNativeDrop}
		>
			{/* Native drag-over indicator */}
			{isNativeDragOver && (
				<div className="absolute inset-4 border-2 border-dashed border-[#DA7756] rounded-xl bg-[#DA7756]/10 z-50 pointer-events-none flex items-center justify-center">
					<div className="text-center">
						<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#DA7756]/20 flex items-center justify-center">
							<svg className="w-8 h-8 text-[#DA7756]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
						</div>
						<p className="text-lg font-medium text-[#DA7756]">Drop files to import</p>
						<p className="text-sm text-[#DA7756]/70 mt-1">Files will be added to your Desktop</p>
					</div>
				</div>
			)}

			{/* Upload progress indicator */}
			{isUploading && (
				<div className="absolute inset-0 bg-black/30 z-50 flex items-center justify-center">
					<div className="bg-white dark:bg-[#2a2a2a] rounded-xl p-6 shadow-2xl flex items-center gap-4">
						<Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
						<span className="text-gray-900 dark:text-white font-medium">Importing files...</span>
					</div>
				</div>
			)}

			{/* Desktop Surface - Menubar and Dock provided by AppShell */}
			<DndContext
				sensors={sensors}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				{/* Icons Grid - CSS Grid handles responsiveness natively */}
				<div
					className="absolute inset-0 p-4 pb-24 overflow-hidden"
					style={{
						display: 'grid',
						gridTemplateColumns: `repeat(auto-fill, ${GRID_CELL_WIDTH}px)`,
						gridTemplateRows: `repeat(auto-fill, ${GRID_CELL_HEIGHT}px)`,
						gridAutoFlow: 'row', // Left-to-right, groups form horizontal bands
						gap: '4px',
						alignContent: 'start',
					}}
				>
					{orderedFiles.map((file) => (
						<DesktopIcon
							key={file.path}
							node={file}
							isSelected={selectedIcons.includes(file.path)}
							onSelect={(e) => handleSelectIcon(file.path, e)}
							onOpen={() => handleOpenIcon(file)}
							onContextMenu={(e) => handleIconContextMenu(file.path, e)}
						/>
					))}
				</div>

				{/* Drag Overlay - lightweight preview for performance */}
				<DragOverlay>
					{activeDragNode && (
						<DesktopIconPreview node={activeDragNode} />
					)}
				</DragOverlay>
			</DndContext>

			{/* Floating Windows */}
			{windows.map((win) => (
				<DesktopWindow key={win.id} window={win}>
					{/* Core App windows */}
					{win.appType === 'calendar' && <CalendarWindowContent />}
					{win.appType === 'finder' && <FinderWindowContent windowId={win.id} initialPath={win.initialPath} />}
					{win.appType === 'settings' && <SettingsWindowContent />}
					{win.appType === 'contacts' && <ContactsWindowContent />}
		{win.appType === 'email' && <EmailWindowContent />}
			{win.appType === 'messages' && <MessagesWindowContent />}
					{win.appType === 'roles' && <RolesWindow />}
					{/* File viewer windows - routes to appropriate editor */}
					{!win.appType && <DocumentRouter filePath={win.filePath} />}
				</DesktopWindow>
			))}

			{/* Trash Icon (hidden per user preference - trash still works via Delete/Backspace keys) */}
			{/* <TrashIcon onContextMenu={handleTrashContextMenu} /> */}

			{/* Quick Look Modal */}
			<QuickLook />

			{/* Context Menu */}
			<ContextMenu />
		</div>
	);
}

export default ClaudeOS;
