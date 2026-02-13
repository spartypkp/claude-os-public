'use client';

import { API_BASE, finderCreateFile, finderCreateFolder, finderUpload, moveToTrash, openInMacOS } from '@/lib/api';
import { getExplanation, getExplanationKey } from '@/lib/explanations';
import { showInFinder } from '@/lib/fileNavigation';
import { CLAUDE_SYSTEM_FILES } from '@/lib/systemFiles';
import { useWindowStore } from '@/store/windowStore';
import { getRoleConfig } from '@/lib/sessionUtils';
import {
	ArrowDownAZ,
	BookOpen,
	Calendar,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	ClipboardCopy,
	Code,
	Code2,
	Crown,
	Download,
	ExternalLink,
	FilePlus,
	FileText,
	FolderInput,
	FolderOpen,
	FolderPlus,
	Folders,
	Grid3X3,
	HelpCircle,
	Import,
	Info,
	LayoutGrid,
	Lightbulb,
	Lock,
	MessageSquarePlus,
	Monitor,
	Pencil,
	Play,
	RefreshCw,
	Rocket,
	RotateCcw,
	Target,
	Terminal,
	Trash2,
	X,
	XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExplanationTooltip } from './ExplanationTooltip';
import { GetInfoPanel } from './GetInfoPanel';
import { MoveToModal } from './MoveToModal';
import { SessionInfoPanel } from './SessionInfoPanel';
import { toast } from 'sonner';

// Determine target type from path and metadata
// Note: 'finder-empty' maps to same behavior as 'desktop' but creates files in currentDirectory
type TargetType = 'file' | 'folder' | 'system-file' | 'life-domain' | 'custom-app' | 'desktop' | 'trash' | 'widget' | 'dock-app' | 'dock-session' | 'dock-minimized' | 'panel-chief' | 'panel-specialist' | 'panel-attachment';

interface MenuItemProps {
	icon: React.ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
	disabled?: boolean;
	destructive?: boolean;
	hasSubmenu?: boolean;
}

function MenuItem({ icon, label, shortcut, onClick, disabled, destructive, hasSubmenu }: MenuItemProps) {
	return (
		<button
			className={`
        w-full flex items-center gap-3 px-3 py-1.5 text-left text-[13px]
        rounded transition-colors
        ${disabled
					? 'text-gray-400 dark:text-[#666] cursor-not-allowed'
					: destructive
						? 'text-red-400 hover:bg-red-500/20'
						: 'text-gray-900 dark:text-[#e0e0e0] hover:bg-gray-100 dark:hover:bg-white/10'
				}
      `}
			onClick={disabled ? undefined : onClick}
			disabled={disabled}
		>
			<span className="w-4 h-4 shrink-0">{icon}</span>
			<span className="flex-1">{label}</span>
			{shortcut && !hasSubmenu && (
				<span className="text-[11px] text-gray-500 dark:text-[#808080]">{shortcut}</span>
			)}
			{hasSubmenu && (
				<ChevronRight className="w-3 h-3 text-gray-400" />
			)}
		</button>
	);
}

function Separator() {
	return <div className="h-px bg-gray-200 dark:bg-white/10 my-1" />;
}

// Branded header for special item types
function BrandedHeader({ icon, title, subtitle, color }: {
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	color: string;
}) {
	return (
		<div className={`px-3 py-2 flex items-center gap-2.5 ${color} border-b border-gray-200 dark:border-white/10`}>
			<div className="w-5 h-5 shrink-0">
				{icon}
			</div>
			<div className="flex-1 min-w-0">
				<div className="text-[12px] font-semibold truncate">{title}</div>
				<div className="text-[10px] opacity-70">{subtitle}</div>
			</div>
		</div>
	);
}

