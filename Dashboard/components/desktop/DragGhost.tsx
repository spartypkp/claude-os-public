'use client';

/**
 * DragGhost - Hidden element used as the native HTML5 drag image.
 *
 * Mounted off-screen, updated via custom events when a drag starts.
 * setDragImage() in DesktopIcon points to this element's DOM node.
 */

import { getFileIconSpec } from '@/lib/fileTypes';
import { getFolderCategory, getFolderColorClass } from '@/lib/folderCategories';
import { CLAUDE_SYSTEM_FILES } from '@/lib/systemFiles';
import { FileTreeNode } from '@/lib/types';
import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface DragGhostProps {
	files: FileTreeNode[];
}

interface DragInfo {
	paths: string[];
	primaryNode: FileTreeNode;
}

export function DragGhost({ files }: DragGhostProps) {
	const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

	// Listen for drag-ghost-update events from DesktopIcon
	const handleUpdate = useCallback((e: Event) => {
		const detail = (e as CustomEvent).detail;
		if (detail?.paths && detail?.primaryNode) {
			setDragInfo({ paths: detail.paths, primaryNode: detail.primaryNode });
		}
	}, []);

	useEffect(() => {
		window.addEventListener('drag-ghost-update', handleUpdate);
		return () => window.removeEventListener('drag-ghost-update', handleUpdate);
	}, [handleUpdate]);

	if (!dragInfo) {
		// Render a minimal placeholder so the element exists for setDragImage
		return (
			<div id="drag-ghost" style={{ position: 'fixed', top: -300, left: -300, pointerEvents: 'none', zIndex: -1 }}>
				<div style={{ width: 96, height: 96 }} />
			</div>
		);
	}

	const { paths, primaryNode } = dragInfo;
	const count = paths.length;
	const node = primaryNode;

	// Determine icon styling (simplified version of DesktopIcon logic)
	const isFolder = node.type === 'directory';
	const category = isFolder ? getFolderCategory(node) : 'regular';
	const isClaudeSystem = node.isSystem ?? (category === 'claude-system' || CLAUDE_SYSTEM_FILES.has(node.name));
	const fileIconSpec = getFileIconSpec(node.name, { isSystemFile: isClaudeSystem });
	const iconColor = isFolder ? getFolderColorClass(node) : fileIconSpec.colorClass;
	const Icon = isFolder ? FolderOpen : fileIconSpec.icon;

	const displayName = node.name
		.replace(/\.[^.]+$/, '')
		.replace(/[-_]/g, ' ');

	return (
		<div
			id="drag-ghost"
			style={{
				position: 'fixed',
				top: -300,
				left: -300,
				pointerEvents: 'none',
				zIndex: -1,
			}}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					width: 96,
					padding: '8px 4px',
					borderRadius: 8,
					background: 'rgba(218, 119, 86, 0.25)',
					border: '1px solid rgba(218, 119, 86, 0.6)',
					boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
				}}
			>
				{/* Icon with count badge */}
				<div style={{ position: 'relative', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
					{isFolder ? (
						<FolderOpen
							className={iconColor}
							style={{ width: 40, height: 40 }}
							fill="currentColor"
							fillOpacity={0.15}
						/>
					) : (
						<Icon
							className={iconColor}
							style={{ width: 40, height: 40 }}
						/>
					)}
					{count > 1 && (
						<div
							style={{
								position: 'absolute',
								top: -6,
								right: -8,
								width: 22,
								height: 22,
								borderRadius: '50%',
								background: 'var(--color-claude)',
								color: 'white',
								fontSize: 11,
								fontWeight: 700,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
							}}
						>
							{count}
						</div>
					)}
				</div>

				{/* Label */}
				<div
					style={{
						marginTop: 4,
						fontSize: 11,
						fontWeight: 500,
						textAlign: 'center',
						color: 'var(--text-primary)',
						maxWidth: 88,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{count === 1 ? displayName : `${count} items`}
				</div>
			</div>
		</div>
	);
}
