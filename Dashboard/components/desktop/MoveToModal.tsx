'use client';

import { finderList, finderMove, FinderItem } from '@/lib/api';
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
	const sourceParent = sourcePath.replace(/^Desktop\//, '').split('/').slice(0, -1).join('/');

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
				className="
					w-[520px] rounded-xl overflow-hidden shadow-2xl
					bg-[var(--surface-base)] border border-[#B8B8B8] dark:border-[#2a2a2a]
					flex flex-col
				"
				style={{ height: '420px' }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Title bar — Finder gradient */}
				<div className="
					flex items-center justify-center
					h-[38px] flex-shrink-0
					bg-gradient-to-b from-[#E8E8E8] to-[#D4D4D4] dark:from-[#3d3d3d] dark:to-[#323232]
					border-b border-[#B8B8B8] dark:border-[#2a2a2a]
					relative
				">
					<span className="text-[13px] font-medium text-[var(--text-primary)]">
						Move &ldquo;{sourceName}&rdquo;
					</span>
				</div>

				{/* Toolbar — nav arrows + breadcrumb */}
				<div className="
					flex items-center gap-1.5 h-[34px] px-2 flex-shrink-0
					bg-gradient-to-b from-[#E8E8E8] to-[#DCDCDC] dark:from-[#383838] dark:to-[#303030]
					border-b border-[#C0C0C0] dark:border-[#2a2a2a]
				">
					<button
						onClick={goBack}
						disabled={!canGoBack}
						className="
							p-1 rounded-md
							bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a]
							hover:bg-white/80 dark:hover:bg-white/20
							disabled:opacity-30 disabled:hover:bg-white/50
							transition-colors
						"
					>
						<ChevronLeft className="w-3.5 h-3.5 text-[#4A4A4A] dark:text-[#c0c0c0]" />
					</button>
					<button
						onClick={goForward}
						disabled={!canGoForward}
						className="
							p-1 rounded-md
							bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a]
							hover:bg-white/80 dark:hover:bg-white/20
							disabled:opacity-30 disabled:hover:bg-white/50
							transition-colors
						"
					>
						<ChevronRight className="w-3.5 h-3.5 text-[#4A4A4A] dark:text-[#c0c0c0]" />
					</button>

					<div className="w-px h-4 bg-[#C0C0C0] dark:bg-[#4a4a4a] mx-1" />

					{/* Breadcrumb */}
					<div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
						{breadcrumbs.map((seg, i) => (
							<div key={seg.path} className="flex items-center gap-0.5 min-w-0">
								{i > 0 && (
									<ChevronRight className="w-3 h-3 text-[#8E8E93] flex-shrink-0" />
								)}
								<button
									onClick={() => navigateTo(seg.path)}
									className="
										text-[12px] px-1.5 py-0.5 rounded truncate
										text-[#4A4A4A] dark:text-[#c0c0c0] hover:bg-white/50 dark:hover:bg-white/10
										transition-colors
									"
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
						{/* Sidebar — Finder style */}
						<div className="
							w-[150px] flex-shrink-0 overflow-y-auto
							bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl
							border-r border-[#D1D1D1] dark:border-[#3a3a3a]
							py-1.5
						">
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
									<Loader2 className="w-4 h-4 animate-spin text-[#8E8E93]" />
								</div>
							) : folderContents.length === 0 ? (
								<div className="flex items-center justify-center h-full">
									<span className="text-[12px] text-[#8E8E93]">
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
															? 'bg-[#DA7756] text-white'
															: 'hover:bg-[#F0F0F0] dark:hover:bg-[#2a2a2a]'
													}
												`}
											>
												<Folder className={`w-4 h-4 flex-shrink-0 ${
													isSelected && !isCurrent ? 'text-white' :
													item.type === 'domain' ? 'text-emerald-500' :
													item.type === 'app' ? 'text-blue-500' :
													'text-[#8E8E93]'
												}`} />
												<span className={`flex-1 truncate ${
													isSelected && !isCurrent ? 'text-white' : 'text-[var(--text-primary)]'
												}`}>
													{item.name}
												</span>
												{isCurrent && (
													<span className="text-[10px] text-[#8E8E93]">current location</span>
												)}
												{!isCurrent && item.child_count !== undefined && item.child_count > 0 && (
													<span className={`text-[11px] ${
														isSelected ? 'text-white/60' : 'text-[#8E8E93]'
													}`}>
														{item.child_count}
													</span>
												)}
												{!isCurrent && (
													<ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${
														isSelected ? 'text-white/50' : 'text-[#8E8E93]'
													}`} />
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>
					</div>
				)}

				{/* Footer — Finder status bar style */}
				<div className="
					flex items-center justify-between
					h-[46px] px-3 flex-shrink-0
					bg-[#F5F5F5] dark:bg-[#252525] border-t border-[#D1D1D1] dark:border-[#3a3a3a]
				">
					{/* Left: destination label */}
					<div className="text-[11px] text-[#8E8E93] truncate max-w-[200px]">
						{selectedPath !== null
							? `to: ${selectedPath || 'Desktop'}`
							: 'Select a destination'
						}
					</div>

					{/* Right: buttons */}
					<div className="flex items-center gap-2">
						<button
							onClick={onClose}
							className="
								px-3.5 py-[5px] text-[13px] font-medium rounded-md
								bg-white/50 dark:bg-white/10 text-[var(--text-primary)]
								hover:bg-white/80 dark:hover:bg-white/20
								border border-[#C0C0C0] dark:border-[#4a4a4a]
								transition-colors
							"
						>
							Cancel
						</button>
						<button
							onClick={handleMove}
							disabled={selectedPath === null || isCurrentLocation(selectedPath ?? '') || moving}
							className="
								px-3.5 py-[5px] text-[13px] font-medium rounded-md
								bg-[#DA7756] text-white
								hover:bg-[#C15F3C]
								disabled:opacity-40 disabled:cursor-not-allowed
								transition-colors flex items-center gap-1.5
							"
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
				<span className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93]">
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
						? 'bg-[#DA7756] text-white font-medium'
						: 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
				}
			`}
			style={{ width: 'calc(100% - 8px)', marginLeft: 4 }}
		>
			{icon}
			<span className="truncate">{name}</span>
			{isCurrent && <span className="text-[9px] ml-auto text-[#8E8E93]">here</span>}
		</button>
	);
}

export default MoveToModal;
