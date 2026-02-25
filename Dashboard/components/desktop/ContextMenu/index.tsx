'use client';

import { API_BASE, finderCreateFile, finderCreateFolder, finderUpload, moveToTrash, openInMacOS } from '@/lib/api';
import { getExplanation, getExplanationKey } from '@/lib/explanations';
import { showInFinder } from '@/lib/fileNavigation';
import { toDesktopRelative } from '@/lib/pathUtils';
import { CLAUDE_SYSTEM_FILES } from '@/lib/systemFiles';
import { useWindowStore } from '@/store/windowStore';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExplanationTooltip } from '../ExplanationTooltip';
import { GetInfoPanel } from '../GetInfoPanel';
import { MoveToModal } from '../MoveToModal';
import { SessionInfoPanel } from '../SessionInfoPanel';
import { toast } from 'sonner';

import { MenuRenderer } from './MenuRenderer';
import { TargetType, TargetInfo, MenuActions } from './types';

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

	// Show custom prompt modal
	const showPrompt = useCallback((title: string, placeholder: string, onSubmit: (value: string) => void, defaultValue?: string) => {
		setPromptValue(defaultValue || '');
		setPromptModal({ title, placeholder, defaultValue, onSubmit });
	}, []);

	// === TARGET INFO ===

	const targetInfo: TargetInfo = useMemo(() => {
		if (contextMenu?.targetType === 'trash') {
			return { type: 'trash', fileName: 'Trash', isDir: false };
		}
		if (contextMenu?.targetType === 'widget') {
			const widgetName = contextMenu.widgetType === 'priorities' ? 'Priorities'
				: contextMenu.widgetType === 'calendar' ? 'Calendar'
					: contextMenu.widgetType === 'sessions' ? 'Sessions' : 'Widget';
			return { type: 'widget', fileName: widgetName, isDir: false };
		}
		if (contextMenu?.targetType === 'dock-app') {
			return { type: 'dock-app', fileName: contextMenu.dockAppName || 'App', isDir: false };
		}
		if (contextMenu?.targetType === 'dock-session') {
			return { type: 'dock-session', fileName: contextMenu.dockSessionRole || 'Session', isDir: false };
		}
		if (contextMenu?.targetType === 'dock-minimized') {
			return { type: 'dock-minimized', fileName: contextMenu.minimizedWindowTitle || 'Window', isDir: false };
		}
		if (contextMenu?.targetType === 'panel-chief') {
			return { type: 'panel-chief', fileName: 'Chief', isDir: false };
		}
		if (contextMenu?.targetType === 'panel-specialist') {
			const roleName = contextMenu.panelSessionRole || 'Specialist';
			return { type: 'panel-specialist', fileName: roleName.charAt(0).toUpperCase() + roleName.slice(1), isDir: false };
		}
		if (contextMenu?.targetType === 'panel-attachment') {
			return { type: 'panel-attachment', fileName: contextMenu.attachmentName || 'File', isDir: false };
		}
		if (!contextMenu?.targetPath) {
			return { type: 'desktop', fileName: '', isDir: false };
		}

		const path = contextMenu.targetPath;
		const fileName = path.split('/').pop() || '';
		const isDir = contextMenu.isDirectory ?? !fileName.includes('.');

		if (CLAUDE_SYSTEM_FILES.has(fileName)) {
			return { type: 'system-file', fileName, isDir: false };
		}
		if (contextMenu.hasLifeSpec) {
			return { type: 'life-domain', fileName, isDir: true };
		}
		if (contextMenu.hasAppSpec) {
			return { type: 'custom-app', fileName, isDir: true };
		}

		return { type: (isDir ? 'folder' : 'file') as TargetType, fileName, isDir };
	}, [contextMenu]);

	const createDirectory = contextMenu?.currentDirectory ?? '';

	// Get explanation for target item
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
			if (e.key === 'Escape') closeContextMenu();
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

	// Listen for "open-move-to" events
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

	// === ACTION HANDLERS ===

	const handleOpen = useCallback(() => {
		if (contextMenu?.targetPath) {
			if (contextMenu.isDirectory || contextMenu.hasLifeSpec || contextMenu.hasAppSpec) {
				const relativePath = toDesktopRelative(contextMenu.targetPath);
				if (contextMenu.targetType === 'finder-item' && contextMenu.sourceWindowId) {
					window.dispatchEvent(new CustomEvent('finder-navigate', {
						detail: { path: relativePath, windowId: contextMenu.sourceWindowId }
					}));
				} else {
					openAppWindow('finder', relativePath);
				}
			} else {
				const name = contextMenu.targetPath.split('/').pop() || 'Untitled';
				openWindow(contextMenu.targetPath, name);
			}
		}
		closeContextMenu();
	}, [contextMenu, openWindow, openAppWindow, closeContextMenu]);

	const handleOpenInNewWindow = useCallback(() => {
		if (contextMenu?.targetPath) {
			openAppWindow('finder', toDesktopRelative(contextMenu.targetPath));
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
		if (contextMenu?.targetPath) startRename(contextMenu.targetPath);
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
		if (contextMenu?.targetPath) navigator.clipboard.writeText(contextMenu.targetPath);
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleShowInFinder = useCallback(() => {
		if (contextMenu?.targetPath) showInFinder(contextMenu.targetPath, { openAppWindow });
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
		if (app === 'vscode') window.open(`vscode://file${contextMenu.targetPath}`, '_blank');
		else if (app === 'cursor') window.open(`cursor://file${contextMenu.targetPath}`, '_blank');
		else if (app === 'default') { handleOpen(); return; }
		closeContextMenu();
	}, [contextMenu, handleOpen, closeContextMenu]);

	const handleExport = useCallback(() => {
		if (contextMenu?.targetPath) {
			const fileName = contextMenu.targetPath.split('/').pop() || 'file';
			// Backend /api/files/raw/ accepts absolute paths
			const downloadUrl = `${API_BASE}/api/files/raw/${encodeURIComponent(contextMenu.targetPath)}`;
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
			try { await openInMacOS(contextMenu.targetPath); }
			catch (err) {
				console.error('Error opening in macOS:', err);
				toast.error(err instanceof Error ? err.message : 'Failed to open in macOS');
			}
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	const handleAttachToChat = useCallback(() => {
		if (contextMenu?.targetPath) {
			window.dispatchEvent(new CustomEvent('attach-to-chat', { detail: { path: contextMenu.targetPath } }));
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

	// Folder actions
	const handleNewFileInside = useCallback(() => {
		if (!contextMenu?.targetPath) return;
		const targetPath = contextMenu.targetPath;
		const sourceWindowId = contextMenu.sourceWindowId;
		showPrompt('New File', 'Enter filename (e.g., notes.md)', async (fileName) => {
			setIsCreating(true);
			try {
				const fullPath = `${targetPath}/${fileName}`;
				let content = '';
				if (fileName.endsWith('.md')) {
					content = `# ${fileName.replace(/\.md$/, '')}\n\n`;
				}
				await finderCreateFile(fullPath, content);
				window.dispatchEvent(new CustomEvent('refresh-finder', { detail: { windowId: sourceWindowId } }));
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
				await finderCreateFolder(`${targetPath}/${name}`);
				window.dispatchEvent(new CustomEvent('refresh-finder', { detail: { windowId: sourceWindowId } }));
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

	// Life domain actions
	const handleOpenLifeSpec = useCallback(() => {
		if (contextMenu?.targetPath) openWindow(`${contextMenu.targetPath}/LIFE-SPEC.md`, 'LIFE-SPEC.md');
		closeContextMenu();
	}, [contextMenu, openWindow, closeContextMenu]);

	// Custom app actions
	const handleLaunchApp = useCallback(() => {
		if (contextMenu?.targetPath) {
			const appName = contextMenu.targetPath.split('/').pop() || '';
			router.push(`/${appName}`);
		}
		closeContextMenu();
	}, [contextMenu, router, closeContextMenu]);

	const handleOpenAppSpec = useCallback(() => {
		if (contextMenu?.targetPath) openWindow(`${contextMenu.targetPath}/APP-SPEC.md`, 'APP-SPEC.md');
		closeContextMenu();
	}, [contextMenu, openWindow, closeContextMenu]);

	const handleUninstallApp = useCallback(async () => {
		const confirmed = window.confirm('Uninstall this application? This will move it to Trash.');
		if (confirmed) await handleMoveToTrash();
		else closeContextMenu();
	}, [handleMoveToTrash, closeContextMenu]);

	const handleRequestFeature = useCallback(() => {
		if (contextMenu?.targetPath) {
			const appName = contextMenu.targetPath.split('/').pop() || 'this app';
			window.dispatchEvent(new CustomEvent('ask-chief', {
				detail: { path: contextMenu.targetPath, itemName: appName, message: `I'd like to request a feature for ${appName}: ` }
			}));
		}
		closeContextMenu();
	}, [contextMenu, closeContextMenu]);

	// Trash actions
	const handleOpenTrash = useCallback(() => {
		openAppWindow('finder');
		closeContextMenu();
	}, [openAppWindow, closeContextMenu]);

	const handleEmptyTrash = useCallback(async () => {
		const confirmed = window.confirm('Are you sure you want to permanently delete all items in Trash? This cannot be undone.');
		if (confirmed) {
			try {
				const response = await fetch(`${API_BASE}/api/files/trash/empty`, {
					method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
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

	// Widget actions
	const handleCollapseWidget = useCallback(() => {
		if (contextMenu?.widgetId) useWindowStore.getState().toggleWidgetCollapse(contextMenu.widgetId);
		closeContextMenu();
	}, [contextMenu?.widgetId, closeContextMenu]);

	const handleRemoveWidget = useCallback(() => {
		if (contextMenu?.widgetId) useWindowStore.getState().removeWidget(contextMenu.widgetId);
		closeContextMenu();
	}, [contextMenu?.widgetId, closeContextMenu]);

	// Dock app actions
	const handleOpenDockApp = useCallback(() => {
		if (contextMenu?.dockAppType) openAppWindow(contextMenu.dockAppType);
		closeContextMenu();
	}, [contextMenu?.dockAppType, openAppWindow, closeContextMenu]);

	const handleQuitDockApp = useCallback(() => {
		if (contextMenu?.dockAppType) {
			const { windows, closeWindow } = useWindowStore.getState();
			windows.forEach(win => { if (win.appType === contextMenu.dockAppType) closeWindow(win.id); });
		}
		closeContextMenu();
	}, [contextMenu?.dockAppType, closeContextMenu]);

	// Dock session actions
	const handleFocusSession = useCallback(async () => {
		if (contextMenu?.dockSessionId) {
			try { await fetch(`${API_BASE}/api/sessions/${contextMenu.dockSessionId}/focus`, { method: 'POST' }); }
			catch (err) { console.error('Failed to focus session:', err); }
		}
		closeContextMenu();
	}, [contextMenu?.dockSessionId, closeContextMenu]);

	const handleEndSession = useCallback(async () => {
		if (contextMenu?.dockSessionId) {
			if (window.confirm('Are you sure you want to end this Claude session?')) {
				try { await fetch(`${API_BASE}/api/sessions/${contextMenu.dockSessionId}/end`, { method: 'POST' }); }
				catch (err) { console.error('Failed to end session:', err); }
			}
		}
		closeContextMenu();
	}, [contextMenu?.dockSessionId, closeContextMenu]);

	const handleGetInfoDockSession = useCallback(() => {
		if (contextMenu?.dockSessionId) { setSessionInfoId(contextMenu.dockSessionId); setShowSessionInfo(true); }
		closeContextMenu();
	}, [contextMenu?.dockSessionId, closeContextMenu]);

	const handleGetInfoPanelSession = useCallback(() => {
		if (contextMenu?.panelSessionId) { setSessionInfoId(contextMenu.panelSessionId); setShowSessionInfo(true); }
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	// Dock minimized actions
	const handleRestoreWindow = useCallback(() => {
		if (contextMenu?.minimizedWindowId) useWindowStore.getState().unminimizeWindow(contextMenu.minimizedWindowId);
		closeContextMenu();
	}, [contextMenu?.minimizedWindowId, closeContextMenu]);

	const handleCloseMinimizedWindow = useCallback(() => {
		if (contextMenu?.minimizedWindowId) useWindowStore.getState().closeWindow(contextMenu.minimizedWindowId);
		closeContextMenu();
	}, [contextMenu?.minimizedWindowId, closeContextMenu]);

	// Panel chief actions
	const handleFocusChiefTmux = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try { await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/focus`, { method: 'POST' }); }
			catch (err) { console.error('Failed to focus session:', err); }
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleForceResetChief = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try { await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/force-handoff`, { method: 'POST' }); }
			catch (err) { console.error('Failed to force reset:', err); }
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleResetChief = useCallback(async () => {
		if (window.confirm('Reset Chief? This will restart the Chief session completely.')) {
			try { await fetch(`${API_BASE}/api/sessions/chief/reset`, { method: 'POST' }); }
			catch (err) { console.error('Failed to reset Chief:', err); }
		}
		closeContextMenu();
	}, [closeContextMenu]);

	// Panel specialist actions
	const handleAttachContextToChief = useCallback(() => {
		if (contextMenu?.panelSessionId && contextMenu?.panelSessionRole) {
			window.dispatchEvent(new CustomEvent('attach-specialist-context', {
				detail: { sessionId: contextMenu.panelSessionId, role: contextMenu.panelSessionRole }
			}));
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, contextMenu?.panelSessionRole, closeContextMenu]);

	const handleFocusSpecialistTmux = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try { await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/focus`, { method: 'POST' }); }
			catch (err) { console.error('Failed to focus session:', err); }
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleForceResetSpecialist = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			try { await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/force-handoff`, { method: 'POST' }); }
			catch (err) { console.error('Failed to force reset:', err); }
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, closeContextMenu]);

	const handleEndSpecialistSession = useCallback(async () => {
		if (contextMenu?.panelSessionId) {
			const roleName = contextMenu.panelSessionRole || 'Specialist';
			if (window.confirm(`End ${roleName} session? This cannot be undone.`)) {
				try { await fetch(`${API_BASE}/api/sessions/${contextMenu.panelSessionId}/end`, { method: 'POST' }); }
				catch (err) { console.error('Failed to end session:', err); }
			}
		}
		closeContextMenu();
	}, [contextMenu?.panelSessionId, contextMenu?.panelSessionRole, closeContextMenu]);

	// Panel attachment actions
	const handleOpenAttachment = useCallback(() => {
		if (contextMenu?.attachmentPath) useWindowStore.getState().openWindow(contextMenu.attachmentPath, contextMenu.attachmentName || 'File');
		closeContextMenu();
	}, [contextMenu?.attachmentPath, contextMenu?.attachmentName, closeContextMenu]);

	const handleShowAttachmentInFinder = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			const dirPath = contextMenu.attachmentPath.split('/').slice(0, -1).join('/') || 'Desktop';
			openAppWindow('finder', dirPath);
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, openAppWindow, closeContextMenu]);

	const handleRevealAttachmentOnDesktop = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			const path = contextMenu.attachmentPath;
			router.push('/desktop');
			setTimeout(() => useWindowStore.getState().selectIcon(path), 100);
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, router, closeContextMenu]);

	const handleCopyAttachmentPath = useCallback(() => {
		if (contextMenu?.attachmentPath) navigator.clipboard.writeText(contextMenu.attachmentPath);
		closeContextMenu();
	}, [contextMenu?.attachmentPath, closeContextMenu]);

	const handleRemoveAttachment = useCallback(() => {
		if (contextMenu?.attachmentPath) {
			window.dispatchEvent(new CustomEvent('remove-attachment', { detail: { path: contextMenu.attachmentPath } }));
		}
		closeContextMenu();
	}, [contextMenu?.attachmentPath, closeContextMenu]);

	const handleGetInfoAttachment = useCallback(() => {
		if (contextMenu?.attachmentPath) { setGetInfoPath(contextMenu.attachmentPath); setShowGetInfo(true); }
		closeContextMenu();
	}, [contextMenu?.attachmentPath, closeContextMenu]);

	// Desktop actions
	const handleNewFolder = useCallback(() => {
		const dir = createDirectory;
		const sourceWindowId = contextMenu?.sourceWindowId;
		showPrompt('New Folder', 'Enter folder name', async (name) => {
			setIsCreating(true);
			try {
				const folderPath = dir ? `${dir}/${name}` : name;
				await finderCreateFolder(folderPath);
				window.dispatchEvent(new CustomEvent('refresh-finder', { detail: { windowId: sourceWindowId } }));
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
				const filePath = dir ? `${dir}/${fileName}` : fileName;
				let content = '';
				if (fileName.endsWith('.md')) content = `# ${fileName.replace(/\.md$/, '')}\n\n`;
				await finderCreateFile(filePath, content);
				window.dispatchEvent(new CustomEvent('refresh-finder', { detail: { windowId: sourceWindowId } }));
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
			for (const file of Array.from(files)) await finderUpload(file);
		} catch (err) {
			console.error('Error importing files:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to import files');
		} finally {
			setIsCreating(false);
			if (fileInputRef.current) fileInputRef.current.value = '';
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

	const handleCloseAllWindows = useCallback(() => {
		const { windows, closeWindow } = useWindowStore.getState();
		windows.forEach(w => closeWindow(w.id));
		closeContextMenu();
	}, [closeContextMenu]);

	// === ACTIONS OBJECT ===

	const actions: MenuActions = useMemo(() => ({
		handleOpen, handleOpenInNewWindow, handleGetInfo, handleRename,
		handleMoveToTrash, handleCopyPath, handleShowInFinder, handleMoveTo,
		handleOpenWith, handleExport, handleOpenInMacOS, handleAttachToChat,
		handleExplainThis, handleWhyProtected, handleNewFileInside, handleNewFolderInside,
		handleOpenLifeSpec, handleLaunchApp, handleOpenAppSpec, handleUninstallApp,
		handleRequestFeature, handleOpenTrash, handleEmptyTrash, handleCollapseWidget,
		handleRemoveWidget, handleOpenDockApp, handleQuitDockApp, handleFocusSession,
		handleEndSession, handleGetInfoDockSession, handleGetInfoPanelSession,
		handleRestoreWindow, handleCloseMinimizedWindow, handleFocusChiefTmux,
		handleForceResetChief, handleResetChief, handleAttachContextToChief,
		handleFocusSpecialistTmux, handleForceResetSpecialist, handleEndSpecialistSession,
		handleOpenAttachment, handleShowAttachmentInFinder, handleRevealAttachmentOnDesktop,
		handleCopyAttachmentPath, handleRemoveAttachment, handleGetInfoAttachment,
		handleNewFolder, handleNewFile, handleImportClick, handleCleanUp,
		handleSortBy, handleRefresh, handleCloseAllWindows,
	}), [
		handleOpen, handleOpenInNewWindow, handleGetInfo, handleRename,
		handleMoveToTrash, handleCopyPath, handleShowInFinder, handleMoveTo,
		handleOpenWith, handleExport, handleOpenInMacOS, handleAttachToChat,
		handleExplainThis, handleWhyProtected, handleNewFileInside, handleNewFolderInside,
		handleOpenLifeSpec, handleLaunchApp, handleOpenAppSpec, handleUninstallApp,
		handleRequestFeature, handleOpenTrash, handleEmptyTrash, handleCollapseWidget,
		handleRemoveWidget, handleOpenDockApp, handleQuitDockApp, handleFocusSession,
		handleEndSession, handleGetInfoDockSession, handleGetInfoPanelSession,
		handleRestoreWindow, handleCloseMinimizedWindow, handleFocusChiefTmux,
		handleForceResetChief, handleResetChief, handleAttachContextToChief,
		handleFocusSpecialistTmux, handleForceResetSpecialist, handleEndSpecialistSession,
		handleOpenAttachment, handleShowAttachmentInFinder, handleRevealAttachmentOnDesktop,
		handleCopyAttachmentPath, handleRemoveAttachment, handleGetInfoAttachment,
		handleNewFolder, handleNewFile, handleImportClick, handleCleanUp,
		handleSortBy, handleRefresh, handleCloseAllWindows,
	]);

	// === DERIVED STATE ===

	const menuStyle: React.CSSProperties = contextMenu ? {
		position: 'fixed',
		left: contextMenu.x,
		top: contextMenu.y,
		zIndex: 9999,
	} : {};

	const getInfoPanel = showGetInfo && getInfoPath ? (
		<GetInfoPanel path={getInfoPath} onClose={() => { setShowGetInfo(false); setGetInfoPath(null); }} />
	) : null;

	const sessionInfoPanel = showSessionInfo && sessionInfoId ? (
		<SessionInfoPanel sessionId={sessionInfoId} onClose={() => { setShowSessionInfo(false); setSessionInfoId(null); }} />
	) : null;

	const isWidgetCollapsed = useMemo(() => {
		if (!contextMenu?.widgetId) return false;
		const { widgets } = useWindowStore.getState();
		return widgets.find(w => w.id === contextMenu.widgetId)?.collapsed ?? false;
	}, [contextMenu?.widgetId]);

	// === RENDER: No context menu open ===

	if (!contextMenu) {
		return (
			<>
				{getInfoPanel}
				{sessionInfoPanel}
				<MoveToModal
					isOpen={showMoveTo}
					sourcePath={moveToPath || ''}
					sourceName={moveToName}
					onClose={() => { setShowMoveTo(false); setMoveToPath(null); }}
				/>
				<input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileImport} />
				{promptModal && (
					<div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handlePromptCancel}>
						<div
							className="w-[340px] rounded-xl overflow-hidden"
							style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}
							onClick={(e) => e.stopPropagation()}
						>
							<div className="px-4 py-3" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
								<h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{promptModal.title}</h3>
							</div>
							<div className="p-4">
								<input
									ref={promptInputRef} type="text" value={promptValue}
									onChange={(e) => setPromptValue(e.target.value)}
									onKeyDown={(e) => { if (e.key === 'Enter' && promptValue.trim()) handlePromptSubmit(); else if (e.key === 'Escape') handlePromptCancel(); }}
									className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-claude)] focus:border-transparent transition-all"
									style={{ background: 'var(--surface-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
									placeholder={promptModal.placeholder} autoFocus
								/>
							</div>
							<div className="flex justify-end gap-2 px-4 py-3" style={{ background: 'var(--surface-muted)', borderTop: '1px solid var(--border-subtle)' }}>
								<button onClick={handlePromptCancel} className="px-4 py-1.5 text-sm rounded-lg transition-colors hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
								<button onClick={handlePromptSubmit} disabled={!promptValue.trim()} className="px-4 py-1.5 text-sm rounded-lg bg-[var(--color-claude)] text-white font-medium hover:bg-[#c66a4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Create</button>
							</div>
						</div>
					</div>
				)}
			</>
		);
	}

	// === RENDER: Context menu open ===

	return (
		<>
			<div
				ref={menuRef}
				className="min-w-[220px] rounded-lg overflow-hidden backdrop-blur-xl"
				style={{
					...menuStyle,
					background: 'var(--surface-raised)',
					border: '1px solid var(--border-default)',
					boxShadow: '0 10px 25px rgba(0,0,0,0.15), 0 0 0 1px var(--border-subtle)',
					animation: 'contextMenuIn 100ms ease-out',
				}}
			>
				<MenuRenderer
					targetInfo={targetInfo}
					contextMenu={contextMenu}
					actions={actions}
					isWidgetCollapsed={isWidgetCollapsed}
				/>
			</div>

			{/* Explanation Tooltip */}
			{showExplanation && explanation && (
				<ExplanationTooltip
					explanation={explanation}
					anchorRect={explanationAnchor}
					onClose={() => { setShowExplanation(false); closeContextMenu(); }}
					onAskChief={() => {
						window.dispatchEvent(new CustomEvent('ask-chief', {
							detail: { path: contextMenu?.targetPath, itemName: explanation.title }
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
					onClick={() => { setShowWhyProtected(false); closeContextMenu(); }}
				>
					<div
						className="max-w-md p-4 rounded-xl"
						style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center gap-3 mb-3">
							<div className="w-10 h-10 rounded-full bg-[var(--color-claude)]/20 flex items-center justify-center">
								<Lock className="w-5 h-5 text-[var(--color-claude)]" />
							</div>
							<div>
								<h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Protected System File</h3>
								<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{targetInfo.fileName}</p>
							</div>
						</div>
						<p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
							This file is managed by Claude and is essential for the Claude OS system to function properly.
						</p>
						<ul className="text-sm space-y-1 mb-4" style={{ color: 'var(--text-secondary)' }}>
							<li className="flex items-center gap-2"><span className="text-[var(--color-claude)]">&#8226;</span><strong>TODAY.md</strong> - Daily memory and context</li>
							<li className="flex items-center gap-2"><span className="text-[var(--color-claude)]">&#8226;</span><strong>MEMORY.md</strong> - Long-term knowledge</li>
							<li className="flex items-center gap-2"><span className="text-[var(--color-claude)]">&#8226;</span><strong>LIFE.md</strong> - Your life blueprint</li>
							<li className="flex items-center gap-2"><span className="text-[var(--color-claude)]">&#8226;</span><strong>IDENTITY.md</strong> - Claude&apos;s identity config</li>
						</ul>
						<p className="text-xs" style={{ color: 'var(--text-muted)' }}>
							You can view these files but not modify or delete them. Claude updates them as needed.
						</p>
						<button
							className="mt-4 w-full py-2 px-4 rounded-lg bg-[var(--color-claude)] text-white font-medium text-sm hover:bg-[#c66a4d] transition-colors"
							onClick={() => { setShowWhyProtected(false); closeContextMenu(); }}
						>
							Got it
						</button>
					</div>
				</div>
			)}

			{/* Hidden file input for import */}
			<input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileImport} />

			{/* Custom Prompt Modal */}
			{promptModal && (
				<div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handlePromptCancel}>
					<div
						className="w-[340px] rounded-xl overflow-hidden"
						style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="px-4 py-3" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
							<h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{promptModal.title}</h3>
						</div>
						<div className="p-4">
							<input
								ref={promptInputRef} type="text" value={promptValue}
								onChange={(e) => setPromptValue(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter' && promptValue.trim()) handlePromptSubmit(); else if (e.key === 'Escape') handlePromptCancel(); }}
								placeholder={promptModal.placeholder}
								className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-claude)] focus:border-transparent transition-all"
								style={{ background: 'var(--surface-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
								autoFocus
							/>
							<p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Press Enter to create, Escape to cancel</p>
						</div>
						<div className="px-4 py-3 flex justify-end gap-2" style={{ background: 'var(--surface-muted)', borderTop: '1px solid var(--border-subtle)' }}>
							<button onClick={handlePromptCancel} className="px-4 py-1.5 text-sm font-medium rounded-lg transition-colors hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
							<button onClick={handlePromptSubmit} disabled={!promptValue.trim()} className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[var(--color-claude)] text-white hover:bg-[#c66a4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Create</button>
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
				onClose={() => { setShowMoveTo(false); setMoveToPath(null); }}
			/>
		</>
	);
}

export default ContextMenu;
