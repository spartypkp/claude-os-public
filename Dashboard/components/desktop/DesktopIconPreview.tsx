'use client';

import { getFileIconSpec } from '@/lib/fileTypes';
import { FileTreeNode } from '@/lib/types';
import {
	FolderOpen,
} from 'lucide-react';

// Lightweight drag preview - no interactions, no transitions
export function DesktopIconPreview({ node }: { node: FileTreeNode; }) {
	const fileIconSpec = getFileIconSpec(node.name);
	const isClaudeSystemFile = ['TODAY.md', 'MEMORY.md', 'LIFE.md', 'IDENTITY.md'].includes(node.name);
	
	// Determine icon
	const isFolder = node.type === 'directory';

	const Icon = isFolder ? FolderOpen : fileIconSpec.icon;
	const iconColor = isClaudeSystemFile ? 'text-[var(--color-claude)]' : (isFolder ? 'text-[var(--color-claude)]' : fileIconSpec.colorClass);
	
	// Format name
	const displayName = node.name
		.replace(/_/g, ' ')
		.replace(/-/g, ' ');
	
	const capitalizedName = node.type === 'directory'
		? displayName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
		: displayName;
	
	return (
		<div
			className="flex flex-col items-center justify-start gap-1 w-[96px] h-[128px] pt-2 pb-1 px-1 rounded-lg bg-[var(--color-claude)]/30 ring-1 ring-[var(--color-claude)] cursor-grabbing"
			style={{ transform: 'scale(1.05)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', opacity: 0.9 }}
		>
			{/* Icon */}
			<div className="w-16 h-16 flex items-center justify-center">
				{isCustomApp ? (
					<div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 shadow-lg shadow-black/30 ring-1 ring-white/20">
						<Icon className="w-8 h-8 text-white drop-shadow-sm" />
					</div>
				) : isFolder ? (
					<FolderOpen className="w-14 h-14 text-[var(--color-claude)] drop-shadow-lg" fill="currentColor" fillOpacity={0.15} />
				) : (
					<Icon className={`w-14 h-14 ${iconColor} drop-shadow-lg`} />
				)}
			</div>
			
			{/* Label */}
			<span
				className="text-[12px] text-center leading-[1.3] w-full px-0.5 break-words line-clamp-3 text-[var(--text-primary)] font-medium"
			>
				{capitalizedName}
			</span>
		</div>
	);
}
