/**
 * ItemCard - Individual reading list item card.
 *
 * Shows title, author, type badge, status indicator, rating, and tags.
 * Left border accent colored by item type. Expandable for notes and actions.
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

// Type-based accent colors (left border + icon tint)
const TYPE_ACCENTS: Record<ReadingItem['type'], { border: string; text: string; bg: string }> = {
	book: { border: 'border-l-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
	article: { border: 'border-l-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10' },
	paper: { border: 'border-l-violet-500', text: 'text-violet-400', bg: 'bg-violet-500/10' },
	other: { border: 'border-l-[#555]', text: 'text-[#888]', bg: 'bg-white/5' },
};

// Status pill styling
const STATUS_STYLES: Record<ReadingItem['status'], { text: string; bg: string }> = {
	'want-to-read': { text: 'text-blue-300', bg: 'bg-blue-500/10' },
	'reading': { text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
	'finished': { text: 'text-amber-300', bg: 'bg-amber-500/10' },
	'abandoned': { text: 'text-[#888]', bg: 'bg-white/5' },
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

const TYPE_LABELS: Record<ReadingItem['type'], string> = {
	book: 'Book',
	article: 'Article',
	paper: 'Paper',
	other: 'Other',
};

interface ItemCardProps {
	item: ReadingItem;
	onUpdate: (id: string, updates: Partial<ReadingItem>) => void;
	onRemove: (id: string) => void;
}

export function ItemCard({ item, onUpdate, onRemove }: ItemCardProps) {
	const [expanded, setExpanded] = useState(false);
	const TypeIcon = TYPE_ICONS[item.type];
	const accent = TYPE_ACCENTS[item.type];
	const statusStyle = STATUS_STYLES[item.status];

	const nextStatuses = (['want-to-read', 'reading', 'finished', 'abandoned'] as const)
		.filter((s) => s !== item.status);

	return (
		<div
			className={`rounded-lg border-l-[3px] ${accent.border} border border-white/5
				bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200 cursor-pointer`}
			onClick={() => setExpanded(!expanded)}
		>
			<div className="p-3.5">
				{/* Header: type badge + title + expand toggle */}
				<div className="flex items-start gap-2.5">
					<div className={`p-1.5 rounded-md ${accent.bg} shrink-0 mt-0.5`}>
						<TypeIcon className={`w-3.5 h-3.5 ${accent.text}`} />
					</div>
					<div className="flex-1 min-w-0">
						<h3 className="text-sm font-medium text-white leading-snug">{item.title}</h3>
						{item.author && (
							<p className="text-xs text-[#888] mt-0.5">{item.author}</p>
						)}
					</div>
					<div className="shrink-0 mt-0.5">
						{expanded ? (
							<ChevronUp className="w-3.5 h-3.5 text-[#555]" />
						) : (
							<ChevronDown className="w-3.5 h-3.5 text-[#555]" />
						)}
					</div>
				</div>

				{/* Meta row: status pill + rating + type label */}
				<div className="flex items-center gap-2 mt-2.5 flex-wrap">
					<span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle.text} ${statusStyle.bg}`}>
						{STATUS_LABELS[item.status]}
					</span>
					{item.type !== 'book' && (
						<span className={`px-1.5 py-0.5 rounded text-[10px] ${accent.text} ${accent.bg}`}>
							{TYPE_LABELS[item.type]}
						</span>
					)}
					{item.rating != null && (
						<div className="flex items-center gap-0.5 ml-auto">
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
				</div>

				{/* Tags */}
				{item.tags.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-2">
						{item.tags.map((tag) => (
							<span
								key={tag}
								className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] text-[#777] border border-white/5"
							>
								{tag}
							</span>
						))}
					</div>
				)}
			</div>

			{/* Expanded section */}
			{expanded && (
				<div
					className="border-t border-white/5 p-3.5 space-y-3"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Notes */}
					{item.notes && (
						<p className="text-xs text-[#999] leading-relaxed italic">
							&ldquo;{item.notes}&rdquo;
						</p>
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
