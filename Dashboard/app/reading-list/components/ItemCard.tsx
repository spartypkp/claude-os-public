/**
 * ItemCard - Individual reading list item card.
 *
 * Shows title, author, type badge, status indicator, rating, and tags.
 * Expandable to show notes and action buttons.
 */

'use client';

import { useState } from 'react';
import {
	BookOpen,
	FileText,
	GraduationCap,
	File,
	Star,
	ChevronDown,
	ChevronUp,
	Trash2,
} from 'lucide-react';
import type { ReadingItem } from '../page';

// Status colors
const STATUS_COLORS: Record<ReadingItem['status'], string> = {
	'want-to-read': 'bg-blue-500',
	'reading': 'bg-emerald-500',
	'finished': 'bg-amber-500',
	'abandoned': 'bg-[#555]',
};

const STATUS_LABELS: Record<ReadingItem['status'], string> = {
	'want-to-read': 'Want to Read',
	'reading': 'Reading',
	'finished': 'Finished',
	'abandoned': 'Abandoned',
};

// Type icons
const TYPE_ICONS: Record<ReadingItem['type'], typeof BookOpen> = {
	book: BookOpen,
	article: FileText,
	paper: GraduationCap,
	other: File,
};

interface ItemCardProps {
	item: ReadingItem;
	onUpdate: (id: string, updates: Partial<ReadingItem>) => void;
	onRemove: (id: string) => void;
}

export function ItemCard({ item, onUpdate, onRemove }: ItemCardProps) {
	const [expanded, setExpanded] = useState(false);
	const TypeIcon = TYPE_ICONS[item.type];

	// Quick status change options (show statuses other than current)
	const nextStatuses = (['want-to-read', 'reading', 'finished', 'abandoned'] as const)
		.filter((s) => s !== item.status);

	return (
		<div
			className="rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04]
				transition-colors cursor-pointer"
			onClick={() => setExpanded(!expanded)}
		>
			<div className="p-3">
				{/* Top row: status dot + type icon + title */}
				<div className="flex items-start gap-2">
					<div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_COLORS[item.status]}`} />
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5">
							<TypeIcon className="w-3.5 h-3.5 text-[#666] shrink-0" />
							<h3 className="text-sm font-medium text-white truncate">{item.title}</h3>
						</div>
						{item.author && (
							<p className="text-xs text-[#888] mt-0.5 truncate">by {item.author}</p>
						)}
					</div>
					<div className="shrink-0">
						{expanded ? (
							<ChevronUp className="w-3.5 h-3.5 text-[#555]" />
						) : (
							<ChevronDown className="w-3.5 h-3.5 text-[#555]" />
						)}
					</div>
				</div>

				{/* Rating stars (for finished items) */}
				{item.rating && (
					<div className="flex items-center gap-0.5 mt-2 ml-4">
						{[1, 2, 3, 4, 5].map((star) => (
							<Star
								key={star}
								className={`w-3 h-3 ${
									star <= item.rating!
										? 'text-amber-400 fill-amber-400'
										: 'text-[#333]'
								}`}
							/>
						))}
					</div>
				)}

				{/* Tags */}
				{item.tags.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-2 ml-4">
						{item.tags.map((tag) => (
							<span
								key={tag}
								className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-[#888]"
							>
								{tag}
							</span>
						))}
					</div>
				)}

				{/* Status label */}
				<div className="flex items-center gap-2 mt-2 ml-4">
					<span className="text-[10px] text-[#666]">{STATUS_LABELS[item.status]}</span>
					{item.type !== 'book' && (
						<span className="text-[10px] text-[#555]">{item.type}</span>
					)}
				</div>
			</div>

			{/* Expanded section */}
			{expanded && (
				<div
					className="border-t border-white/5 p-3 space-y-3"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Notes */}
					{item.notes && (
						<p className="text-xs text-[#888] leading-relaxed">{item.notes}</p>
					)}

					{/* Dates */}
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#555]">
						<span>Added {new Date(item.added_date).toLocaleDateString()}</span>
						{item.started_date && (
							<span>Started {new Date(item.started_date).toLocaleDateString()}</span>
						)}
						{item.finished_date && (
							<span>Finished {new Date(item.finished_date).toLocaleDateString()}</span>
						)}
					</div>

					{/* Quick status change buttons */}
					<div className="flex items-center gap-2 flex-wrap">
						{nextStatuses.map((status) => (
							<button
								key={status}
								onClick={() => onUpdate(item.id, { status })}
								className="px-2 py-1 rounded text-[10px] bg-white/5 text-[#888]
									hover:bg-white/10 hover:text-white transition-colors"
							>
								{STATUS_LABELS[status]}
							</button>
						))}

						{/* Rating buttons (for finished items) */}
						{item.status === 'finished' && (
							<div className="flex items-center gap-0.5 ml-auto">
								{[1, 2, 3, 4, 5].map((star) => (
									<button
										key={star}
										onClick={() => onUpdate(item.id, { rating: star })}
										className="p-0.5 hover:scale-125 transition-transform"
									>
										<Star
											className={`w-3.5 h-3.5 ${
												item.rating && star <= item.rating
													? 'text-amber-400 fill-amber-400'
													: 'text-[#444] hover:text-amber-300'
											}`}
										/>
									</button>
								))}
							</div>
						)}

						{/* Remove button */}
						<button
							onClick={() => onRemove(item.id)}
							className="ml-auto p-1 rounded text-[#555] hover:text-red-400
								hover:bg-red-500/10 transition-colors"
							title="Remove"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
