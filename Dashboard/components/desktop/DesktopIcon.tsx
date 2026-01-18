'use client';

import { finderRename } from '@/lib/api';
import { CLAUDE_SYSTEM_FILES } from '@/lib/systemFiles';
import { getFolderCategory, getFolderColorClass } from '@/lib/folderCategories';
import { FileTreeNode } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { getFileIconSpec } from '@/lib/fileTypes';
import {
	Folder,
	FolderOpen,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// Icon types determine visual treatment
type IconType = 'folder' | 'file';

// Claude logo SVG for the badge
function ClaudeBadge() {
	return (
		<div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-[#1e1e1e]">
			<svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
				<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
			</svg>
		</div>
	);
}


interface DesktopIconProps {
	node: FileTreeNode;
	isSelected: boolean;
	onSelect: (e: React.MouseEvent) => void;
	onOpen: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
}

export function DesktopIcon({
	node,
	isSelected,
	onSelect,
	onOpen,
	onContextMenu,
}: DesktopIconProps) {
	const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
		id: node.path,
		data: { node },
	});

	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: node.path,
	});

	const { renamingPath, stopRename } = useWindowStore();
	const isRenaming = renamingPath === node.path;
	const inputRef = useRef<HTMLInputElement>(null);
	const [editName, setEditName] = useState(node.name);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Merge drag and drop refs
	const setNodeRef = useCallback((node: HTMLElement | null) => {
		setDragRef(node);
		setDropRef(node);
	}, [setDragRef, setDropRef]);

	// Focus input when entering rename mode
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			setEditName(node.name);
			inputRef.current.focus();
			// Select name without extension
			const dotIndex = node.name.lastIndexOf('.');
			if (dotIndex > 0) {
				inputRef.current.setSelectionRange(0, dotIndex);
			} else {
				inputRef.current.select();
			}
		}
	}, [isRenaming, node.name]);

	const handleRenameSubmit = useCallback(async () => {
		const trimmed = editName.trim();
		if (!trimmed || trimmed === node.name || isSubmitting) {
			stopRename();
			return;
		}

		setIsSubmitting(true);
		try {
			await finderRename(node.path, trimmed);
			// File system watcher will refresh the tree
		} catch (err) {
			console.error('Rename error:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to rename');
			setEditName(node.name); // Reset on error
		} finally {
			setIsSubmitting(false);
			stopRename();
		}
	}, [editName, node.path, node.name, stopRename, isSubmitting]);

	const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRenameSubmit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setEditName(node.name);
			stopRename();
		}
	}, [handleRenameSubmit, node.name, stopRename]);

	// Determine semantic category for coloring
	// Use isSystem from API if available, fallback to hardcoded check for backwards compatibility
	const category = node.type === 'directory' ? getFolderCategory(node) : 'regular';
	const isClaudeSystem = node.isSystem ?? (category === 'claude-system' || CLAUDE_SYSTEM_FILES.has(node.name));

	// Get icon config with proper defaults
	const fileIconSpec = getFileIconSpec(node.name, { isSystemFile: isClaudeSystem });
	const config = node.type === 'directory'
		? { icon: Folder, type: 'folder' as IconType, iconColor: getFolderColorClass(node) }
		: { icon: fileIconSpec.icon, type: 'file' as IconType, iconColor: fileIconSpec.colorClass };

	const Icon = config.icon;

	// Format display name
	const displayName = node.name
		.replace(/_/g, ' ')
		.replace(/-/g, ' ');

	const capitalizedName = node.type === 'directory'
		? displayName
			.split(' ')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ')
		: displayName;

	const style: React.CSSProperties = {
		transform: transform
			? `translate3d(${transform.x}px, ${transform.y}px, 0)`
			: undefined,
		zIndex: isDragging ? 1000 : 1,
		visibility: isDragging ? 'hidden' : 'visible',
		willChange: isDragging ? 'transform' : 'auto',
	};

	// Unified icon rendering
	const renderIconVisual = () => {
		// Folders and files use category color
		const iconSize = 'w-14 h-14';
		const iconColor = config.iconColor;

		return (
			<div className="relative">
				<div className="w-16 h-16 flex items-center justify-center">
					{config.type === 'folder' ? (
						<FolderOpen className={`${iconSize} ${iconColor} drop-shadow-lg`} fill="currentColor" fillOpacity={0.15} />
					) : (
						<Icon className={`${iconSize} ${iconColor} drop-shadow-lg`} />
					)}
				</div>
				{isClaudeSystem && <ClaudeBadge />}
			</div>
		);
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`
        flex flex-col items-center justify-start gap-1
        w-[96px] h-[112px] pt-2 pb-1 px-1 rounded-lg cursor-pointer
        ${!isDragging && 'transition-colors duration-150'}
		${isSelected
					? 'bg-[#DA7756]/30 ring-1 ring-[#DA7756]'
					: isOver && !isDragging
					? 'bg-[#DA7756]/20 ring-2 ring-[#DA7756]/50 ring-dashed'
					: 'hover:bg-gray-200/30 dark:hover:bg-white/5'
				}
      `}
			onClick={onSelect}
			onDoubleClick={(e) => {
				e.stopPropagation();
				onOpen();
			}}
			onContextMenu={onContextMenu}
			{...listeners}
			{...attributes}
		>
			{/* Icon */}
			{renderIconVisual()}

			{/* Label or Rename Input */}
			{isRenaming ? (
				<input
					ref={inputRef}
					type="text"
					value={editName}
					onChange={(e) => setEditName(e.target.value)}
					onKeyDown={handleRenameKeyDown}
					onBlur={handleRenameSubmit}
					onClick={(e) => e.stopPropagation()}
					onDoubleClick={(e) => e.stopPropagation()}
					disabled={isSubmitting}
					className={`
            px-1 py-0.5 text-[11px] text-center leading-tight
            w-full
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            border border-[#DA7756] rounded
            outline-none focus:ring-1 focus:ring-[#DA7756]
            ${isSubmitting ? 'opacity-50' : ''}
          `}
				/>
			) : (
				<span
				className="text-[11px] text-center leading-snug w-full px-1 break-words line-clamp-2 text-black font-medium"
			>
				{capitalizedName}
			</span>
			)}
		</div>
	);
}

export default DesktopIcon;
