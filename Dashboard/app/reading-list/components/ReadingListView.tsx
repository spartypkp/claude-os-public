/**
 * ReadingListView - Grid of reading list items.
 *
 * Displays items in a responsive grid layout with filter-aware empty states.
 */

'use client';

import { BookOpen, BookMarked, CheckCircle2, XCircle, Library } from 'lucide-react';
import type { ReadingItem } from '../page';
import { ItemCard } from './ItemCard';

type StatusFilter = 'all' | 'want-to-read' | 'reading' | 'finished' | 'abandoned';

interface ReadingListViewProps {
	items: ReadingItem[];
	filter?: StatusFilter;
	onUpdate: (id: string, updates: Partial<ReadingItem>) => void;
	onRemove: (id: string) => void;
}

const EMPTY_STATES: Record<StatusFilter, { icon: typeof BookOpen; message: string; hint: string }> = {
	'all': {
		icon: Library,
		message: 'Your reading list is empty',
		hint: 'Add a book, article, or paper to get started',
	},
	'want-to-read': {
		icon: BookOpen,
		message: 'Nothing queued up',
		hint: 'Add something you\'ve been meaning to read',
	},
	'reading': {
		icon: BookMarked,
		message: 'Not reading anything right now',
		hint: 'Pick something from your queue to start',
	},
	'finished': {
		icon: CheckCircle2,
		message: 'No finished items yet',
		hint: 'Completed reads will show up here with your ratings',
	},
	'abandoned': {
		icon: XCircle,
		message: 'Nothing abandoned',
		hint: 'That\'s a good thing — keep going!',
	},
};

export function ReadingListView({ items, filter = 'all', onUpdate, onRemove }: ReadingListViewProps) {
	if (items.length === 0) {
		const empty = EMPTY_STATES[filter];
		const Icon = empty.icon;

		return (
			<div className="flex flex-col items-center justify-center h-full text-center py-16">
				<div className="p-3 rounded-xl bg-white/[0.03] mb-4">
					<Icon className="w-8 h-8 text-[#444]" />
				</div>
				<div className="text-[#666] text-sm mb-1">{empty.message}</div>
				<div className="text-[#444] text-xs">{empty.hint}</div>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
			{items.map((item) => (
				<ItemCard
					key={item.id}
					item={item}
					onUpdate={onUpdate}
					onRemove={onRemove}
				/>
			))}
		</div>
	);
}
