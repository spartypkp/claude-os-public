/**
 * ReadingListView - Grid of reading list items.
 *
 * Displays items in a responsive grid layout with empty states.
 */

'use client';

import type { ReadingItem } from '../page';
import { ItemCard } from './ItemCard';

interface ReadingListViewProps {
	items: ReadingItem[];
	onUpdate: (id: string, updates: Partial<ReadingItem>) => void;
	onRemove: (id: string) => void;
}

export function ReadingListView({ items, onUpdate, onRemove }: ReadingListViewProps) {
	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-center">
				<div className="text-[#555] text-sm mb-1">No items found</div>
				<div className="text-[#444] text-xs">
					Add something to your reading list to get started
				</div>
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
