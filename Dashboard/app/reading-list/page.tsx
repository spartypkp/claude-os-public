/**
 * === CUSTOM APP PATTERN ===
 * page.tsx is the main page component for your app route.
 * It fetches data from the backend API and renders the UI.
 * All API calls go to http://localhost:5001/api/{app-name}/.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { ReadingListView } from './components/ReadingListView';
import { AddItemModal } from './components/AddItemModal';
import { Plus } from 'lucide-react';

// === Types ===

export interface ReadingItem {
	id: string;
	title: string;
	author: string | null;
	type: 'book' | 'article' | 'paper' | 'other';
	status: 'want-to-read' | 'reading' | 'finished' | 'abandoned';
	rating: number | null;
	notes: string | null;
	tags: string[];
	added_date: string;
	started_date: string | null;
	finished_date: string | null;
}

export interface ReadingStats {
	total: number;
	by_status: {
		want_to_read: number;
		reading: number;
		finished: number;
		abandoned: number;
	};
	average_rating: number | null;
	rated_count: number;
}

type StatusFilter = 'all' | 'want-to-read' | 'reading' | 'finished' | 'abandoned';

const API_BASE = 'http://localhost:5001/api/reading-list';

// === Main Page Component ===

export default function ReadingListPage() {
	const [items, setItems] = useState<ReadingItem[]>([]);
	const [stats, setStats] = useState<ReadingStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<StatusFilter>('all');
	const [showAddModal, setShowAddModal] = useState(false);

	// Fetch items from API
	const fetchItems = useCallback(async () => {
		try {
			const params = filter !== 'all' ? `?status=${filter}` : '';
			const response = await fetch(`${API_BASE}${params}`);
			if (!response.ok) throw new Error('Failed to fetch items');
			const data = await response.json();
			setItems(data.items);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		}
	}, [filter]);

	// Fetch stats
	const fetchStats = useCallback(async () => {
		try {
			const response = await fetch(`${API_BASE}/stats`);
			if (!response.ok) throw new Error('Failed to fetch stats');
			const data = await response.json();
			setStats(data);
		} catch {
			// Stats are non-critical, just skip
		}
	}, []);

	// Load data
	const refresh = useCallback(async () => {
		setLoading(true);
		await Promise.all([fetchItems(), fetchStats()]);
		setLoading(false);
	}, [fetchItems, fetchStats]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	// Add item handler
	const handleAdd = async (item: {
		title: string;
		author?: string;
		type: string;
		tags?: string[];
	}) => {
		try {
			const response = await fetch(API_BASE, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(item),
			});
			if (!response.ok) throw new Error('Failed to add item');
			setShowAddModal(false);
			await refresh();
		} catch (err) {
			console.error('Failed to add item:', err);
		}
	};

	// Update item handler
	const handleUpdate = async (id: string, updates: Partial<ReadingItem>) => {
		try {
			const response = await fetch(`${API_BASE}/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates),
			});
			if (!response.ok) throw new Error('Failed to update item');
			await refresh();
		} catch (err) {
			console.error('Failed to update item:', err);
		}
	};

	// Remove item handler
	const handleRemove = async (id: string) => {
		try {
			const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Failed to remove item');
			await refresh();
		} catch (err) {
			console.error('Failed to remove item:', err);
		}
	};

	if (loading && items.length === 0) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-[#888] text-sm">Loading reading list...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-red-400 text-sm">Error: {error}</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full p-6 gap-4">
			{/* Header with stats and add button */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<h2 className="text-lg font-medium text-white">Reading List</h2>
					{stats && (
						<div className="flex items-center gap-3 text-xs text-[#888]">
							<span>{stats.total} items</span>
							{stats.by_status.reading > 0 && (
								<span className="text-emerald-400">{stats.by_status.reading} reading</span>
							)}
							{stats.average_rating && (
								<span className="text-amber-400">avg {stats.average_rating}/5</span>
							)}
						</div>
					)}
				</div>
				<button
					onClick={() => setShowAddModal(true)}
					className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
						bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
				>
					<Plus className="w-3.5 h-3.5" />
					Add Item
				</button>
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center gap-1">
				{[
					{ key: 'all' as const, label: 'All', count: stats?.total },
					{ key: 'want-to-read' as const, label: 'Want to Read', count: stats?.by_status.want_to_read },
					{ key: 'reading' as const, label: 'Reading', count: stats?.by_status.reading },
					{ key: 'finished' as const, label: 'Finished', count: stats?.by_status.finished },
					{ key: 'abandoned' as const, label: 'Abandoned', count: stats?.by_status.abandoned },
				].map((tab) => (
					<button
						key={tab.key}
						onClick={() => setFilter(tab.key)}
						className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
							filter === tab.key
								? 'bg-white/10 text-white'
								: 'text-[#888] hover:bg-white/5 hover:text-[#aaa]'
						}`}
					>
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<span className="ml-1.5 text-[#666]">{tab.count}</span>
						)}
					</button>
				))}
			</div>

			{/* Items list */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				<ReadingListView
					items={items}
					onUpdate={handleUpdate}
					onRemove={handleRemove}
				/>
			</div>

			{/* Add item modal */}
			{showAddModal && (
				<AddItemModal
					onAdd={handleAdd}
					onClose={() => setShowAddModal(false)}
				/>
			)}
		</div>
	);
}
