'use client';

import { finderList, finderMove, FinderItem } from '@/lib/api';
import { toDesktopRelative } from '@/lib/pathUtils';
import {
	ChevronLeft,
	ChevronRight,
	Folder,
	Loader2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface MoveToModalProps {
	isOpen: boolean;
	sourcePath: string;
	sourceName: string;
	onClose: () => void;
	onMoved?: () => void;
}

interface SidebarItem {
	name: string;
	path: string;
	type: 'favorite' | 'domain' | 'app';
}

export function MoveToModal({ isOpen, sourcePath, sourceName, onClose, onMoved }: MoveToModalProps) {
	const [loading, setLoading] = useState(true);
	const [moving, setMoving] = useState(false);
	const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);

	// Navigation state
	const [currentPath, setCurrentPath] = useState('');
	const [folderContents, setFolderContents] = useState<FinderItem[]>([]);
	const [contentLoading, setContentLoading] = useState(false);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	// Navigation history
	const [history, setHistory] = useState<string[]>(['']);
	const [historyIndex, setHistoryIndex] = useState(0);

	const contentRef = useRef<HTMLDivElement>(null);

	// Source parent path for "current location" detection (Desktop-relative)
	const sourceRelative = toDesktopRelative(sourcePath);
	const sourceParent = sourceRelative.split('/').slice(0, -1).join('/');

	const isCurrentLocation = (path: string) => path === sourceParent;

	// Load sidebar items on open
	useEffect(() => {
		if (!isOpen) return;
		setSelectedPath(null);
		setCurrentPath('');
		setHistory(['']);
		setHistoryIndex(0);
		setLoading(true);

		finderList('').then(data => {
			const items: SidebarItem[] = [
				{ name: 'Desktop', path: '', type: 'favorite' },
				{ name: 'conversations', path: 'conversations', type: 'favorite' },
			];
			for (const item of data.items) {
				if (item.type === 'domain') {
					items.push({ name: item.name, path: item.name, type: 'domain' });
				} else if (item.type === 'app') {
					items.push({ name: item.name, path: item.name, type: 'app' });
				}
			}
			setSidebarItems(items);
			setLoading(false);
		}).catch(() => setLoading(false));
	}, [isOpen]);

	// Load folder contents when currentPath changes
	const loadFolder = useCallback(async (path: string) => {
		setContentLoading(true);
		try {
			const data = await finderList(path);
			setFolderContents(
				data.items.filter(i => i.type === 'folder' || i.type === 'domain' || i.type === 'app')
			);
		} catch {
			setFolderContents([]);
		} finally {
			setContentLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		loadFolder(currentPath);
	}, [isOpen, currentPath, loadFolder]);

	// Navigate to a folder (adds to history)
	const navigateTo = useCallback((path: string) => {
		setCurrentPath(path);
		setSelectedPath(path);
		setHistory(prev => {
			const newHistory = prev.slice(0, historyIndex + 1);
			newHistory.push(path);
			return newHistory;
		});
		setHistoryIndex(prev => prev + 1);
	}, [historyIndex]);

	// Sidebar click — navigate and select
	const handleSidebarClick = useCallback((path: string) => {
		navigateTo(path);
	}, [navigateTo]);

	// Double-click folder in list — navigate into it
	const handleFolderDoubleClick = useCallback((item: FinderItem) => {
		const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
		navigateTo(fullPath);
	}, [currentPath, navigateTo]);

	// Single-click folder in list — select as destination
	const handleFolderClick = useCallback((item: FinderItem) => {
		const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
		setSelectedPath(fullPath);
	}, [currentPath]);

	// Back / Forward
	const canGoBack = historyIndex > 0;
	const canGoForward = historyIndex < history.length - 1;

	const goBack = useCallback(() => {
		if (!canGoBack) return;
		const newIndex = historyIndex - 1;
		setHistoryIndex(newIndex);
		setCurrentPath(history[newIndex]);
		setSelectedPath(history[newIndex]);
	}, [canGoBack, historyIndex, history]);

	const goForward = useCallback(() => {
		if (!canGoForward) return;
		const newIndex = historyIndex + 1;
		setHistoryIndex(newIndex);
		setCurrentPath(history[newIndex]);
		setSelectedPath(history[newIndex]);
	}, [canGoForward, historyIndex, history]);

	// Move action
	const handleMove = useCallback(async () => {
		if (selectedPath === null) return;
		setMoving(true);
		try {
			await finderMove(sourcePath, selectedPath);
			const destName = selectedPath ? selectedPath.split('/').pop() : 'Desktop';
			toast.success(`Moved to ${destName}`);
			window.dispatchEvent(new CustomEvent('refresh-desktop'));
			window.dispatchEvent(new CustomEvent('refresh-finder', { detail: {} }));
			window.dispatchEvent(new CustomEvent('close-file-window', {
				detail: { path: sourcePath }
			}));
			onMoved?.();
			onClose();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to move';
			if (msg.includes('Already exists')) {
				toast.error(`"${sourcePath.split('/').pop()}" already exists there`);
			} else {
				toast.error(msg);
			}
		} finally {
			setMoving(false);
		}
	}, [selectedPath, sourcePath, onClose, onMoved]);

	// Keyboard: Escape to close, Enter to move
	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
			if (e.key === 'Enter' && selectedPath !== null && !isCurrentLocation(selectedPath)) handleMove();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [isOpen, selectedPath, handleMove, onClose]);

	if (!isOpen) return null;

	// Build breadcrumb segments
	const pathParts = currentPath ? currentPath.split('/') : [];
	const breadcrumbs = [{ name: 'Desktop', path: '' }, ...pathParts.map((part, i) => ({
		name: part,
		path: pathParts.slice(0, i + 1).join('/'),
	}))];

	// Group sidebar
	const favorites = sidebarItems.filter(i => i.type === 'favorite');
	const domains = sidebarItems.filter(i => i.type === 'domain');
	const apps = sidebarItems.filter(i => i.type === 'app');

	const folderIcon = (type: string) => {
		const color = type === 'domain' ? 'text-emerald-500'
			: type === 'app' ? 'text-blue-500'
			: 'text-[var(--text-tertiary)]';
		return <Folder className={`w-4 h-4 flex-shrink-0 ${color}`} />;
	};

	return (
		<div
			className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[520px] rounded-xl overflow-hidden flex flex-col"
				style={{ height: '420px', background: 'var(--surface-base)', border: '1px solid var(--border-default)', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Title bar */}
				<div
					className="flex items-center justify-center h-[38px] flex-shrink-0 relative"
					style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--border-default)' }}
				>
					<span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
						Move &ldquo;{sourceName}&rdquo;
					</span>
				</div>

				{/* Toolbar */}
				<div
					className="flex items-center gap-1.5 h-[34px] px-2 flex-shrink-0"
					style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--border-default)' }}
				>
					<button
						onClick={goBack}
						disabled={!canGoBack}
						className="p-1 rounded-md disabled:opacity-30 transition-colors"
						style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}
					>
						<ChevronLeft className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
					</button>
					<button
						onClick={goForward}
						disabled={!canGoForward}
						className="p-1 rounded-md disabled:opacity-30 transition-colors"
						style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}
					>
						<ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
					</button>

					<div className="w-px h-4 mx-1" style={{ background: 'var(--border-default)' }} />

					{/* Breadcrumb */}
					<div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
						{breadcrumbs.map((seg, i) => (
							<div key={seg.path} className="flex items-center gap-0.5 min-w-0">
								{i > 0 && (
									<ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
								)}
								<button
									onClick={() => navigateTo(seg.path)}
									className="text-[12px] px-1.5 py-0.5 rounded truncate transition-colors"
									style={{ color: 'var(--text-secondary)' }}
									onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-muted)'; }}
									onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
								>
									{seg.name}
								</button>
							</div>
						))}
					</div>
				</div>

				{/* Main content area — sidebar + list */}
				{loading ? (
					<div className="flex-1 flex items-center justify-center">
						<Loader2 className="w-5 h-5 animate-spin text-[var(--text-tertiary)]" />
					</div>
				) : (
					<div className="flex-1 flex min-h-0">
						{/* Sidebar */}
						<div
							className="w-[150px] flex-shrink-0 overflow-y-auto backdrop-blur-xl py-1.5"
							style={{ background: 'var(--surface-muted)', borderRight: '1px solid var(--border-default)' }}
						>
							{/* Favorites */}
							<SidebarSection label="Favorites">
								{favorites.map(item => (
									<SidebarRow
										key={item.path}
										name={item.name}
										icon={item.name === 'Desktop'
											? <svg viewBox="0 0 24 24" className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
											: folderIcon('folder')
										}
										isActive={currentPath === item.path}
										isCurrent={isCurrentLocation(item.path)}
										onClick={() => handleSidebarClick(item.path)}
									/>
								))}
							</SidebarSection>

							{domains.length > 0 && (
								<SidebarSection label="Domains">
									{domains.map(item => (
										<SidebarRow
											key={item.path}
											name={item.name}
											icon={folderIcon('domain')}
											isActive={currentPath === item.path}
											isCurrent={isCurrentLocation(item.path)}
											onClick={() => handleSidebarClick(item.path)}
										/>
									))}
								</SidebarSection>
							)}

							{apps.length > 0 && (
								<SidebarSection label="Apps">
									{apps.map(item => (
										<SidebarRow
											key={item.path}
											name={item.name}
											icon={folderIcon('app')}
											isActive={currentPath === item.path}
											isCurrent={isCurrentLocation(item.path)}
											onClick={() => handleSidebarClick(item.path)}
										/>
									))}
								</SidebarSection>
							)}
						</div>

						{/* List view — Finder style */}
						<div ref={contentRef} className="flex-1 overflow-y-auto bg-[var(--surface-raised)]">
							{contentLoading ? (
								<div className="flex items-center justify-center h-full">
									<Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
								</div>
							) : folderContents.length === 0 ? (
								<div className="flex items-center justify-center h-full">
									<span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
										No subfolders
									</span>
								</div>
							) : (
								<div className="py-0.5">
									{folderContents.map((item, i) => {
										const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
										const isSelected = selectedPath === fullPath;
										const isCurrent = isCurrentLocation(fullPath);

										return (
											<button
												key={item.name}
												onClick={() => handleFolderClick(item)}
												onDoubleClick={() => handleFolderDoubleClick(item)}
												disabled={isCurrent}
												className={`
													w-full flex items-center gap-2.5 px-3 py-[5px] text-left
													transition-colors text-[13px]
													${isCurrent
														? 'opacity-35 cursor-not-allowed'
														: isSelected
															? 'bg-[var(--color-claude)] text-white'
															: ''
													}
												`}
												style={!isCurrent && !isSelected ? { color: 'var(--text-primary)' } : undefined}
												onMouseEnter={(e) => {
													if (!isCurrent && !isSelected) {
														e.currentTarget.style.background = 'var(--surface-muted)';
													}
												}}
												onMouseLeave={(e) => {
													if (!isCurrent && !isSelected) {
														e.currentTarget.style.background = 'transparent';
													}
												}}
											>
												<Folder className={`w-4 h-4 flex-shrink-0 ${
													isSelected && !isCurrent ? 'text-white' :
													item.type === 'domain' ? 'text-emerald-500' :
													item.type === 'app' ? 'text-blue-500' :
													''
												}`} style={!(isSelected && !isCurrent) && item.type !== 'domain' && item.type !== 'app' ? { color: 'var(--text-tertiary)' } : undefined} />
												<span className={`flex-1 truncate ${
													isSelected && !isCurrent ? 'text-white' : ''
												}`} style={!(isSelected && !isCurrent) ? { color: 'var(--text-primary)' } : undefined}>
													{item.name}
												</span>
												{isCurrent && (
													<span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>current location</span>
												)}
												{!isCurrent && item.child_count !== undefined && item.child_count > 0 && (
													<span className="text-[11px]" style={{ color: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}>
														{item.child_count}
													</span>
												)}
												{!isCurrent && (
													<ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isSelected ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }} />
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>
					</div>
				)}

				{/* Footer */}
				<div
					className="flex items-center justify-between h-[46px] px-3 flex-shrink-0"
					style={{ background: 'var(--surface-base)', borderTop: '1px solid var(--border-default)' }}
				>
					<div className="text-[11px] truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>
						{selectedPath !== null
							? `to: ${selectedPath || 'Desktop'}`
							: 'Select a destination'
						}
					</div>

					<div className="flex items-center gap-2">
						<button
							onClick={onClose}
							className="px-3.5 py-[5px] text-[13px] font-medium rounded-md transition-colors"
							style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
						>
							Cancel
						</button>
						<button
							onClick={handleMove}
							disabled={selectedPath === null || isCurrentLocation(selectedPath ?? '') || moving}
							className="px-3.5 py-[5px] text-[13px] font-medium rounded-md bg-[var(--color-claude)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
						>
							{moving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
							Move
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// --- Sidebar components ---

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="mb-1">
			<div className="px-3 pt-2 pb-1">
				<span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
					{label}
				</span>
			</div>
			{children}
		</div>
	);
}

function SidebarRow({ name, icon, isActive, isCurrent, onClick }: {
	name: string;
	icon: React.ReactNode;
	isActive: boolean;
	isCurrent: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={isCurrent ? undefined : onClick}
			disabled={isCurrent}
			className={`
				w-full flex items-center gap-2 px-3 py-[3px] text-[12px]
				transition-colors rounded-md mx-auto
				${isCurrent
					? 'opacity-35 cursor-not-allowed'
					: isActive
						? 'bg-[var(--color-claude)] text-white font-medium'
						: ''
				}
			`}
			style={{
				width: 'calc(100% - 8px)',
				marginLeft: 4,
				...(!isCurrent && !isActive ? { color: 'var(--text-primary)' } : {}),
			}}
			onMouseEnter={(e) => {
				if (!isCurrent && !isActive) {
					e.currentTarget.style.background = 'var(--surface-accent)';
				}
			}}
			onMouseLeave={(e) => {
				if (!isCurrent && !isActive) {
					e.currentTarget.style.background = 'transparent';
				}
			}}
		>
			{icon}
			<span className="truncate">{name}</span>
			{isCurrent && <span className="text-[9px] ml-auto" style={{ color: 'var(--text-muted)' }}>here</span>}
		</button>
	);
}

export default MoveToModal;
