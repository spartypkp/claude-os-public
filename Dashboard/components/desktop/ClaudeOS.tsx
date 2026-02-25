'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileTree, finderMove, finderUpload, listTrash, moveToTrash } from '@/lib/api';
import { CLAUDE_SYSTEM_FILES } from '@/lib/systemFiles';
import { getFolderCategory } from '@/lib/folderCategories';
import { initPaths, toDesktopRelative, isDesktopPath, isDirectChild, getDesktopRoot } from '@/lib/pathUtils';
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
	useWindowStack,
	useWindowStore,
	useWindows,
} from '@/store/windowStore';
import { Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CalendarWindowContent } from './apps/calendar/CalendarWindowContent';
import { ContactsWindowContent } from './apps/contacts/ContactsWindowContent';
import { EmailWindowContent } from './apps/email/EmailWindowContent';
import { MessagesWindowContent } from './apps/messages/MessagesWindowContent';
import { FinderWindowContent } from './apps/finder/FinderWindowContent';
import { SettingsWindowContent } from './apps/settings/SettingsWindowContent';
import { ObservatoryWindowContent } from './apps/analytics/ObservatoryWindowContent';
import { ProjectsWindowContent } from './apps/projects/ProjectsWindowContent';

import { ContextMenu } from './ContextMenu';
import { DesktopIcon } from './DesktopIcon';
import { DragGhost } from './DragGhost';
import { DesktopWindow } from './DesktopWindow';
import { DocumentRouter } from './editors/DocumentRouter';
import { QuickLook } from './QuickLook';
import { WindowErrorCard } from '@/components/errors/ErrorBoundaries';
import { ErrorBoundary } from 'react-error-boundary';
import { useDesktopSettings, ICON_SIZES } from '@/store/desktopSettingsStore';

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

	// Rubber band selection state
	const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
	const rubberBandRef = useRef<{ startX: number; startY: number } | null>(null);
	const desktopRef = useRef<HTMLDivElement>(null);

	// Native drag-drop state (for files from OS Finder)
	const [isNativeDragOver, setIsNativeDragOver] = useState(false);
	const [isUploading, setIsUploading] = useState(false);

	// Window store - using selectors to avoid re-renders on unrelated state changes
	const windows = useWindows();
	const windowStack = useWindowStack();
	const selectedIcons = useSelectedIcons();
	const quickLookPath = useQuickLookPath();
	const darkMode = useDarkMode();

	// Desktop settings
	const gridFlow = useDesktopSettings((s) => s.gridFlow);
	const iconSize = useDesktopSettings((s) => s.iconSize);
	const gridAlignment = useDesktopSettings((s) => s.gridAlignment);
	const sortOrder = useDesktopSettings((s) => s.sortOrder);
	const showExtensions = useDesktopSettings((s) => s.showExtensions);
	const sizeConfig = ICON_SIZES[iconSize];

	// Actions (stable references, won't cause re-renders)
	const { openWindow, openAppWindow, closeFocusedWindow } = useWindowActions();
	const { selectIcon, selectAll, clearSelection } = useIconActions();
	const { toggleQuickLook, closeQuickLook } = useQuickLookActions();
	const { openContextMenu, closeContextMenu } = useContextMenuActions();

	// Mount effect
	useEffect(() => {
		setMounted(true);
	}, []);

	// Load file tree
	const loadTree = useCallback(async () => {
		try {
			setLoading(true);
			const response = await fetchFileTree();
			// Initialize path roots for the entire app
			if (response.repoRoot && response.desktopRoot) {
				initPaths(response.repoRoot, response.desktopRoot);
			}
			const tree = response.tree || [];
			const treeArray = Array.isArray(tree) ? tree : [];
			const docsFolder = treeArray.find(
				(n: FileTreeNode) => n.name === 'Desktop' && n.type === 'directory'
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

	// Debounced loadTree for rapid SSE events (file create/delete/move bursts)
	const loadTreeTimerRef = useRef<NodeJS.Timeout | null>(null);
	const debouncedLoadTree = useCallback(() => {
		if (loadTreeTimerRef.current) clearTimeout(loadTreeTimerRef.current);
		loadTreeTimerRef.current = setTimeout(() => loadTree(), 300);
	}, [loadTree]);

	// Desktop store for file sync
	const handleExternalChange = useDesktopStore((state) => state.handleExternalChange);

	// Listen for file system changes
	useFileEvents({
		onCreated: () => debouncedLoadTree(),
		onDeleted: () => debouncedLoadTree(),
		onMoved: () => debouncedLoadTree(),
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
			debouncedLoadTree();
		};

		window.addEventListener('refresh-desktop', handleRefresh);
		return () => window.removeEventListener('refresh-desktop', handleRefresh);
	}, [debouncedLoadTree]);

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
				const dirName = toDesktopRelative(node.path);
				openAppWindow('finder', dirName);
			}
		},
		[openWindow, openAppWindow]
	);

	// Handle desktop click (clear selection)
	const handleDesktopClick = useCallback(() => {
		clearSelection();
	}, [clearSelection]);

	// Rubber band selection
	const handleDesktopMouseDown = useCallback((e: React.MouseEvent) => {
		// Only start rubber band on left click on the desktop background itself
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		// Only trigger on the desktop container or icon grid (not on icons, windows, etc.)
		if (!target.hasAttribute('data-testid') && !target.closest('[data-testid="desktop"]')) return;
		// Don't start on icons or windows
		if (target.closest('[data-icon-path]') || target.closest('[data-testid^="app-window"]')) return;

		rubberBandRef.current = { startX: e.clientX, startY: e.clientY };
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!rubberBandRef.current) return;
			const dx = Math.abs(e.clientX - rubberBandRef.current.startX);
			const dy = Math.abs(e.clientY - rubberBandRef.current.startY);
			// Only start showing rubber band after 5px of movement (avoid accidental)
			if (dx < 5 && dy < 5 && !rubberBand) return;

			const band = {
				startX: rubberBandRef.current.startX,
				startY: rubberBandRef.current.startY,
				currentX: e.clientX,
				currentY: e.clientY,
			};
			setRubberBand(band);

			// Calculate rubber band rect
			const left = Math.min(band.startX, band.currentX);
			const top = Math.min(band.startY, band.currentY);
			const right = Math.max(band.startX, band.currentX);
			const bottom = Math.max(band.startY, band.currentY);

			// Find intersecting icons
			const selected: string[] = [];
			const iconEls = document.querySelectorAll('[data-icon-path]');
			iconEls.forEach((el) => {
				const rect = el.getBoundingClientRect();
				// Check intersection
				if (rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom) {
					const path = el.getAttribute('data-icon-path');
					if (path) selected.push(path);
				}
			});
			if (selected.length > 0) {
				selectAll(selected);
			} else {
				clearSelection();
			}
		};

		const handleMouseUp = () => {
			rubberBandRef.current = null;
			setRubberBand(null);
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, [rubberBand, selectAll, clearSelection]);

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

	// Sort based on setting
	const orderedFiles = useMemo(() => {
		return [...files].sort((a, b) => {
			switch (sortOrder) {
				case 'category': {
					const aGroup = getSortGroup(a);
					const bGroup = getSortGroup(b);
					if (aGroup !== bGroup) return aGroup - bGroup;
					return a.name.localeCompare(b.name);
				}
				case 'name':
					return a.name.localeCompare(b.name);
				case 'kind': {
					// Directories first, then by extension, then by name
					if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
					if (a.type === 'file' && b.type === 'file') {
						const aExt = a.name.split('.').pop() || '';
						const bExt = b.name.split('.').pop() || '';
						if (aExt !== bExt) return aExt.localeCompare(bExt);
					}
					return a.name.localeCompare(b.name);
				}
				default:
					return a.name.localeCompare(b.name);
			}
		});
	}, [files, getSortGroup, sortOrder]);

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
					// Get the icon's bounding rect for animation origin
					const iconEl = document.querySelector(`[data-icon-path="${CSS.escape(selectedIcons[0])}"]`);
					const rect = iconEl?.getBoundingClientRect();
					const origin = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined;
					toggleQuickLook(selectedIcons[0], origin);
				} else if (quickLookPath) {
					closeQuickLook();
				}
				return;
			}

			// Enter: Open selected icons (files and folders)
			if (e.key === 'Enter') {
				e.preventDefault();
				selectedIcons.forEach((iconPath) => {
					const file = files.find((f) => f.path === iconPath);
					if (file) {
						if (file.type === 'file') {
							openWindow(file.path, file.name);
						} else {
							// Open folder in Finder
							openAppWindow('finder', toDesktopRelative(file.path));
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

	// Native drag-drop handlers (for files from macOS Finder, Finder windows, and internal icon drags)
	const handleNativeDragOver = useCallback((e: React.DragEvent) => {
		// Accept macOS file uploads, cross-view Claude file drags, and internal multi-file drags
		if (
			e.dataTransfer.types.includes('Files') ||
			e.dataTransfer.types.includes('application/claude-file') ||
			e.dataTransfer.types.includes('application/claude-files')
		) {
			e.preventDefault();
			e.stopPropagation();
			// Only show overlay for external macOS file imports
			if (e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('application/claude-file')) {
				setIsNativeDragOver(true);
			}
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

		// Handle macOS file uploads first (has actual File objects)
		const droppedFiles = Array.from(e.dataTransfer.files);
		if (droppedFiles.length > 0 && !e.dataTransfer.types.includes('application/claude-file')) {
			setIsUploading(true);
			try {
				for (const file of droppedFiles) {
					await finderUpload(file);
				}
			} catch (err) {
				console.error('Error uploading files:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to upload files');
			} finally {
				setIsUploading(false);
			}
			return;
		}

		// Handle multi-file internal moves to Desktop root
		const multiPaths = e.dataTransfer.getData('application/claude-files');
		if (multiPaths) {
			try {
				const paths: string[] = JSON.parse(multiPaths);
				const desktopRoot = getDesktopRoot();
				// Only move files that aren't already at Desktop root
				const toMove = paths.filter(p => {
					if (!isDesktopPath(p)) return false;
					return !isDirectChild(p, desktopRoot || 'Desktop');
				});
				if (toMove.length === 0) return;
				for (const p of toMove) {
					await finderMove(p, desktopRoot || '');
				}
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
				toast.success(toMove.length === 1 ? 'Moved to Desktop' : `Moved ${toMove.length} items to Desktop`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to move');
			}
			return;
		}

		// Handle single cross-view Claude file drag (from Finder window)
		const claudeFile = e.dataTransfer.getData('application/claude-file');
		if (claudeFile) {
			try {
				await finderMove(claudeFile, getDesktopRoot() || '');
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
				toast.success('Moved to Desktop');
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to move');
			}
			return;
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
			ref={desktopRef}
			data-testid="desktop"
			className={`relative flex-1 overflow-hidden ${darkMode ? 'dark' : ''}`}
			style={{
				backgroundColor: '#ffffff',
			}}
			onClick={handleDesktopClick}
			onMouseDown={handleDesktopMouseDown}
			onContextMenu={handleDesktopContextMenu}
			onDragOver={handleNativeDragOver}
			onDragLeave={handleNativeDragLeave}
			onDrop={handleNativeDrop}
		>
			{/* Native drag-over indicator */}
			{isNativeDragOver && (
				<div className="absolute inset-4 border-2 border-dashed border-[var(--color-claude)] rounded-xl bg-[var(--color-claude)]/10 z-50 pointer-events-none flex items-center justify-center">
					<div className="text-center">
						<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-claude)]/20 flex items-center justify-center">
							<svg className="w-8 h-8 text-[var(--color-claude)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
						</div>
						<p className="text-lg font-medium text-[var(--color-claude)]">Drop files to import</p>
						<p className="text-sm text-[var(--color-claude)]/70 mt-1">Files will be added to your Desktop</p>
					</div>
				</div>
			)}

			{/* Upload progress indicator */}
			{isUploading && (
				<div className="absolute inset-0 bg-black/30 z-50 flex items-center justify-center">
					<div className="bg-white dark:bg-[#2a2a2a] rounded-xl p-6 shadow-2xl flex items-center gap-4">
						<Loader2 className="w-6 h-6 animate-spin text-[var(--color-claude)]" />
						<span className="text-gray-900 dark:text-white font-medium">Importing files...</span>
					</div>
				</div>
			)}

			{/* Icons Grid - CSS Grid handles responsiveness natively */}
			<div
				className="absolute inset-0 p-4 pb-24 overflow-hidden"
				style={{
					display: 'grid',
					gridTemplateColumns: gridFlow === 'row'
						? `repeat(auto-fill, ${sizeConfig.cellWidth}px)`
						: undefined,
					gridTemplateRows: gridFlow === 'column'
						? `repeat(auto-fill, ${sizeConfig.cellHeight}px)`
						: `repeat(auto-fill, ${sizeConfig.cellHeight}px)`,
					...(gridFlow === 'column' ? {
						gridAutoFlow: 'column',
						gridAutoColumns: `${sizeConfig.cellWidth}px`,
					} : {
						gridAutoFlow: 'row',
					}),
					gap: '4px',
					alignContent: 'start',
					justifyContent: gridAlignment === 'right' ? 'end' : 'start',
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

			{/* Hidden drag ghost for setDragImage() */}
			<DragGhost files={files} />

			{/* Floating Windows */}
			{windows.map((win) => (
				<DesktopWindow key={win.id} window={win} isFocused={windowStack[0] === win.id}>
					<ErrorBoundary
						FallbackComponent={(props) => (
							<WindowErrorCard
								{...props}
								windowTitle={win.title}
								onClose={() => useWindowStore.getState().closeWindow(win.id)}
							/>
						)}
						onError={(e) => console.error(`[Window:${win.title}]`, e)}
						resetKeys={[win.filePath]}
					>
						{/* Core App windows */}
						{win.appType === 'calendar' && <CalendarWindowContent />}
						{win.appType === 'finder' && <FinderWindowContent windowId={win.id} initialPath={win.initialPath} />}
						{win.appType === 'settings' && <SettingsWindowContent />}
						{win.appType === 'contacts' && <ContactsWindowContent initialContactName={win.initialPath} />}
						{win.appType === 'email' && <EmailWindowContent />}
						{win.appType === 'messages' && <MessagesWindowContent />}
						{win.appType === 'analytics' && <ObservatoryWindowContent />}
						{win.appType === 'projects' && <ProjectsWindowContent />}
						{/* File viewer windows - routes to appropriate editor */}
						{!win.appType && <DocumentRouter filePath={win.filePath} />}
					</ErrorBoundary>
				</DesktopWindow>
			))}

			{/* Trash works via Delete/Backspace keys and context menu */}

			{/* Quick Look Modal */}
			<QuickLook />

			{/* Rubber Band Selection */}
			{rubberBand && (
				<div
					className="fixed pointer-events-none z-[800]"
					style={{
						left: Math.min(rubberBand.startX, rubberBand.currentX),
						top: Math.min(rubberBand.startY, rubberBand.currentY),
						width: Math.abs(rubberBand.currentX - rubberBand.startX),
						height: Math.abs(rubberBand.currentY - rubberBand.startY),
						border: '1px solid var(--color-claude)',
						background: 'var(--color-claude-dim)',
						borderRadius: '2px',
					}}
				/>
			)}

			{/* Context Menu */}
			<ContextMenu />
		</div>
	);
}

export default ClaudeOS;
