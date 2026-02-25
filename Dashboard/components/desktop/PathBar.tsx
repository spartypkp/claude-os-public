'use client';

import { moveToTrash } from '@/lib/api';
import { getFolderColorClass } from '@/lib/folderCategories';
import { getFileIconSpec } from '@/lib/fileTypes';
import { showInFinder } from '@/lib/fileNavigation';
import { toDesktopRelative, toAbsoluteDesktopPath } from '@/lib/pathUtils';
import { FileTreeNode } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import {
	ChevronRight,
	ClipboardCopy,
	Edit3,
	Ellipsis,
	ExternalLink,
	Eye,
	FolderInput,
	Loader2,
	MessageSquarePlus,
	MoreHorizontal,
	Pencil,
	Trash2,
	WrapText,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useEditorContext } from './editors/EditorContext';

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

// --- Shared UI primitives ---

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
	return (
		<div className="relative group/tip">
			{children}
			<div className="
				absolute top-full left-1/2 -translate-x-1/2 mt-1
				px-2 py-0.5 rounded
				bg-[var(--surface-raised)] border border-[var(--border-default)]
				text-[10px] font-medium text-[var(--text-primary)]
				whitespace-nowrap
				opacity-0 group-hover/tip:opacity-100
				pointer-events-none
				transition-opacity duration-100 delay-500
				shadow-md z-50
			">
				{text}
			</div>
		</div>
	);
}

function ToolbarButton({ onClick, tooltip, children, active, destructive }: {
	onClick: () => void;
	tooltip: string;
	children: React.ReactNode;
	active?: boolean;
	destructive?: boolean;
}) {
	return (
		<Tooltip text={tooltip}>
			<button
				onClick={onClick}
				className={`
					flex items-center justify-center w-6 h-5 rounded
					transition-all duration-150
					${active
						? 'text-[var(--color-claude)] bg-[var(--color-claude)]/10'
						: destructive
							? 'text-[var(--text-quaternary)] hover:text-red-500 hover:bg-red-500/10'
							: 'text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
					}
				`}
			>
				{children}
			</button>
		</Tooltip>
	);
}

// --- Dropdown menus ---

