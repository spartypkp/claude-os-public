'use client';

import { moveToTrash } from '@/lib/api';
import { getFolderColorClass } from '@/lib/folderCategories';
import { getFileIconSpec } from '@/lib/fileTypes';
import { showInFinder } from '@/lib/fileNavigation';
import { FileTreeNode } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import {
	ChevronRight,
	ClipboardCopy,
	ExternalLink,
	FolderInput,
	MessageSquarePlus,
	Pencil,
	Trash2,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

interface PathBarProps {
	filePath: string;
	className?: string;
}

interface PathSegment {
	name: string;
	path: string;
	isDirectory: boolean;
	isRoot: boolean;
}

// Reusable tooltip-wrapped icon button
function ToolbarButton({ onClick, tooltip, children, destructive }: {
	onClick: () => void;
	tooltip: string;
	children: React.ReactNode;
	destructive?: boolean;
}) {
	return (
		<div className="relative group">
			<button
				onClick={onClick}
				className={`
					flex items-center justify-center w-7 h-6 rounded
					transition-colors duration-150
					${destructive
						? 'text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10'
						: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
					}
				`}
			>
				{children}
			</button>
			<div className="
				absolute top-full left-1/2 -translate-x-1/2 mt-1.5
				px-2.5 py-1 rounded-md
				bg-[var(--surface-raised)] border border-[var(--border-default)]
				text-[10px] font-medium text-[var(--text-primary)]
				whitespace-nowrap
				opacity-0 group-hover:opacity-100
				pointer-events-none
				transition-opacity duration-150 delay-300
				shadow-lg z-50
			">
				{tooltip}
			</div>
		</div>
	);
}

function ToolbarSeparator() {
	return <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />;
}

/**
 * Path bar showing full file location with clickable breadcrumbs and file action toolbar.
 * Appears below title bar in file windows.
 *
 * Normalizes any path to Desktop-relative: "/Users/username/claude-os/Desktop/foo.md" → "Desktop/foo.md"
 */
export function PathBar({ filePath, className = '' }: PathBarProps) {
	const { openAppWindow, startRename, closeWindow, getWindowByPath } = useWindowStore();

	// Normalize path: strip everything before "Desktop/" so breadcrumbs and copy path
	// are scoped to Claude OS, not the full filesystem
	const normalizedPath = useMemo(() => {
		const idx = filePath.indexOf('Desktop/');
		if (idx > 0) return filePath.slice(idx);
		return filePath;
	}, [filePath]);

	// Parse file path into breadcrumb segments
	const segments = useMemo((): PathSegment[] => {
		const parts = normalizedPath.split('/').filter(Boolean);
		if (parts.length === 0) return [];

		const result: PathSegment[] = [];

		result.push({
			name: 'Desktop',
			path: '',
			isDirectory: true,
			isRoot: true,
		});

		for (let i = 1; i < parts.length; i++) {
			const isLastSegment = i === parts.length - 1;
			const isFile = isLastSegment && parts[i].includes('.');

			result.push({
				name: parts[i],
				path: parts.slice(1, i + 1).join('/'),
				isDirectory: !isFile,
				isRoot: false,
			});
		}

		return result;
	}, [filePath]);

	// Get folder color for directory segments
	const getFolderColor = (segment: PathSegment): string => {
		if (!segment.isDirectory) return '';
		const node: FileTreeNode = {
			name: segment.name,
			path: `Desktop/${segment.path}`,
			type: 'directory',
		};
		return getFolderColorClass(node);
	};

	// Get icon for file segment
	const fileIcon = useMemo(() => {
		const lastSegment = segments[segments.length - 1];
		if (!lastSegment || lastSegment.isDirectory) return null;
		return getFileIconSpec(lastSegment.name);
	}, [segments]);

	// === Actions ===

	const handleBreadcrumbClick = (segment: PathSegment) => {
		if (segment.isDirectory) {
			openAppWindow('finder', segment.path);
		}
	};

	const handleAttachToChat = useCallback(() => {
		window.dispatchEvent(new CustomEvent('attach-to-chat', {
			detail: { path: normalizedPath }
		}));
		toast.success('Attached to chat');
	}, [normalizedPath]);

	const handleCopyPath = useCallback(() => {
		navigator.clipboard.writeText(normalizedPath);
		toast.success('Path copied');
	}, [normalizedPath]);

	const handleMoveTo = useCallback(() => {
		const fileName = normalizedPath.split('/').pop() || 'item';
		window.dispatchEvent(new CustomEvent('open-move-to', {
			detail: { path: normalizedPath, name: fileName }
		}));
	}, [normalizedPath]);

	const handleShowInFinder = useCallback(() => {
		showInFinder(normalizedPath, { openAppWindow });
	}, [normalizedPath, openAppWindow]);

	const handleRename = useCallback(() => {
		startRename(filePath);
	}, [filePath, startRename]);

	const handleMoveToTrash = useCallback(async () => {
		const fileName = normalizedPath.split('/').pop() || 'file';
		const confirmed = window.confirm(`Move "${fileName}" to Trash?`);
		if (!confirmed) return;

		try {
			await moveToTrash(normalizedPath);
			// Close this file's window (try both original and normalized)
			const win = getWindowByPath(filePath) || getWindowByPath(normalizedPath);
			if (win) closeWindow(win.id);
			window.dispatchEvent(new CustomEvent('trash-updated'));
			window.dispatchEvent(new CustomEvent('refresh-desktop'));
			toast.success('Moved to Trash');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
		}
	}, [filePath, normalizedPath, getWindowByPath, closeWindow]);

	if (segments.length === 0) return null;

	return (
		<div
			className={`
				flex items-center justify-between gap-2
				h-8 px-3 py-1.5
				bg-[var(--surface-base)]
				border-b border-[var(--border-subtle)]
				${className}
			`}
		>
			{/* Breadcrumbs */}
			<div className="flex items-center gap-1 min-w-0 flex-1">
				{segments.map((segment, index) => {
					const isLast = index === segments.length - 1;
					const Icon = segment.isDirectory
						? () => (
								<svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 flex-shrink-0 ${getFolderColor(segment)}`} fill="currentColor">
									<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
								</svg>
						  )
						: fileIcon
						? () => <fileIcon.icon className={`w-3.5 h-3.5 flex-shrink-0 ${fileIcon.colorClass}`} />
						: null;

					return (
						<div key={segment.path || 'root'} className="flex items-center gap-1 min-w-0">
							{segment.isDirectory ? (
								<div className="relative group/crumb">
									<button
										onClick={() => handleBreadcrumbClick(segment)}
										className="
											flex items-center gap-1.5 px-1.5 py-0.5 rounded
											hover:bg-[var(--surface-hover)]
											transition-colors duration-150
											min-w-0
										"
									>
										{Icon && <Icon />}
										<span
											className={`
												text-[11px] font-medium truncate
												${isLast ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
											`}
										>
											{segment.name}
										</span>
									</button>
									<div className="
										absolute top-full left-1/2 -translate-x-1/2 mt-1.5
										px-2.5 py-1 rounded-md
										bg-[var(--surface-raised)] border border-[var(--border-default)]
										text-[10px] font-medium text-[var(--text-primary)]
										whitespace-nowrap
										opacity-0 group-hover/crumb:opacity-100
										pointer-events-none
										transition-opacity duration-150 delay-300
										shadow-lg z-50
									">
										Open in Finder
									</div>
								</div>
							) : (
								<div className="flex items-center gap-1.5 px-1.5 py-0.5 min-w-0">
									{Icon && <Icon />}
									<span className="text-[11px] text-[var(--text-secondary)] truncate">
										{segment.name}
									</span>
								</div>
							)}

							{!isLast && (
								<ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0" />
							)}
						</div>
					);
				})}
			</div>

			{/* File action toolbar */}
			<div className="flex items-center gap-0.5 flex-shrink-0">
				{/* Claude actions */}
				<ToolbarButton onClick={handleAttachToChat} tooltip="Attach to Chat">
					<MessageSquarePlus className="w-3.5 h-3.5" />
				</ToolbarButton>
				<ToolbarButton onClick={handleCopyPath} tooltip="Copy Path">
					<ClipboardCopy className="w-3.5 h-3.5" />
				</ToolbarButton>

				<ToolbarSeparator />

				{/* Navigation */}
				<ToolbarButton onClick={handleMoveTo} tooltip="Move to...">
					<FolderInput className="w-3.5 h-3.5" />
				</ToolbarButton>
				<ToolbarButton onClick={handleShowInFinder} tooltip="Show in Finder">
					<ExternalLink className="w-3.5 h-3.5" />
				</ToolbarButton>

				<ToolbarSeparator />

				{/* Modification */}
				<ToolbarButton onClick={handleRename} tooltip="Rename">
					<Pencil className="w-3.5 h-3.5" />
				</ToolbarButton>
				<ToolbarButton onClick={handleMoveToTrash} tooltip="Move to Trash" destructive>
					<Trash2 className="w-3.5 h-3.5" />
				</ToolbarButton>
			</div>
		</div>
	);
}