// Submenu component
function Submenu({ label, icon, children, onSelect }: {
	label: string;
	icon: React.ReactNode;
	children: { label: string; icon?: React.ReactNode; value: string; }[];
	onSelect: (value: string) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const submenuRef = useRef<HTMLDivElement>(null);

	return (
		<div
			className="relative"
			onMouseEnter={() => setIsOpen(true)}
			onMouseLeave={() => setIsOpen(false)}
		>
			<MenuItem
				icon={icon}
				label={label}
				onClick={() => { }}
				hasSubmenu
			/>
			{isOpen && (
				<div
					ref={submenuRef}
					className="absolute left-full top-0 ml-1 min-w-[160px] py-1.5 rounded-lg z-[10001]
            bg-white dark:bg-[#2a2a2a]/95 backdrop-blur-xl
            border border-gray-200 dark:border-white/10
            shadow-2xl shadow-black/10 dark:shadow-black/50"
					onMouseDown={(e) => e.stopPropagation()}
				>
					{children.map((item) => (
						<button
							key={item.value}
							className="w-full flex items-center gap-3 px-3 py-1.5 text-left text-[13px]
                text-gray-900 dark:text-[#e0e0e0] hover:bg-gray-100 dark:hover:bg-white/10
                rounded transition-colors"
							onClick={(e) => {
								e.stopPropagation();
								onSelect(item.value);
								setIsOpen(false);
							}}
							onMouseDown={(e) => e.stopPropagation()}
						>
							{item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
							<span className="flex-1">{item.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export function ContextMenu() {
	const menuRef = useRef<HTMLDivElement>(null);
	const promptInputRef = useRef<HTMLInputElement>(null);
	const router = useRouter();
	const { contextMenu, closeContextMenu, openWindow, openAppWindow, startRename } = useWindowStore();
	const [isDeleting, setIsDeleting] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [showExplanation, setShowExplanation] = useState(false);
	const [explanationAnchor, setExplanationAnchor] = useState<DOMRect | undefined>();
	const [showGetInfo, setShowGetInfo] = useState(false);
	const [getInfoPath, setGetInfoPath] = useState<string | null>(null);
	const [showWhyProtected, setShowWhyProtected] = useState(false);
	const [showSessionInfo, setShowSessionInfo] = useState(false);
	const [sessionInfoId, setSessionInfoId] = useState<string | null>(null);
	const [showMoveTo, setShowMoveTo] = useState(false);
	const [moveToPath, setMoveToPath] = useState<string | null>(null);
	const [moveToName, setMoveToName] = useState('');

	// Custom prompt modal state
	const [promptModal, setPromptModal] = useState<{
		title: string;
		placeholder: string;
		defaultValue?: string;
		onSubmit: (value: string) => void;
	} | null>(null);
	const [promptValue, setPromptValue] = useState('');

	// Focus input when prompt modal opens
	useEffect(() => {
		if (promptModal && promptInputRef.current) {
			setTimeout(() => promptInputRef.current?.focus(), 50);
		}
	}, [promptModal]);

	// Handle prompt submit
	const handlePromptSubmit = useCallback(() => {
		if (promptModal && promptValue.trim()) {
			promptModal.onSubmit(promptValue.trim());
		}
		setPromptModal(null);
		setPromptValue('');
	}, [promptModal, promptValue]);

	// Handle prompt cancel
	const handlePromptCancel = useCallback(() => {
		setPromptModal(null);
		setPromptValue('');
		closeContextMenu();
	}, [closeContextMenu]);

	// Show custom prompt modal (replaces browser prompt)
	const showPrompt = useCallback((title: string, placeholder: string, onSubmit: (value: string) => void, defaultValue?: string) => {
		setPromptValue(defaultValue || '');
		setPromptModal({ title, placeholder, defaultValue, onSubmit });
	}, []);

	// Determine target type
	// The context menu is target-aware: same menu for same item type regardless of location
	const targetInfo = useMemo(() => {
		// Special target types that don't have paths
		if (contextMenu?.targetType === 'trash') {
			return { type: 'trash' as TargetType, fileName: 'Trash', isDir: false };
		}

		if (contextMenu?.targetType === 'widget') {
			const widgetName = contextMenu.widgetType === 'priorities' ? 'Priorities'
				: contextMenu.widgetType === 'calendar' ? 'Calendar'
					: contextMenu.widgetType === 'sessions' ? 'Sessions'
						: 'Widget';
			return { type: 'widget' as TargetType, fileName: widgetName, isDir: false };
		}

		if (contextMenu?.targetType === 'dock-app') {
			return { type: 'dock-app' as TargetType, fileName: contextMenu.dockAppName || 'App', isDir: false };
		}

		if (contextMenu?.targetType === 'dock-session') {
			return { type: 'dock-session' as TargetType, fileName: contextMenu.dockSessionRole || 'Session', isDir: false };
		}

		if (contextMenu?.targetType === 'dock-minimized') {
			return { type: 'dock-minimized' as TargetType, fileName: contextMenu.minimizedWindowTitle || 'Window', isDir: false };
		}

		if (contextMenu?.targetType === 'panel-chief') {
			return { type: 'panel-chief' as TargetType, fileName: 'Chief', isDir: false };
		}

		if (contextMenu?.targetType === 'panel-specialist') {
			const roleName = contextMenu.panelSessionRole || 'Specialist';
			return { type: 'panel-specialist' as TargetType, fileName: roleName.charAt(0).toUpperCase() + roleName.slice(1), isDir: false };
		}

		if (contextMenu?.targetType === 'panel-attachment') {
			return { type: 'panel-attachment' as TargetType, fileName: contextMenu.attachmentName || 'File', isDir: false };
		}

		// No target path means empty space (desktop or finder background)
		if (!contextMenu?.targetPath) {
			return { type: 'desktop' as TargetType, fileName: '', isDir: false };
		}

		const path = contextMenu.targetPath;
		const fileName = path.split('/').pop() || '';
		const isDir = contextMenu.isDirectory ?? !fileName.includes('.');

		// Check for Claude System Files
		if (CLAUDE_SYSTEM_FILES.has(fileName)) {
			return { type: 'system-file' as TargetType, fileName, isDir: false };
		}

		// Check for special folders (from metadata passed in contextMenu)
		if (contextMenu.hasLifeSpec) {
			return { type: 'life-domain' as TargetType, fileName, isDir: true };
		}

		if (contextMenu.hasAppSpec) {
			return { type: 'custom-app' as TargetType, fileName, isDir: true };
		}

		// Regular file or folder
		return {
			type: (isDir ? 'folder' : 'file') as TargetType,
			fileName,
			isDir
		};
	}, [contextMenu]);

	// Get the directory to create new files/folders in
	// Uses currentDirectory if available (Finder context), otherwise creates at Desktop root
	const createDirectory = contextMenu?.currentDirectory ?? '';

	// Get explanation for target item (if it's a system item)
	const explanation = useMemo(() => {
		if (!contextMenu?.targetPath) return undefined;
		const name = contextMenu.targetPath.split('/').pop() || '';
		const isDir = targetInfo.isDir;
		const key = getExplanationKey(
			name,
			isDir ? 'directory' : 'file',
			{ hasAppSpec: targetInfo.type === 'custom-app', hasLifeSpec: targetInfo.type === 'life-domain' }
		);
		return key ? getExplanation(key) : undefined;
	}, [contextMenu?.targetPath, targetInfo]);

	// Close on click outside
	useEffect(() => {
		if (!contextMenu) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				closeContextMenu();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				closeContextMenu();
			}
		};

		setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
		}, 0);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [contextMenu, closeContextMenu]);

	// Listen for "open-move-to" events (from PathBar, etc.)
	useEffect(() => {
		const handleOpenMoveTo = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.path) {
				setMoveToPath(detail.path);
				setMoveToName(detail.name || detail.path.split('/').pop() || 'item');
				setShowMoveTo(true);
			}
		};
		window.addEventListener('open-move-to', handleOpenMoveTo);
		return () => window.removeEventListener('open-move-to', handleOpenMoveTo);
	}, []);

	// === ACTIONS ===

	const handleOpen = useCallback(() => {
		if (contextMenu?.targetPath) {
			// Check if this is a directory
			if (contextMenu.isDirectory || contextMenu.hasLifeSpec || contextMenu.hasAppSpec) {
				const relativePath = contextMenu.targetPath.replace(/^Desktop\//, '');

				// If we're in a Finder window (has sourceWindowId), dispatch navigate event
				// Otherwise, open a new Finder window
				if (contextMenu.targetType === 'finder-item' && contextMenu.sourceWindowId) {
					// Navigate within the current Finder window
					window.dispatchEvent(new CustomEvent('finder-navigate', {
						detail: { path: relativePath, windowId: contextMenu.sourceWindowId }
					}));
				} else {
					// Open folder in new Finder window (from Desktop)
					openAppWindow('finder', relativePath);
				}
			} else {
				// Open file in document viewer window
				const name = contextMenu.targetPath.split('/').pop() || 'Untitled';
				openWindow(contextMenu.targetPath, name);
			}
		}
		closeContextMenu();
	}, [contextMenu, openWindow, openAppWindow, closeContextMenu]);

	const handleOpenInNewWindow = useCallback(() => {
		if (contextMenu?.targetPath) {
			// Extract relative path from Desktop/ (e.g., "Desktop/career" -> "career")
			const relativePath = contextMenu.targetPath.replace(/^Desktop\//, '');
			// Open the folder in a new Finder window at that path
			openAppWindow('finder', relativePath);
		}
		closeContextMenu();
	}, [contextMenu, openAppWindow, closeContextMenu]);

	const handleGetInfo = useCallback(() => {
		if (contextMenu?.targetPath) {
			setGetInfoPath(contextMenu.targetPath);
			setShowGetInfo(true);
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleRename = useCallback(() => {
		if (contextMenu?.targetPath) {
			startRename(contextMenu.targetPath);
		}
		closeContextMenu();
	}, [contextMenu, startRename, closeContextMenu]);

	const handleMoveToTrash = useCallback(async () => {
		if (contextMenu?.targetPath) {
			setIsDeleting(true);
			try {
				await moveToTrash(contextMenu.targetPath);
				window.dispatchEvent(new CustomEvent('trash-updated'));
			} catch (err) {
				console.error('Error moving to trash:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
			} finally {
				setIsDeleting(false);
			}
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleCopyPath = useCallback(() => {
		if (contextMenu?.targetPath) {
			navigator.clipboard.writeText(contextMenu.targetPath);
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleShowInFinder = useCallback(() => {
		if (contextMenu?.targetPath) {
			showInFinder(contextMenu.targetPath, { openAppWindow });
		}
		closeContextMenu();
	}, [contextMenu, openAppWindow, closeContextMenu]);

	const handleMoveTo = useCallback(() => {
		if (contextMenu?.targetPath) {
			setMoveToPath(contextMenu.targetPath);
			setMoveToName(contextMenu.targetPath.split('/').pop() || 'item');
			setShowMoveTo(true);
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleOpenWith = useCallback((app: string) => {
		if (!contextMenu?.targetPath) return;

		if (app === 'vscode') {
			window.open(`vscode://file${contextMenu.targetPath}`, '_blank');
		} else if (app === 'cursor') {
			window.open(`cursor://file${contextMenu.targetPath}`, '_blank');
		} else if (app === 'default') {
			handleOpen();
			return; // handleOpen already closes context menu
		}
		closeContextMenu();
	}, [contextMenu, handleOpen, closeContextMenu]);

	const handleExport = useCallback(() => {
		if (contextMenu?.targetPath) {
			const fileName = contextMenu.targetPath.split('/').pop() || 'file';
			const rawPath = contextMenu.targetPath.replace(/^Desktop\//, '');
			const downloadUrl = `${API_BASE}/api/files/raw/${encodeURIComponent(rawPath)}`;
			const link = document.createElement('a');
			link.href = downloadUrl;
			link.download = fileName;
			link.style.display = 'none';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleOpenInMacOS = useCallback(async () => {
		if (contextMenu?.targetPath) {
			try {
				await openInMacOS(contextMenu.targetPath);
			} catch (err) {
				console.error('Error opening in macOS:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to open in macOS');
			}
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleAttachToChat = useCallback(() => {
		if (contextMenu?.targetPath) {
			window.dispatchEvent(new CustomEvent('attach-to-chat', {
				detail: { path: contextMenu.targetPath }
			}));
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleExplainThis = useCallback(() => {
		if (explanation && menuRef.current) {
			setExplanationAnchor(menuRef.current.getBoundingClientRect());
			setShowExplanation(true);
		} else {
			closeContextMenu();
		}
	}, [explanation, closeContextMenu]);

	const handleWhyProtected = useCallback(() => {
		setShowWhyProtected(true);
	}, []);

	// === FOLDER ACTIONS ===

	const handleNewFileInside = useCallback(() => {
		if (!contextMenu?.targetPath) return;
		const targetPath = contextMenu.targetPath;
		const sourceWindowId = contextMenu.sourceWindowId;

		showPrompt('New File', 'Enter filename (e.g., notes.md)', async (fileName) => {
			setIsCreating(true);
			try {
				const fullPath = `${targetPath}/${fileName}`;
				// Add default content for markdown files
				let content = '';
				if (fileName.endsWith('.md')) {
					const baseName = fileName.replace(/\.md$/, '');
					content = `# ${baseName}\n\n`;
				}
				await finderCreateFile(fullPath, content);
				// Refresh the view
				window.dispatchEvent(new CustomEvent('refresh-finder', {
					detail: { windowId: sourceWindowId }
				}));
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
			} catch (err) {
				console.error('Error creating file:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to create file');
			} finally {
				setIsCreating(false);
			}
			closeContextMenu();
		});
	}, [contextMenu, closeContextMenu, showPrompt]);

	const handleNewFolderInside = useCallback(() => {
		if (!contextMenu?.targetPath) return;
		const targetPath = contextMenu.targetPath;
		const sourceWindowId = contextMenu.sourceWindowId;

		showPrompt('New Folder', 'Enter folder name', async (name) => {
			setIsCreating(true);
			try {
				const fullPath = `${targetPath}/${name}`;
				await finderCreateFolder(fullPath);
				// Refresh the view
				window.dispatchEvent(new CustomEvent('refresh-finder', {
					detail: { windowId: sourceWindowId }
				}));
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
			} catch (err) {
				console.error('Error creating folder:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to create folder');
			} finally {
				setIsCreating(false);
			}
			closeContextMenu();
		});
	}, [contextMenu, closeContextMenu, showPrompt]);

	// === LIFE DOMAIN ACTIONS ===

	const handleOpenLifeSpec = useCallback(() => {
		if (contextMenu?.targetPath) {
			const specPath = `${contextMenu.targetPath}/LIFE-SPEC.md`;
			openWindow(specPath, 'LIFE-SPEC.md');
		}
		closeContextMenu();
	}, [contextMenu, openWindow, closeContextMenu]);

	// === CUSTOM APP ACTIONS ===

	const handleLaunchApp = useCallback(() => {
		if (contextMenu?.targetPath) {
			const appName = contextMenu.targetPath.split('/').pop() || '';
			const route = `/${appName}`;
			router.push(route);
		}
		closeContextMenu();
	}, [contextMenu, router, closeContextMenu]);

	const handleOpenAppSpec = useCallback(() => {
		if (contextMenu?.targetPath) {
			const specPath = `${contextMenu.targetPath}/APP-SPEC.md`;
			openWindow(specPath, 'APP-SPEC.md');
		}
		closeContextMenu();
	}, [contextMenu, openWindow, closeContextMenu]);

	const handleUninstallApp = useCallback(async () => {
		const confirmed = window.confirm(
			'Uninstall this application? This will move it to Trash.'
		);
		if (confirmed) {
			await handleMoveToTrash();
		} else {
			closeContextMenu();
		}
	}, [handleMoveToTrash, closeContextMenu]);

	const handleRequestFeature = useCallback(() => {
		if (contextMenu?.targetPath) {
			const appName = contextMenu.targetPath.split('/').pop() || 'this app';
			window.dispatchEvent(new CustomEvent('ask-chief', {
				detail: {
					path: contextMenu.targetPath,
					itemName: appName,
					message: `I'd like to request a feature for ${appName}: `
				}
			}));
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	// === TRASH ACTIONS ===

	const handleOpenTrash = useCallback(() => {
		// Open Finder at trash location (or a dedicated trash view)
		openAppWindow('finder');
		// TODO: Navigate to trash folder when Finder supports it
		closeContextMenu();
	}, [openAppWindow, closeContextMenu]);

	const handleEmptyTrash = useCallback(async () => {
		const confirmed = window.confirm(
			'Are you sure you want to permanently delete all items in Trash? This cannot be undone.'
		);
		if (confirmed) {
			try {
				const response = await fetch(`${API_BASE}/api/files/trash/empty`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({}),
				});
				if (!response.ok) throw new Error('Failed to empty trash');
				window.dispatchEvent(new CustomEvent('trash-updated'));
			} catch (err) {
				console.error('Error emptying trash:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to empty trash');
			}
		}
		closeContextMenu();
	}, [closeContextMenu]);

	// === WIDGET ACTIONS ===

	const handleCollapseWidget = useCallback(() => {
		if (contextMenu?.widgetId) {
			const { toggleWidgetCollapse } = useWindowStore.getState();
			toggleWidgetCollapse(contextMenu.widgetId);
		}
		closeContextMenu();
	}, [contextMenu?.widgetId, closeContextMenu]);

	const handleRemoveWidget = useCallback(() => {
		if (contextMenu?.widgetId) {
			const { removeWidget } = useWindowStore.getState();
			removeWidget(contextMenu.widgetId);
		}
		closeContextMenu();
	}, [contextMenu?.widgetId, closeContextMenu]);

	// === DOCK APP ACTIONS ===

	const handleOpenDockApp = useCallback(() => {
		if (contextMenu?.dockAppType) {
			openAppWindow(contextMenu.dockAppType);
		}
		closeContextMenu();
	}, [contextMenu?.dockAppType, openAppWindow, closeContextMenu]);

	const handleQuitDockApp = useCallback(() => {
		// Close all windows of this app type
		if (contextMenu?.dockAppType) {
			const { windows, closeWindow } = useWindowStore.getState();
			windows.forEach(win => {
				if (win.appType === contextMenu.dockAppType) {
					closeWindow(win.id);
				}
			});
		}
		closeContextMenu();
	}, [contextMenu?.dockAppType, closeContextMenu]);

	// === DOCK SESSION ACTIONS ===

	const handleFocusSession = useCallback(async () => {
		if (contextMenu?.dockSessionId) {
			try {
				await fetch(`${API_BASE}/api/sessions/${contextMenu.dockSessionId}/focus`, { method: 'POST' });
			} catch (err) {
				console.error('Failed to focus session:', err);
			}
		}
		closeContextMenu();
	}, [contextMenu?.dockSessionId, closeContextMenu]);

	const handleEndSession = useCallback(async () => {
		if (contextMenu?.dockSessionId) {
			const confirmed = window.confirm('Are you sure you want to end this Claude session?');
			if (confirmed) {
				try {
					await fetch(`${API_BASE}/api/sessions/${contextMenu.dockSessionId}/end`, { method: 'POST' });
				} catch (err) {
					console.error('Failed to end session:', err);
				}
			}
		}
		closeContextMenu();
	}, [contextMenu?.dockSessionId, closeContextMenu]);

	const handleGetInfoDockSession = useCallback(() => {
		if (contextMenu?.dockSessionId) {
			setSessionInfoId(contextMenu.dockSessionId);
			setShowSessionInfo(true);
		}
		closeContextMenu();
	}, [contextMenu?.dockSessionId, closeContextMenu]);

	const handleGetInfoPanelSession = useCallback(() => {
		if (contextMenu?.panelSessionId) {
			setSessionInfoId(contextMenu.panelSessionId);
			setShowSessionInfo(true);
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	// === DOCK MINIMIZED WINDOW ACTIONS ===

	const handleRestoreWindow = useCallback(() => {
		if (contextMenu?.minimizedWindowId) {
			const { unminimizeWindow } = useWindowStore.getState();
			unminimizeWindow(contextMenu.minimizedWindowId);
		}
		closeContextMenu();
	}, [contextMenu?.minimizedWindowId, closeContextMenu]);

	const handleCloseMinimizedWindow = useCallback(() => {
		if (contextMenu?.minimizedWindowId) {
			const { closeWindow } = useWindowStore.getState();
			closeWindow(contextMenu.minimizedWindowId);
		}
		closeContextMenu();
	}, [contextMenu?.minimizedWindowId, closeContextMenu]);

	// === PANEL CHIEF ACTIONS ===

	const handleFocusChiefTmux = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try {
				await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/focus`, { method: 'POST' });
			} catch (err) {
				console.error('Failed to focus session:', err);
			}
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleForceResetChief = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try {
				await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/force-handoff`, { method: 'POST' });
			} catch (err) {
				console.error('Failed to force reset:', err);
			}
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleResetChief = useCallback(async () => {
		const confirmed = window.confirm('Reset Chief? This will restart the Chief session completely.');
		if (confirmed) {
			try {
				await fetch(`${API_BASE}/api/sessions/chief/reset`, { method: 'POST' });
			} catch (err) {
				console.error('Failed to reset Chief:', err);
			}
		}
		closeContextMenu();
	}, [closeContextMenu]);

	// === PANEL SPECIALIST ACTIONS ===

	const handleAttachContextToChief = useCallback(() => {
		// Dispatch event to attach specialist context to Chief
		if (contextMenu?.panelSessionId && contextMenu?.panelSessionRole) {
			window.dispatchEvent(new CustomEvent('attach-specialist-context', {
				detail: {
					sessionId: contextMenu.panelSessionId,
					role: contextMenu.panelSessionRole
				}
			}));
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, contextMenu?.panelSessionRole, closeContextMenu]);

	const handleFocusSpecialistTmux = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try {
				await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/focus`, { method: 'POST' });
			} catch (err) {
				console.error('Failed to focus session:', err);
			}
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleForceResetSpecialist = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try {
				await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/force-handoff`, { method: 'POST' });
			} catch (err) {
				console.error('Failed to force reset:', err);
			}
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleEndSpecialistSession = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			const roleName = contextMenu.panelSessionRole || 'Specialist';
			const confirmed = window.confirm(`End ${roleName} session? This cannot be undone.`);
			if (confirmed) {
				try {
					await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/end`, { method: 'POST' });
				} catch (err) {
					console.error('Failed to end session:', err);
				}
			}
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, contextMenu?.panelSessionRole, closeContextMenu]);

	// === PANEL ATTACHMENT ACTIONS ===

	const handleOpenAttachment = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			// Open the file in a document viewer
			const { openWindow } = useWindowStore.getState();
			openWindow(contextMenu.attachmentPath, contextMenu.attachmentName || 'File');
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, contextMenu?.attachmentName, closeContextMenu]);

	const handleShowAttachmentInFinder = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			// Open Finder to the file's directory
			const dirPath = contextMenu.attachmentPath.split('/').slice(0, -1).join('/') || 'Desktop';
			openAppWindow('finder', dirPath);
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, openAppWindow, closeContextMenu]);

	const handleRevealAttachmentOnDesktop = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			const path = contextMenu.attachmentPath;
			const { selectIcon } = useWindowStore.getState();
			router.push('/desktop');
			setTimeout(() => {
				selectIcon(path);
			}, 100);
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, router, closeContextMenu]);

	const handleCopyAttachmentPath = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			navigator.clipboard.writeText(contextMenu.attachmentPath);
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, closeContextMenu]);

	const handleRemoveAttachment = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			window.dispatchEvent(new CustomEvent('remove-attachment', {
				detail: { path: contextMenu.attachmentPath }
			}));
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, closeContextMenu]);

	const handleGetInfoAttachment = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			setGetInfoPath(contextMenu.attachmentPath);
			setShowGetInfo(true);
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, closeContextMenu]);

	// === DESKTOP ACTIONS ===

	const handleNewFolder = useCallback(() => {
		const dir = createDirectory;
		const sourceWindowId = contextMenu?.sourceWindowId;

		showPrompt('New Folder', 'Enter folder name', async (name) => {
			setIsCreating(true);
			try {
				// Create in currentDirectory if available, otherwise at Desktop root
				const folderPath = dir ? `${dir}/${name}` : name;
				await finderCreateFolder(folderPath);
				// Dispatch event to refresh the view
				window.dispatchEvent(new CustomEvent('refresh-finder', {
					detail: { windowId: sourceWindowId }
				}));
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
			} catch (err) {
				console.error('Error creating folder:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to create folder');
			} finally {
				setIsCreating(false);
			}
			closeContextMenu();
		});
	}, [closeContextMenu, createDirectory, contextMenu?.sourceWindowId, showPrompt]);

	const handleNewFile = useCallback(() => {
		const dir = createDirectory;
		const sourceWindowId = contextMenu?.sourceWindowId;

		showPrompt('New File', 'Enter filename (e.g., notes.md)', async (fileName) => {
			setIsCreating(true);
			try {
				// Create in currentDirectory if available, otherwise at Desktop root
				const filePath = dir ? `${dir}/${fileName}` : fileName;
				// Add default content for markdown files
				let content = '';
				if (fileName.endsWith('.md')) {
					const baseName = fileName.replace(/\.md$/, '');
					content = `# ${baseName}\n\n`;
				}
				await finderCreateFile(filePath, content);
				// Dispatch events to refresh the view
				window.dispatchEvent(new CustomEvent('refresh-finder', {
					detail: { windowId: sourceWindowId }
				}));
				window.dispatchEvent(new CustomEvent('refresh-desktop'));
			} catch (err) {
				console.error('Error creating file:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to create file');
			} finally {
				setIsCreating(false);
			}
			closeContextMenu();
		});
	}, [closeContextMenu, createDirectory, contextMenu?.sourceWindowId, showPrompt]);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleImportClick = useCallback(() => {
		fileInputRef.current?.click();
		closeContextMenu();
	}, [closeContextMenu]);

	const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files || files.length === 0) return;

		setIsCreating(true);
		try {
			for (const file of Array.from(files)) {
				await finderUpload(file);
			}
		} catch (err) {
			console.error('Error importing files:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to import files');
		} finally {
			setIsCreating(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	}, []);

	const handleCleanUp = useCallback(() => {
		window.dispatchEvent(new CustomEvent('desktop-sort', { detail: { type: 'cleanup' } }));
		closeContextMenu();
	}, [closeContextMenu]);

	const handleSortBy = useCallback((type: string) => {
		window.dispatchEvent(new CustomEvent('desktop-sort', { detail: { type } }));
		closeContextMenu();
	}, [closeContextMenu]);

	const handleRefresh = useCallback(() => {
		window.dispatchEvent(new CustomEvent('refresh-desktop'));
		closeContextMenu();
	}, [closeContextMenu]);

	// Position menu
	const menuStyle: React.CSSProperties = contextMenu ? {
		position: 'fixed',
		left: contextMenu.x,
		top: contextMenu.y,
		zIndex: 9999,
	} : {};

	// Get Info panel
	const getInfoPanel = showGetInfo && getInfoPath ? (
		<GetInfoPanel
			path={getInfoPath}
			onClose={() => {
				setShowGetInfo(false);
				setGetInfoPath(null);
			}}
		/>
	) : null;

	// Session Info panel
	const sessionInfoPanel = showSessionInfo && sessionInfoId ? (
		<SessionInfoPanel
			sessionId={sessionInfoId}
			onClose={() => {
				setShowSessionInfo(false);
				setSessionInfoId(null);
			}}
		/>
	) : null;

	// Get current collapsed state for widget - must be before early return
	const isWidgetCollapsed = useMemo(() => {
		if (!contextMenu?.widgetId) return false;
		const { widgets } = useWindowStore.getState();
		const widget = widgets.find(w => w.id === contextMenu.widgetId);
		return widget?.collapsed ?? false;
	}, [contextMenu?.widgetId]);

	if (!contextMenu) {
		return (
			<>
				{getInfoPanel}
				{sessionInfoPanel}
				<MoveToModal
					isOpen={showMoveTo}
					sourcePath={moveToPath || ''}
					sourceName={moveToName}
					onClose={() => {
						setShowMoveTo(false);
						setMoveToPath(null);
					}}
				/>
				{/* Hidden file input must always be rendered for import to work */}
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={handleFileImport}
				/>
				{/* Prompt modal must always be rendered */}
				{promptModal && (
					<div
						className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm"
						onClick={handlePromptCancel}
					>
						<div
							className="w-[340px] rounded-xl bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="px-4 py-3 bg-gray-50 dark:bg-[#333] border-b border-gray-200 dark:border-white/10">
								<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
									{promptModal.title}
								</h3>
							</div>
							<div className="p-4">
								<input
									ref={promptInputRef}
									type="text"
									value={promptValue}
									onChange={(e) => setPromptValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && promptValue.trim()) {
											handlePromptSubmit();
										} else if (e.key === 'Escape') {
											handlePromptCancel();
										}
									}}
									className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DA7756]"
									placeholder={promptModal.placeholder}
									autoFocus
								/>
							</div>
							<div className="flex justify-end gap-2 px-4 py-3 bg-gray-50 dark:bg-[#333] border-t border-gray-200 dark:border-white/10">
								<button
									onClick={handlePromptCancel}
									className="px-4 py-1.5 text-sm rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={handlePromptSubmit}
									disabled={!promptValue.trim()}
									className="px-4 py-1.5 text-sm rounded-lg bg-[#DA7756] text-white font-medium hover:bg-[#c66a4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									Create
								</button>
							</div>
						</div>
					</div>
				)}
			</>
		);
	}

	// === RENDER MENUS BY TYPE ===

	const renderFileMenu = () => (
		<>
			{/* PRIMARY ACTIONS */}
			<MenuItem
				icon={<FolderOpen className="w-4 h-4" />}
				label="Open"
				shortcut="↵"
				onClick={handleOpen}
			/>
			<Submenu
				icon={<ExternalLink className="w-4 h-4" />}
				label="Open With..."
				onSelect={handleOpenWith}
			>
				{[
					{ label: 'VSCode', value: 'vscode', icon: <Code className="w-4 h-4" /> },
					{ label: 'Cursor', value: 'cursor', icon: <Code className="w-4 h-4" /> },
					{ label: 'Default', value: 'default', icon: <FolderOpen className="w-4 h-4" /> },
				]}
			</Submenu>
			<MenuItem
				icon={<Monitor className="w-4 h-4" />}
				label="Open in macOS"
				onClick={handleOpenInMacOS}
			/>
			<MenuItem
				icon={<ExternalLink className="w-4 h-4" />}
				label="Show in Finder"
				onClick={handleShowInFinder}
			/>
			<Separator />
			{/* CLAUDE INTELLIGENCE */}
			<MenuItem
				icon={<MessageSquarePlus className="w-4 h-4" />}
				label="Attach to Chat"
				onClick={handleAttachToChat}
			/>
			{explanation && (
				<MenuItem
					icon={<HelpCircle className="w-4 h-4" />}
					label="Explain This"
					onClick={handleExplainThis}
				/>
			)}
			<Separator />
			{/* INFORMATION */}
			<MenuItem
				icon={<Info className="w-4 h-4" />}
				label="Get Info"
				shortcut="⌘I"
				onClick={handleGetInfo}
			/>
			<Separator />
			{/* MODIFICATION & DESTRUCTIVE */}
			<MenuItem
				icon={<FolderInput className="w-4 h-4" />}
				label="Move to..."
				onClick={handleMoveTo}
			/>
			<MenuItem
				icon={<Pencil className="w-4 h-4" />}
				label="Rename"
				onClick={handleRename}
			/>
			<MenuItem
				icon={<Trash2 className="w-4 h-4" />}
				label="Move to Trash"
				shortcut="⌘⌫"
				onClick={handleMoveToTrash}
				destructive
			/>
			<Separator />
			{/* UTILITIES */}
			<MenuItem
				icon={<Download className="w-4 h-4" />}
				label="Export to Downloads"
				onClick={handleExport}
			/>
			<MenuItem
				icon={<ClipboardCopy className="w-4 h-4" />}
				label="Copy Path"
				onClick={handleCopyPath}
			/>
		</>
	);

	const renderFolderMenu = () => (
		<>
			{/* PRIMARY ACTIONS */}
			<MenuItem
				icon={<FolderOpen className="w-4 h-4" />}
				label="Open"
				shortcut="↵"
				onClick={handleOpen}
			/>
			<MenuItem
				icon={<FolderInput className="w-4 h-4" />}
				label="Open in New Window"
				onClick={handleOpenInNewWindow}
			/>
			<MenuItem
				icon={<Monitor className="w-4 h-4" />}
				label="Open in macOS"
				onClick={handleOpenInMacOS}
			/>
			<MenuItem
				icon={<ExternalLink className="w-4 h-4" />}
				label="Show in Finder"
				onClick={handleShowInFinder}
			/>
			<Separator />
			{/* CLAUDE INTELLIGENCE */}
			<MenuItem
				icon={<MessageSquarePlus className="w-4 h-4" />}
				label="Attach to Chat"
				onClick={handleAttachToChat}
			/>
			<Separator />
			{/* CREATION */}
			<MenuItem
				icon={<FilePlus className="w-4 h-4" />}
				label="New File Inside..."
				onClick={handleNewFileInside}
			/>
			<MenuItem
				icon={<FolderPlus className="w-4 h-4" />}
				label="New Folder Inside"
				onClick={handleNewFolderInside}
			/>
			<Separator />
			{/* INFORMATION */}
			<MenuItem
				icon={<Info className="w-4 h-4" />}
				label="Get Info"
				shortcut="⌘I"
				onClick={handleGetInfo}
			/>
			<Separator />
			{/* MODIFICATION & DESTRUCTIVE */}
			<MenuItem
				icon={<FolderInput className="w-4 h-4" />}
				label="Move to..."
				onClick={handleMoveTo}
			/>
			<MenuItem
				icon={<Pencil className="w-4 h-4" />}
				label="Rename"
				onClick={handleRename}
			/>
			<MenuItem
				icon={<Trash2 className="w-4 h-4" />}
				label="Move to Trash"
				shortcut="⌘⌫"
				onClick={handleMoveToTrash}
				destructive
			/>
			<Separator />
			{/* UTILITIES */}
			<MenuItem
				icon={<ClipboardCopy className="w-4 h-4" />}
				label="Copy Path"
				onClick={handleCopyPath}
			/>
		</>
	);

	const renderSystemFileMenu = () => (
		<>
			<BrandedHeader
				icon={<Lock className="w-5 h-5 text-[#DA7756]" />}
				title="Claude System File"
				subtitle="Managed by Claude"
				color="bg-[#DA7756]/10 text-[#DA7756]"
			/>
			<div className="py-1">
				{/* PRIMARY ACTIONS */}
				<MenuItem
					icon={<FolderOpen className="w-4 h-4" />}
					label="Open"
					shortcut="↵"
					onClick={handleOpen}
				/>
				<Separator />
				{/* CLAUDE INTELLIGENCE */}
				<MenuItem
					icon={<MessageSquarePlus className="w-4 h-4" />}
					label="Attach to Chat"
					onClick={handleAttachToChat}
				/>
				<MenuItem
					icon={<HelpCircle className="w-4 h-4" />}
					label="Why is this protected?"
					onClick={handleWhyProtected}
				/>
				<Separator />
				{/* INFORMATION */}
				<MenuItem
					icon={<Info className="w-4 h-4" />}
					label="Get Info"
					shortcut="⌘I"
					onClick={handleGetInfo}
				/>
				<Separator />
				{/* UTILITIES */}
				<MenuItem
					icon={<ClipboardCopy className="w-4 h-4" />}
					label="Copy Path"
					onClick={handleCopyPath}
				/>
			</div>
		</>
	);

	const renderLifeDomainMenu = () => (
		<>
			<BrandedHeader
				icon={<BookOpen className="w-5 h-5 text-emerald-500" />}
				title="Life Domain"
				subtitle="Managed life area"
				color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
			/>
			<div className="py-1">
				{/* PRIMARY ACTIONS */}
				<MenuItem
					icon={<FolderOpen className="w-4 h-4" />}
					label="Open Domain"
					shortcut="↵"
					onClick={handleOpen}
				/>
				<MenuItem
					icon={<FolderInput className="w-4 h-4" />}
					label="Open in New Window"
					onClick={handleOpenInNewWindow}
				/>
				<MenuItem
					icon={<FileText className="w-4 h-4 text-emerald-500" />}
					label="Open LIFE-SPEC.md"
					onClick={handleOpenLifeSpec}
				/>
				<Separator />
				{/* CLAUDE INTELLIGENCE */}
				<MenuItem
					icon={<MessageSquarePlus className="w-4 h-4" />}
					label="Attach to Chat"
					onClick={handleAttachToChat}
				/>
				<Separator />
				{/* CREATION */}
				<MenuItem
					icon={<FilePlus className="w-4 h-4" />}
					label="New File Inside..."
					onClick={handleNewFileInside}
				/>
				<MenuItem
					icon={<FolderPlus className="w-4 h-4" />}
					label="New Folder Inside"
					onClick={handleNewFolderInside}
				/>
				<Separator />
				{/* INFORMATION */}
				<MenuItem
					icon={<Info className="w-4 h-4" />}
					label="Get Info"
					shortcut="⌘I"
					onClick={handleGetInfo}
				/>
				<Separator />
				{/* MODIFICATION & DESTRUCTIVE */}
				<MenuItem
					icon={<Pencil className="w-4 h-4" />}
					label="Rename Domain"
					onClick={handleRename}
				/>
				<MenuItem
					icon={<Trash2 className="w-4 h-4" />}
					label="Move to Trash"
					shortcut="⌘⌫"
					onClick={handleMoveToTrash}
					destructive
				/>
				<Separator />
				{/* UTILITIES */}
				<MenuItem
					icon={<ClipboardCopy className="w-4 h-4" />}
					label="Copy Path"
					onClick={handleCopyPath}
				/>
			</div>
		</>
	);

	const renderCustomAppMenu = () => (
		<>
			<BrandedHeader
				icon={<Rocket className="w-5 h-5 text-purple-500" />}
				title="Custom Application"
				subtitle="Built by Claude"
				color="bg-purple-500/10 text-purple-600 dark:text-purple-400"
			/>
			<div className="py-1">
				{/* PRIMARY ACTIONS */}
				<MenuItem
					icon={<Play className="w-4 h-4 text-green-500" />}
					label="Launch App"
					shortcut="↵"
					onClick={handleLaunchApp}
				/>
				<MenuItem
					icon={<FolderInput className="w-4 h-4" />}
					label="Open in New Window"
					onClick={handleOpenInNewWindow}
				/>
				<MenuItem
					icon={<FileText className="w-4 h-4 text-purple-500" />}
					label="Open APP-SPEC.md"
					onClick={handleOpenAppSpec}
				/>
				<Separator />
				{/* CLAUDE INTELLIGENCE */}
				<MenuItem
					icon={<MessageSquarePlus className="w-4 h-4" />}
					label="Attach to Chat"
					onClick={handleAttachToChat}
				/>
				<MenuItem
					icon={<Lightbulb className="w-4 h-4 text-amber-500" />}
					label="Request Feature"
					onClick={handleRequestFeature}
				/>
				<Separator />
				{/* INFORMATION */}
				<MenuItem
					icon={<Info className="w-4 h-4" />}
					label="Get Info"
					shortcut="⌘I"
					onClick={handleGetInfo}
				/>
				<Separator />
				{/* MODIFICATION & DESTRUCTIVE */}
				<MenuItem
					icon={<Pencil className="w-4 h-4" />}
					label="Rename App"
					onClick={handleRename}
				/>
				<MenuItem
					icon={<Trash2 className="w-4 h-4" />}
					label="Uninstall App"
					onClick={handleUninstallApp}
					destructive
				/>
				<Separator />
				{/* UTILITIES */}
				<MenuItem
					icon={<ClipboardCopy className="w-4 h-4" />}
					label="Copy Path"
					onClick={handleCopyPath}
				/>
			</div>
		</>
	);

	const renderDesktopMenu = () => (
		<>
			{/* CREATION */}
			<MenuItem
				icon={<FolderPlus className="w-4 h-4" />}
				label="New Folder"
				shortcut="⇧⌘N"
				onClick={handleNewFolder}
			/>
			<MenuItem
				icon={<FilePlus className="w-4 h-4" />}
				label="New File..."
				onClick={handleNewFile}
			/>
			<MenuItem
				icon={<Import className="w-4 h-4" />}
				label="Import Files..."
				onClick={handleImportClick}
			/>
			<Separator />
			{/* ORGANIZATION */}
			<MenuItem
				icon={<Grid3X3 className="w-4 h-4" />}
				label="Clean Up"
				onClick={handleCleanUp}
			/>
			<Submenu
				icon={<Grid3X3 className="w-4 h-4" />}
				label="Clean Up By"
				onSelect={handleSortBy}
			>
				{[
					{ label: 'Name', value: 'cleanup-name', icon: <ArrowDownAZ className="w-4 h-4" /> },
					{ label: 'Kind', value: 'cleanup-kind', icon: <Folders className="w-4 h-4" /> },
					{ label: 'Date', value: 'cleanup-date', icon: <Calendar className="w-4 h-4" /> },
				]}
			</Submenu>
			<Separator />
			{/* UTILITIES */}
			<MenuItem
				icon={<RefreshCw className="w-4 h-4" />}
				label="Refresh"
				shortcut="⌘R"
				onClick={handleRefresh}
			/>
		</>
	);

	// Get widget icon based on type
	const getWidgetIcon = () => {
		switch (contextMenu?.widgetType) {
			case 'priorities':
				return <Target className="w-4 h-4" />;
			case 'calendar':
				return <Calendar className="w-4 h-4" />;
			case 'sessions':
				return <LayoutGrid className="w-4 h-4" />;
			default:
				return <LayoutGrid className="w-4 h-4" />;
		}
	};

	// Trash menu
	const renderTrashMenu = () => {
		const trashCount = contextMenu?.trashCount ?? 0;
		const isEmpty = trashCount === 0;

		return (
			<>
				{/* BRANDED HEADER */}
				<div className="px-3 py-2 bg-gray-100 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
					<div className="flex items-center gap-2">
						<Trash2 className="w-4 h-4 text-gray-500" />
						<span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">Trash</span>
					</div>
					<span className="text-[11px] text-gray-500 dark:text-gray-400 ml-6">
						{isEmpty ? 'Empty' : `${trashCount} item${trashCount === 1 ? '' : 's'}`}
					</span>
				</div>
				<div className="py-1.5">
					{/* PRIMARY ACTIONS */}
					<MenuItem
						icon={<FolderOpen className="w-4 h-4" />}
						label="Open Trash"
						shortcut="↵"
						onClick={handleOpenTrash}
					/>
					<Separator />
					{/* DESTRUCTIVE */}
					<MenuItem
						icon={<Trash2 className="w-4 h-4" />}
						label="Empty Trash"
						onClick={handleEmptyTrash}
						destructive
						disabled={isEmpty}
					/>
				</div>
			</>
		);
	};

	// Widget menu
	const renderWidgetMenu = () => (
		<>
			{/* BRANDED HEADER */}
			<div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20">
				<div className="flex items-center gap-2">
					{getWidgetIcon()}
					<span className="text-[13px] font-medium text-blue-900 dark:text-blue-200">
						{targetInfo.fileName}
					</span>
				</div>
				<span className="text-[11px] text-blue-600 dark:text-blue-300 ml-6">Desktop Widget</span>
			</div>
			<div className="py-1.5">
				{/* WIDGET ACTIONS */}
				<MenuItem
					icon={isWidgetCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
					label={isWidgetCollapsed ? 'Expand' : 'Collapse'}
					onClick={handleCollapseWidget}
				/>
				<Separator />
				{/* DESTRUCTIVE */}
				<MenuItem
					icon={<X className="w-4 h-4" />}
					label="Remove Widget"
					onClick={handleRemoveWidget}
					destructive
				/>
			</div>
		</>
	);

	// Get dock app icon
	const getDockAppIcon = () => {
		switch (contextMenu?.dockAppType) {
			case 'finder': return <FolderOpen className="w-4 h-4" />;
			case 'calendar': return <Calendar className="w-4 h-4" />;
			case 'contacts': return <Info className="w-4 h-4" />;
			case 'settings': return <Info className="w-4 h-4" />;
			case 'email': return <Info className="w-4 h-4" />;
			default: return <Info className="w-4 h-4" />;
		}
	};

	// Dock App menu
	const renderDockAppMenu = () => {
		const isRunning = contextMenu?.dockAppIsRunning ?? false;

		return (
			<>
				{/* BRANDED HEADER */}
				<div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20">
					<div className="flex items-center gap-2">
						{getDockAppIcon()}
						<span className="text-[13px] font-medium text-blue-900 dark:text-blue-200">
							{targetInfo.fileName}
						</span>
					</div>
					<span className="text-[11px] text-blue-600 dark:text-blue-300 ml-6">
						{isRunning ? 'Running' : 'Core App'}
					</span>
				</div>
				<div className="py-1.5">
					{/* PRIMARY ACTIONS */}
					<MenuItem
						icon={<Play className="w-4 h-4" />}
						label={isRunning ? 'Show Window' : 'Open'}
						shortcut="↵"
						onClick={handleOpenDockApp}
					/>
					{isRunning && (
						<>
							<Separator />
							{/* DESTRUCTIVE */}
							<MenuItem
								icon={<X className="w-4 h-4" />}
								label="Quit"
								shortcut="⌘Q"
								onClick={handleQuitDockApp}
								destructive
							/>
						</>
					)}
				</div>
			</>
		);
	};

	// Dock Session menu
	const renderDockSessionMenu = () => {
		const roleName = contextMenu?.dockSessionRole || 'Session';
		const roleDisplayName = roleName.charAt(0).toUpperCase() + roleName.slice(1);

		return (
			<>
				{/* BRANDED HEADER */}
				<div className="px-3 py-2 bg-[#DA7756]/10 border-b border-[#DA7756]/20">
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 text-[#DA7756]">
							<svg viewBox="0 0 16 16" fill="currentColor">
								<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
							</svg>
						</div>
						<span className="text-[13px] font-medium text-[#DA7756]">
							{roleDisplayName}
						</span>
					</div>
					<span className="text-[11px] text-[#DA7756]/70 ml-6">Active Claude Session</span>
				</div>
				<div className="py-1.5">
					{/* PRIMARY ACTIONS */}
					<MenuItem
						icon={<Target className="w-4 h-4" />}
						label="Focus Session"
						shortcut="↵"
						onClick={handleFocusSession}
					/>
					<Separator />
					{/* CLAUDE ACTIONS */}
					<MenuItem
						icon={<MessageSquarePlus className="w-4 h-4 text-[#DA7756]" />}
						label="Attach to Chat"
						onClick={handleAttachToChat}
					/>
					<Separator />
					{/* INFORMATION */}
					<MenuItem
						icon={<Info className="w-4 h-4" />}
						label="Get Info"
						shortcut="⌘I"
						onClick={handleGetInfoDockSession}
					/>
					<Separator />
					{/* DESTRUCTIVE */}
					<MenuItem
						icon={<X className="w-4 h-4" />}
						label="End Session"
						onClick={handleEndSession}
						destructive
					/>
				</div>
			</>
		);
	};

	// Dock Minimized Window menu
	const renderDockMinimizedMenu = () => (
		<>
			<div className="py-1.5">
				{/* PRIMARY ACTIONS */}
				<MenuItem
					icon={<ChevronUp className="w-4 h-4" />}
					label="Restore"
					shortcut="↵"
					onClick={handleRestoreWindow}
				/>
				<Separator />
				{/* DESTRUCTIVE */}
				<MenuItem
					icon={<X className="w-4 h-4" />}
					label="Close"
					onClick={handleCloseMinimizedWindow}
					destructive
				/>
			</div>
		</>
	);

	// Panel Chief menu
	const renderPanelChiefMenu = () => (
		<>
			{/* BRANDED HEADER */}
			<div className="px-3 py-2 bg-[#DA7756]/10 border-b border-[#DA7756]/20">
				<div className="flex items-center gap-2">
					<Crown className="w-4 h-4 text-[#DA7756]" />
					<span className="text-[13px] font-medium text-[#DA7756]">Chief</span>
				</div>
				<span className="text-[11px] text-[#DA7756]/70 ml-6">
					{contextMenu?.panelSessionStatus || 'Leading the team'}
				</span>
			</div>
			<div className="py-1.5">
				{/* UTILITY */}
				<MenuItem
					icon={<Terminal className="w-4 h-4" />}
					label="Focus in tmux"
					onClick={handleFocusChiefTmux}
				/>
				<Separator />
				{/* INFORMATION */}
				<MenuItem
					icon={<Info className="w-4 h-4" />}
					label="Get Info"
					shortcut="⌘I"
					onClick={handleGetInfoPanelSession}
				/>
				<Separator />
				{/* DISRUPTIVE/DESTRUCTIVE */}
				<MenuItem
					icon={<RotateCcw className="w-4 h-4 text-amber-500" />}
					label="Force Reset"
					onClick={handleForceResetChief}
				/>
				<MenuItem
					icon={<XCircle className="w-4 h-4" />}
					label="Reset Chief"
					onClick={handleResetChief}
					destructive
				/>
			</div>
		</>
	);

	// Get specialist role icon
	const getSpecialistIcon = () => {
		const roleSlug = contextMenu?.panelSessionRole;
		if (!roleSlug) return <Code2 className="w-4 h-4" />;
		const config = getRoleConfig(roleSlug);
		if (config.isLogo) return null; // Chief shouldn't be in specialist menu
		const Icon = config.icon;
		return <Icon className="w-4 h-4" />;
	};

	// Panel Specialist menu
	const renderPanelSpecialistMenu = () => {

		return (
			<>
				{/* BRANDED HEADER */}
				<div className={`px-3 py-2 bg-[#DA7756]/10 border-b border-[#DA7756]/20`}>
					<div className="flex items-center gap-2">
						<span className="text-[#DA7756]">{getSpecialistIcon()}</span>
						<span className="text-[13px] font-medium text-[#DA7756]">
							{targetInfo.fileName}
						</span>
					</div>
					<span className="text-[11px] text-[#DA7756]/70 ml-6">
						{contextMenu?.panelSessionStatus || 'Working...'}
					</span>
				</div>
				<div className="py-1.5">
					{/* CLAUDE ACTION */}
					<MenuItem
						icon={<MessageSquarePlus className="w-4 h-4 text-[#DA7756]" />}
						label="Attach Context to Chief"
						onClick={handleAttachContextToChief}
					/>
					<Separator />
					{/* UTILITY */}
					<MenuItem
						icon={<Terminal className="w-4 h-4" />}
						label="Focus in tmux"
						onClick={handleFocusSpecialistTmux}
					/>
					<Separator />
					{/* INFORMATION */}
					<MenuItem
						icon={<Info className="w-4 h-4" />}
						label="Get Info"
						shortcut="⌘I"
						onClick={handleGetInfoPanelSession}
					/>
					<Separator />
					{/* DISRUPTIVE/DESTRUCTIVE */}
					<MenuItem
						icon={<RotateCcw className="w-4 h-4 text-amber-500" />}
						label="Force Reset"
						onClick={handleForceResetSpecialist}
					/>
					<MenuItem
						icon={<XCircle className="w-4 h-4" />}
						label="End Session"
						onClick={handleEndSpecialistSession}
						destructive
					/>
				</div>
			</>
		);
	};

	// Panel Attachment menu
		const renderPanelAttachmentMenu = () => {
			return (
				<>
					<div className="py-1.5">
						{/* PRIMARY ACTIONS */}
					<MenuItem
						icon={<FolderOpen className="w-4 h-4" />}
						label="Open File"
						shortcut="↵"
						onClick={handleOpenAttachment}
					/>
						<MenuItem
							icon={<ExternalLink className="w-4 h-4" />}
							label="Show in Finder"
							onClick={handleShowAttachmentInFinder}
						/>
						<MenuItem
							icon={<LayoutGrid className="w-4 h-4" />}
							label="Reveal on Desktop"
							onClick={handleRevealAttachmentOnDesktop}
						/>
					<Separator />
					{/* INFORMATION */}
					<MenuItem
						icon={<Info className="w-4 h-4" />}
						label="Get Info"
						shortcut="⌘I"
						onClick={handleGetInfoAttachment}
					/>
					<Separator />
						{/* UTILITIES */}
					<MenuItem
						icon={<ClipboardCopy className="w-4 h-4" />}
						label="Copy Path"
						onClick={handleCopyAttachmentPath}
					/>
					<MenuItem
						icon={<Trash2 className="w-4 h-4" />}
						label="Remove"
						onClick={handleRemoveAttachment}
						destructive
					/>
				</div>
			</>
		);
	};

	// Render the appropriate menu based on target type
	const renderMenuContent = () => {
		switch (targetInfo.type) {
			case 'file':
				return renderFileMenu();
			case 'folder':
				return renderFolderMenu();
			case 'system-file':
				return renderSystemFileMenu();
			case 'life-domain':
				return renderLifeDomainMenu();
			case 'custom-app':
				return renderCustomAppMenu();
			case 'trash':
				return renderTrashMenu();
			case 'widget':
				return renderWidgetMenu();
			case 'dock-app':
				return renderDockAppMenu();
			case 'dock-session':
				return renderDockSessionMenu();
			case 'dock-minimized':
				return renderDockMinimizedMenu();
			case 'panel-chief':
				return renderPanelChiefMenu();
			case 'panel-specialist':
				return renderPanelSpecialistMenu();
			case 'panel-attachment':
				return renderPanelAttachmentMenu();
			case 'desktop':
			default:
				return renderDesktopMenu();
		}
	};

	// Check if this is a menu type with a branded header (no extra py-1.5 wrapper)
	const hasBrandedHeader = ['system-file', 'life-domain', 'custom-app', 'trash', 'widget', 'dock-app', 'dock-session', 'panel-chief', 'panel-specialist'].includes(targetInfo.type);

	return (
		<>
			<div
				ref={menuRef}
				className="min-w-[220px] rounded-lg overflow-hidden
          bg-white dark:bg-[#2a2a2a]/95 backdrop-blur-xl
          border border-gray-200 dark:border-white/10
          shadow-2xl shadow-black/10 dark:shadow-black/50"
				style={menuStyle}
			>
				{/* Branded headers are inside renderMenuContent */}
				<div className={hasBrandedHeader ? '' : 'py-1.5'}>
					{renderMenuContent()}
				</div>
			</div>

			{/* Explanation Tooltip */}
			{showExplanation && explanation && (
				<ExplanationTooltip
					explanation={explanation}
					anchorRect={explanationAnchor}
					onClose={() => {
						setShowExplanation(false);
						closeContextMenu();
					}}
					onAskChief={() => {
						window.dispatchEvent(new CustomEvent('ask-chief', {
							detail: {
								path: contextMenu?.targetPath,
								itemName: explanation.title,
							}
						}));
						setShowExplanation(false);
						closeContextMenu();
					}}
				/>
			)}

			{/* Why Protected Tooltip */}
			{showWhyProtected && (
				<div
					className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20"
					onClick={() => {
						setShowWhyProtected(false);
						closeContextMenu();
					}}
				>
					<div
						className="max-w-md p-4 rounded-xl bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-white/10 shadow-2xl"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center gap-3 mb-3">
							<div className="w-10 h-10 rounded-full bg-[#DA7756]/20 flex items-center justify-center">
								<Lock className="w-5 h-5 text-[#DA7756]" />
							</div>
							<div>
								<h3 className="font-semibold text-gray-900 dark:text-white">Protected System File</h3>
								<p className="text-sm text-gray-500 dark:text-gray-400">{targetInfo.fileName}</p>
							</div>
						</div>
						<p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
							This file is managed by Claude and is essential for the Claude OS system to function properly.
						</p>
						<ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 mb-4">
							<li className="flex items-center gap-2">
								<span className="text-[#DA7756]">•</span>
								<strong>TODAY.md</strong> - Daily memory and context
							</li>
							<li className="flex items-center gap-2">
								<span className="text-[#DA7756]">•</span>
								<strong>MEMORY.md</strong> - Long-term knowledge
							</li>
							<li className="flex items-center gap-2">
								<span className="text-[#DA7756]">•</span>
								<strong>LIFE.md</strong> - Your life blueprint
							</li>
							<li className="flex items-center gap-2">
								<span className="text-[#DA7756]">•</span>
								<strong>IDENTITY.md</strong> - Claude's identity config
							</li>
						</ul>
						<p className="text-xs text-gray-500 dark:text-gray-400">
							You can view these files but not modify or delete them. Claude updates them as needed.
						</p>
						<button
							className="mt-4 w-full py-2 px-4 rounded-lg bg-[#DA7756] text-white font-medium text-sm hover:bg-[#c66a4d] transition-colors"
							onClick={() => {
								setShowWhyProtected(false);
								closeContextMenu();
							}}
						>
							Got it
						</button>
					</div>
				</div>
			)}

			{/* Hidden file input for import */}
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={handleFileImport}
				/>

			{/* Custom Prompt Modal */}
			{promptModal && (
				<div
					className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm"
					onClick={handlePromptCancel}
				>
					<div
						className="w-[340px] rounded-xl bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Header */}
						<div className="px-4 py-3 bg-gray-50 dark:bg-[#333] border-b border-gray-200 dark:border-white/10">
							<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
								{promptModal.title}
							</h3>
						</div>

						{/* Content */}
						<div className="p-4">
							<input
								ref={promptInputRef}
								type="text"
								value={promptValue}
								onChange={(e) => setPromptValue(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && promptValue.trim()) {
										handlePromptSubmit();
									} else if (e.key === 'Escape') {
										handlePromptCancel();
									}
								}}
								placeholder={promptModal.placeholder}
								className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-white/20 
									bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white
									placeholder-gray-400 dark:placeholder-gray-500
									focus:outline-none focus:ring-2 focus:ring-[#DA7756] focus:border-transparent
									transition-all"
								autoFocus
							/>
							<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
								Press Enter to create, Escape to cancel
							</p>
						</div>

						{/* Footer */}
						<div className="px-4 py-3 bg-gray-50 dark:bg-[#333] border-t border-gray-200 dark:border-white/10 flex justify-end gap-2">
							<button
								onClick={handlePromptCancel}
								className="px-4 py-1.5 text-sm font-medium rounded-lg
									text-gray-600 dark:text-gray-300 
									hover:bg-gray-200 dark:hover:bg-white/10
									transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handlePromptSubmit}
								disabled={!promptValue.trim()}
								className="px-4 py-1.5 text-sm font-medium rounded-lg
									bg-[#DA7756] text-white
									hover:bg-[#c66a4d] disabled:opacity-50 disabled:cursor-not-allowed
									transition-colors"
							>
								Create
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Get Info Panel */}
			{getInfoPanel}

			{/* Session Info Panel */}
			{sessionInfoPanel}

			{/* Move To Modal */}
			<MoveToModal
				isOpen={showMoveTo}
				sourcePath={moveToPath || ''}
				sourceName={moveToName}
				onClose={() => {
					setShowMoveTo(false);
					setMoveToPath(null);
				}}
			/>
		</>
	);
}

export default ContextMenu;
