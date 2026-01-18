'use client';

import { getFileIconSpec } from '@/lib/fileTypes';
import { FileTreeNode } from '@/lib/types';
import { FolderOpen } from 'lucide-react';

// Lightweight drag preview - no interactions, no transitions
export function DesktopIconPreview({ node }: { node: FileTreeNode; }) {
	const fileIconSpec = getFileIconSpec(node.name);
	const isClaudeSystemFile = ['TODAY.md', 'MEMORY.md', 'LIFE.md', 'IDENTITY.md'].includes(node.name);

	// Determine icon
	const isFolder = node.type === 'directory';

	const Icon = isFolder ? FolderOpen : fileIconSpec.icon;
	const iconColor = isClaudeSystemFile ? 'text-[#DA7756]' : (isFolder ? 'text-[#DA7756]' : fileIconSpec.colorClass);
	
	// Format name
	const displayName = node.name
		.replace(/_/g, ' ')
		.replace(/-/g, ' ');
	
	const capitalizedName = node.type === 'directory'
		? displayName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
		: displayName;
	
	return (
		<div className="flex flex-col items-center justify-start gap-1 w-[96px] h-[112px] pt-2 pb-1 px-1 rounded-lg bg-[#DA7756]/30 ring-1 ring-[#DA7756] opacity-90 cursor-grabbing">
			{/* Icon */}
			<div className="w-16 h-16 flex items-center justify-center">
				{isFolder ? (
					<FolderOpen className="w-14 h-14 text-[#DA7756] drop-shadow-lg" fill="currentColor" fillOpacity={0.15} />
				) : (
					<Icon className={`w-14 h-14 ${iconColor} drop-shadow-lg`} />
				)}
			</div>
			
			{/* Label */}
			<span
				className="text-[11px] text-center leading-snug w-full px-1 break-words line-clamp-2 text-black font-medium"
			>
				{capitalizedName}
			</span>
		</div>
	);
}