function ActionsMenu({ actions }: { actions: { label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }[] }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<ToolbarButton onClick={() => setOpen(!open)} tooltip="Actions">
				<MoreHorizontal className="w-3.5 h-3.5" />
			</ToolbarButton>
			{open && (
				<div className="
					absolute top-full right-0 mt-1 py-1 min-w-[160px]
					bg-[var(--surface-raised)] border border-[var(--border-default)]
					rounded-lg shadow-xl z-50
					animate-in fade-in slide-in-from-top-1 duration-100
				">
					{actions.map((action, i) => (
						<button
							key={i}
							onClick={() => { action.onClick(); setOpen(false); }}
							className={`
								flex items-center gap-2.5 w-full px-3 py-1.5 text-left
								text-[11px] font-medium
								transition-colors duration-100
								${action.destructive
									? 'text-red-500 hover:bg-red-500/10'
									: 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
								}
							`}
						>
							<span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">{action.icon}</span>
							{action.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function CollapsedSegments({ segments, onNavigate }: {
	segments: PathSegment[];
	onNavigate: (segment: PathSegment) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [open]);

	return (
		<div ref={ref} className="relative flex items-center">
			<button
				onClick={() => setOpen(!open)}
				className="
					flex items-center justify-center w-5 h-5 rounded
					text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]
					hover:bg-[var(--surface-hover)]
					transition-colors duration-150
				"
			>
				<Ellipsis className="w-3.5 h-3.5" />
			</button>
			<ChevronRight className="w-2.5 h-2.5 text-[var(--text-quaternary)] flex-shrink-0 mx-0.5" />
			{open && (
				<div className="
					absolute top-full left-0 mt-1 py-1 min-w-[140px]
					bg-[var(--surface-raised)] border border-[var(--border-default)]
					rounded-lg shadow-xl z-50
					animate-in fade-in slide-in-from-top-1 duration-100
				">
					{segments.map((seg) => (
						<button
							key={seg.path}
							onClick={() => { onNavigate(seg); setOpen(false); }}
							className="
								flex items-center gap-2 w-full px-3 py-1.5 text-left
								text-[11px] font-medium text-[var(--text-secondary)]
								hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]
								transition-colors duration-100
							"
						>
							<svg viewBox="0 0 24 24" className={`w-3 h-3 flex-shrink-0 ${getFolderColorClass({ name: seg.name, path: seg.path, type: 'directory' } as FileTreeNode)}`} fill="currentColor">
								<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
							</svg>
							{seg.name}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// --- Editor-specific toolbar sections ---

function SegmentedViewEdit({ isEditing, setIsEditing, isReadOnly, isLargeFile }: {
	isEditing: boolean;
	setIsEditing: (v: boolean) => void;
	isReadOnly: boolean;
	isLargeFile: boolean;
}) {
	return (
		<div className="flex items-center rounded overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
			<Tooltip text="View">
				<button
					onClick={() => setIsEditing(false)}
					className={`
						flex items-center justify-center w-6 h-5
						transition-all duration-150
						${!isEditing
							? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
							: 'text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
						}
					`}
				>
					<Eye className="w-3 h-3" />
				</button>
			</Tooltip>
			{!isReadOnly && !isLargeFile && (
				<Tooltip text="Edit">
					<button
						onClick={() => setIsEditing(true)}
						className={`
							flex items-center justify-center w-6 h-5
							transition-all duration-150
							${isEditing
								? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
								: 'text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
							}
						`}
					>
						<Edit3 className="w-3 h-3" />
					</button>
				</Tooltip>
			)}
		</div>
	);
}

function SaveIndicator({ isSaving, hasChanges, hasConflict }: {
	isSaving: boolean;
	hasChanges: boolean;
	hasConflict: boolean;
}) {
	if (isSaving) return <Loader2 className="w-2.5 h-2.5 animate-spin text-[var(--text-quaternary)]" />;
	if (hasConflict) return (
		<div className="w-[5px] h-[5px] rounded-full bg-[var(--color-error)]" title="Conflict" />
	);
	if (hasChanges) return (
		<div className="w-[5px] h-[5px] rounded-full bg-[var(--color-warning)]" title="Unsaved changes" />
	);
	return null;
}

/** Markdown: [View | Edit] + save dot */
function MarkdownControls({ editor }: { editor: NonNullable<ReturnType<typeof useEditorContext>> }) {
	return (
		<>
			<SegmentedViewEdit
				isEditing={editor.isEditing}
				setIsEditing={editor.setIsEditing}
				isReadOnly={editor.isReadOnly}
				isLargeFile={editor.isLargeFile}
			/>
			{!editor.isReadOnly && (
				<div className="flex items-center w-3 justify-center ml-1">
					<SaveIndicator isSaving={editor.isSaving} hasChanges={editor.hasChanges} hasConflict={editor.hasConflict} />
				</div>
			)}
		</>
	);
}

/** Code: LANG badge + [View | Edit] + save dot */
function CodeControls({ editor }: { editor: NonNullable<ReturnType<typeof useEditorContext>> }) {
	return (
		<>
			{editor.language && (
				<span className="px-1.5 py-px text-[9px] uppercase tracking-wider rounded font-medium text-[var(--text-quaternary)] mr-1">
					{editor.language}
				</span>
			)}
			<SegmentedViewEdit
				isEditing={editor.isEditing}
				setIsEditing={editor.setIsEditing}
				isReadOnly={editor.isReadOnly}
				isLargeFile={editor.isLargeFile}
			/>
			{!editor.isReadOnly && (
				<div className="flex items-center w-3 justify-center ml-1">
					<SaveIndicator isSaving={editor.isSaving} hasChanges={editor.hasChanges} hasConflict={editor.hasConflict} />
				</div>
			)}
		</>
	);
}

/** Plain text: [Wrap] + save dot */
function PlainTextControls({ editor }: { editor: NonNullable<ReturnType<typeof useEditorContext>> }) {
	return (
		<>
			<ToolbarButton
				onClick={() => editor.setWordWrap(!editor.wordWrap)}
				tooltip={editor.wordWrap ? 'Word wrap on' : 'Word wrap off'}
				active={editor.wordWrap}
			>
				<WrapText className="w-3 h-3" />
			</ToolbarButton>
			{!editor.isReadOnly && (
				<div className="flex items-center w-3 justify-center ml-0.5">
					<SaveIndicator isSaving={editor.isSaving} hasChanges={editor.hasChanges} hasConflict={editor.hasConflict} />
				</div>
			)}
		</>
	);
}

/** Read-only badge */
function ReadOnlyBadge() {
	return (
		<span className="px-1.5 py-px rounded text-[9px] font-medium text-[var(--text-quaternary)] bg-[var(--surface-sunken)]">
			Read-only
		</span>
	);
}

// --- Main PathBar ---

/**
 * macOS-inspired path bar with breadcrumbs, type-aware editor controls, and Claude OS actions.
 * Three zones: breadcrumbs (left), editor controls (center-right), Claude OS zone (far right).
 * Collapses middle segments for deep paths. Fixed bar geometry, different content per type.
 */
export function PathBar({ filePath, className = '' }: PathBarProps) {
	const { openAppWindow, startRename, closeWindow, getWindowByPath } = useWindowStore();
	const editor = useEditorContext();

	// Desktop-relative path (e.g., "conversations/chief/spec.md")
	const relativePath = useMemo(() => toDesktopRelative(filePath), [filePath]);

	// Parse segments from Desktop-relative path
	const segments = useMemo((): PathSegment[] => {
		const result: PathSegment[] = [];
		result.push({ name: 'Desktop', path: '', isDirectory: true, isRoot: true });

		if (!relativePath) return result;

		const parts = relativePath.split('/').filter(Boolean);
		for (let i = 0; i < parts.length; i++) {
			const isLastSegment = i === parts.length - 1;
			const isFile = isLastSegment && parts[i].includes('.');
			result.push({
				name: parts[i],
				path: parts.slice(0, i + 1).join('/'),
				isDirectory: !isFile,
				isRoot: false,
			});
		}
		return result;
	}, [relativePath]);

	// Split into visible vs collapsed for long paths
	const { visible, collapsed } = useMemo(() => {
		if (segments.length <= 3) {
			return { visible: segments, collapsed: [] as PathSegment[] };
		}
		return {
			visible: [segments[0], ...segments.slice(-2)],
			collapsed: segments.slice(1, -2),
		};
	}, [segments]);

	const getFolderColor = (segment: PathSegment): string => {
		if (!segment.isDirectory) return '';
		const node: FileTreeNode = { name: segment.name, path: segment.path, type: 'directory' };
		return getFolderColorClass(node);
	};

	const fileIcon = useMemo(() => {
		const lastSegment = segments[segments.length - 1];
		if (!lastSegment || lastSegment.isDirectory) return null;
		return getFileIconSpec(lastSegment.name);
	}, [segments]);

	// === Actions ===
	const handleBreadcrumbClick = (segment: PathSegment) => {
		if (segment.isDirectory) openAppWindow('finder', segment.path);
	};

	// Canonical Desktop-prefixed path for events and API calls
	const desktopPath = useMemo(() => relativePath ? `Desktop/${relativePath}` : 'Desktop', [relativePath]);

	const handleAttachToChat = useCallback(() => {
		window.dispatchEvent(new CustomEvent('attach-to-chat', { detail: { path: filePath } }));
		toast.success('Attached to chat');
	}, [filePath]);

	const handleCopyPath = useCallback(() => {
		navigator.clipboard.writeText(desktopPath);
		toast.success('Path copied');
	}, [desktopPath]);

	const handleMoveTo = useCallback(() => {
		const fileName = relativePath.split('/').pop() || 'item';
		window.dispatchEvent(new CustomEvent('open-move-to', { detail: { path: desktopPath, name: fileName } }));
	}, [desktopPath, relativePath]);

	const handleShowInFinder = useCallback(() => {
		showInFinder(desktopPath, { openAppWindow });
	}, [desktopPath, openAppWindow]);

	const handleRename = useCallback(() => {
		startRename(filePath);
	}, [filePath, startRename]);

	const handleMoveToTrash = useCallback(async () => {
		const fileName = relativePath.split('/').pop() || 'file';
		const confirmed = window.confirm(`Move "${fileName}" to Trash?`);
		if (!confirmed) return;
		try {
			await moveToTrash(desktopPath);
			const win = getWindowByPath(filePath) || getWindowByPath(desktopPath);
			if (win) closeWindow(win.id);
			window.dispatchEvent(new CustomEvent('trash-updated'));
			window.dispatchEvent(new CustomEvent('refresh-desktop'));
			toast.success('Moved to Trash');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
		}
	}, [filePath, desktopPath, relativePath, getWindowByPath, closeWindow]);

	const overflowActions = useMemo(() => [
		{ label: 'Copy Path', icon: <ClipboardCopy className="w-3.5 h-3.5" />, onClick: handleCopyPath },
		{ label: 'Move to...', icon: <FolderInput className="w-3.5 h-3.5" />, onClick: handleMoveTo },
		{ label: 'Show in Finder', icon: <ExternalLink className="w-3.5 h-3.5" />, onClick: handleShowInFinder },
		{ label: 'Rename', icon: <Pencil className="w-3.5 h-3.5" />, onClick: handleRename },
		{ label: 'Move to Trash', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleMoveToTrash, destructive: true },
	], [handleCopyPath, handleMoveTo, handleShowInFinder, handleRename, handleMoveToTrash]);

	if (segments.length === 0) return null;

	// Render a breadcrumb segment
	const renderSegment = (segment: PathSegment, isLast: boolean) => {
		const Icon = segment.isDirectory
			? () => (
				<svg viewBox="0 0 24 24" className={`w-3 h-3 flex-shrink-0 ${getFolderColor(segment)}`} fill="currentColor">
					<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
				</svg>
			)
			: fileIcon
				? () => <fileIcon.icon className={`w-3 h-3 flex-shrink-0 ${fileIcon.colorClass}`} />
				: null;

		return (
			<div key={segment.path || 'root'} className="flex items-center min-w-0">
				{segment.isDirectory ? (
					<button
						onClick={() => handleBreadcrumbClick(segment)}
						className="
							flex items-center gap-1 px-1.5 py-0.5 rounded
							hover:bg-[var(--surface-hover)]
							transition-colors duration-150
							min-w-0
						"
					>
						{Icon && <Icon />}
						<span className={`
							text-[11px] truncate
							${isLast ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-tertiary)]'}
						`}>
							{segment.name}
						</span>
					</button>
				) : (
					<div className="flex items-center gap-1 px-1.5 py-0.5 min-w-0">
						{Icon && <Icon />}
						<span className="text-[11px] text-[var(--text-primary)] font-medium truncate">
							{segment.name}
						</span>
					</div>
				)}
				{!isLast && (
					<ChevronRight className="w-2.5 h-2.5 text-[var(--text-quaternary)] flex-shrink-0 mx-0.5" />
				)}
			</div>
		);
	};

	// Render editor-specific controls based on editorType
	const renderEditorControls = () => {
		if (!editor) return null;

		// Read-only files get a badge regardless of type
		if (editor.isReadOnly) return <ReadOnlyBadge />;

		switch (editor.editorType) {
			case 'markdown':
				return <MarkdownControls editor={editor} />;
			case 'code':
				return <CodeControls editor={editor} />;
			case 'plaintext':
				return <PlainTextControls editor={editor} />;
			default:
				return null;
		}
	};

	return (
		<div
			className={`
				flex items-center justify-between gap-1
				h-7 px-2
				bg-[var(--surface-base)]
				border-b border-[var(--border-subtle)]
				${className}
			`}
		>
			{/* Zone 1: Breadcrumbs */}
			<div className="flex items-center min-w-0 flex-1 overflow-hidden">
				{visible.map((segment, index) => {
					const isLast = index === visible.length - 1;
					if (index === 1 && collapsed.length > 0) {
						return (
							<div key={segment.path || 'with-collapsed'} className="flex items-center min-w-0">
								<CollapsedSegments segments={collapsed} onNavigate={handleBreadcrumbClick} />
								{renderSegment(segment, isLast)}
							</div>
						);
					}
					return renderSegment(segment, isLast);
				})}
			</div>

			{/* Zone 2 + 3: Editor controls + Claude OS zone */}
			<div className="flex items-center gap-1 flex-shrink-0">
				{/* Zone 2: Editor-specific controls */}
				{renderEditorControls()}

				{/* Separator between editor controls and Claude OS zone */}
				{editor?.editorType && !editor.isReadOnly && (
					<div className="w-px h-3.5 bg-[var(--border-subtle)] mx-0.5" />
				)}

				{/* Zone 3: Claude OS actions — always present */}
				<ToolbarButton onClick={handleAttachToChat} tooltip="Attach to Chat" active>
					<MessageSquarePlus className="w-3 h-3" />
				</ToolbarButton>
				<ActionsMenu actions={overflowActions} />
			</div>
		</div>
	);
}
