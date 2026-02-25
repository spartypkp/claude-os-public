'use client';

/**
 * File Mention Menu
 *
 * Dropdown that appears when user types '@' in the chat input.
 * Shows files/folders from the Desktop tree, filtered by query.
 * Rendered via portal to avoid overflow clipping from chat container.
 */

import { getFileIconSpec } from '@/lib/fileTypes';
import { Folder } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { FlatFileEntry, MentionMenuProps } from './hooks/useFileMention';

// =============================================================================
// MENU ITEM
// =============================================================================

function MentionItem({
	item,
	isSelected,
	onSelect,
	onHover,
}: {
	item: FlatFileEntry;
	isSelected: boolean;
	onSelect: () => void;
	onHover: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	// Scroll selected item into view
	useEffect(() => {
		if (isSelected && ref.current) {
			ref.current.scrollIntoView({ block: 'nearest' });
		}
	}, [isSelected]);

	const isDir = item.type === 'directory';
	let Icon: React.ComponentType<{ className?: string }>;
	let colorClass: string;

	if (isDir) {
		Icon = Folder;
		colorClass = 'text-blue-400';
	} else {
		const spec = getFileIconSpec(item.name);
		Icon = spec.icon;
		colorClass = spec.colorClass;
	}

	// Show parent path for context (Desktop-relative, minus the filename)
	const parentPath = item.segments.length > 2
		? item.segments.slice(1, -1).join('/')
		: null;

	return (
		<div
			ref={ref}
			onMouseDown={(e) => {
				e.preventDefault(); // Don't blur textarea
				onSelect();
			}}
			onMouseEnter={onHover}
			className={`
				flex items-center gap-2 px-2.5 py-1.5 cursor-pointer
				transition-colors duration-75
				${isSelected
					? 'bg-[var(--color-claude)]/15 text-[var(--text-primary)]'
					: 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
				}
			`}
		>
			<Icon className={`w-3.5 h-3.5 flex-shrink-0 ${colorClass}`} />
			<span className="text-[12px] font-medium truncate">{item.name}</span>
			{parentPath && (
				<span className="text-[10px] text-[var(--text-muted)] truncate ml-auto flex-shrink-0 max-w-[120px]">
					{parentPath}
				</span>
			)}
		</div>
	);
}

// =============================================================================
// MENU
// =============================================================================

export function FileMentionMenu({
	items,
	selectedIndex,
	position,
	onSelect,
	onHover,
}: MentionMenuProps) {
	if (!position || items.length === 0) return null;

	const menu = (
		<div
			data-file-mention-menu
			className="fixed z-[9999] w-[280px] max-h-[240px] overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] shadow-lg backdrop-blur-sm"
			style={{
				// Position above the cursor
				bottom: `calc(100vh - ${position.top}px + 4px)`,
				left: Math.min(position.left, window.innerWidth - 300),
			}}
		>
			{/* Header */}
			<div className="px-2.5 py-1.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
				<span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
					Attach file
				</span>
				<span className="text-[9px] text-[var(--text-muted)]">
					<kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-muted)]">↑↓</kbd>
					{' '}navigate{' '}
					<kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-muted)]">↵</kbd>
					{' '}select
				</span>
			</div>

			{/* Items */}
			<div className="py-0.5">
				{items.map((item, i) => (
					<MentionItem
						key={item.path}
						item={item}
						isSelected={i === selectedIndex}
						onSelect={() => onSelect(item)}
						onHover={() => onHover(i)}
					/>
				))}
			</div>
		</div>
	);

	return createPortal(menu, document.body);
}
