'use client';

import {
	completePriority,
	createPriority,
	deletePriority,
	Priority,
	updatePriority,
} from '@/lib/api';
import {
	usePrioritiesQuery,
} from '@/hooks/queries';
import {
	AlertTriangle,
	Check,
	ChevronDown,
	Loader2,
	Minus,
	Plus,
	Target,
	Trash2
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

// ==========================================
// TYPES & CONFIG
// ==========================================

interface PriorityWithLevel extends Priority {
	level: 'critical' | 'medium' | 'low';
}

type PriorityLevel = 'critical' | 'medium' | 'low';

const LEVEL_CONFIG = {
	critical: {
		label: 'Critical',
		shortLabel: 'C',
		icon: AlertTriangle,
		bg: 'bg-red-500',
		bgLight: 'bg-red-500/10',
		border: 'border-red-500/30',
		text: 'text-red-500',
		ring: 'ring-red-500/20',
	},
	medium: {
		label: 'Medium',
		shortLabel: 'M',
		icon: Minus,
		bg: 'bg-amber-500',
		bgLight: 'bg-amber-500/10',
		border: 'border-amber-500/30',
		text: 'text-amber-500',
		ring: 'ring-amber-500/20',
	},
	low: {
		label: 'Low',
		shortLabel: 'L',
		icon: ChevronDown,
		bg: 'bg-slate-400',
		bgLight: 'bg-slate-400/10',
		border: 'border-slate-400/30',
		text: 'text-slate-400',
		ring: 'ring-slate-400/20',
	},
};

// ==========================================
// COMPONENT
// ==========================================

export function PrioritiesWidgetContent() {
	const queryClient = useQueryClient();
	
	// Jan 2026: Use React Query instead of polling
	// SSE events automatically invalidate the cache when priorities change
	const { data, isLoading: loading } = usePrioritiesQuery();
	
	// Transform query data to flat list with levels
	const priorities: PriorityWithLevel[] = data ? [
		...(data.priorities.critical || []).map(p => ({ ...p, level: 'critical' as const })),
		...(data.priorities.medium || []).map(p => ({ ...p, level: 'medium' as const })),
		...(data.priorities.low || []).map(p => ({ ...p, level: 'low' as const })),
	] : [];

	const [toggling, setToggling] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);

	// Add form state
	const [showAdd, setShowAdd] = useState(false);
	const [newText, setNewText] = useState('');
	const [newLevel, setNewLevel] = useState<PriorityLevel>('medium');
	const [adding, setAdding] = useState(false);

	// Helper to invalidate cache (called after mutations)
	const invalidateCache = () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.priorities });
	};

	const handleToggle = async (id: string, currentlyCompleted: boolean) => {
		setToggling(id);
		try {
			const result = currentlyCompleted
				? await updatePriority(id, { completed: false })
				: await completePriority(id);

			if (result.success) {
				// SSE will invalidate, but also invalidate manually for immediate feedback
				invalidateCache();
			}
		} catch {
			toast.error('Failed');
		} finally {
			setToggling(null);
		}
	};

	const handleDelete = async (id: string) => {
		setDeleting(id);
		try {
			const result = await deletePriority(id);
			if (result.success) {
				invalidateCache();
			}
		} catch {
			toast.error('Failed to delete');
		} finally {
			setDeleting(null);
		}
	};

	const handleAdd = async () => {
		if (!newText.trim()) return;
		setAdding(true);
		try {
			const result = await createPriority(newText.trim(), newLevel);
			if (result.success) {
				setNewText('');
				setShowAdd(false);
				invalidateCache();
			} else {
				toast.error(result.error || 'Failed');
			}
		} catch {
			toast.error('Failed to add');
		} finally {
			setAdding(false);
		}
	};

	const incomplete = priorities.filter(p => !p.completed);
	const completed = priorities.filter(p => p.completed);
	const criticalCount = incomplete.filter(p => p.level === 'critical').length;

	// ==========================================
	// RENDER
	// ==========================================

	// Loading
	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="w-5 h-5 animate-spin text-gray-400" />
			</div>
		);
	}

	// Empty state
	if (priorities.length === 0 && !showAdd) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-8 text-center">
				<div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-400/10 to-orange-400/10 border border-red-400/20 flex items-center justify-center mb-4">
					<Target className="w-7 h-7 text-red-400" />
				</div>
				<p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
					No priorities
				</p>
				<p className="text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-[200px]">
					Add your most important tasks to stay focused
				</p>
				<button
					onClick={() => setShowAdd(true)}
					className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-400 to-orange-400 rounded-lg hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
				>
					Add Priority
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Stats Bar */}
			<div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-b from-gray-50 to-white dark:from-white/5 dark:to-transparent border-b border-gray-100/80 dark:border-white/5">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
						{incomplete.length}
					</span>
					<span className="text-xs text-gray-500 dark:text-gray-400">active</span>
				</div>
				{criticalCount > 0 && (
					<div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-400/10 border border-red-400/20">
						<AlertTriangle className="w-3 h-3 text-red-500" />
						<span className="text-[10px] font-semibold text-red-500 tabular-nums">{criticalCount}</span>
					</div>
				)}
				<div className="flex-1" />
				<button
					onClick={() => setShowAdd(!showAdd)}
					className={`w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-sm ${showAdd
						? 'bg-red-400 text-white rotate-45 shadow-red-400/30'
						: 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/15 hover:scale-105 active:scale-95'
						}`}
				>
					<Plus className="w-3.5 h-3.5" />
				</button>
			</div>

			{/* Add Form */}
			{showAdd && (
				<div className="p-3 border-b border-gray-100 dark:border-white/5 bg-gradient-to-b from-white to-gray-50/50 dark:from-transparent dark:to-white/5">
					<input
						type="text"
						value={newText}
						onChange={(e) => setNewText(e.target.value)}
						placeholder="What's important?"
						className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:border-red-400/40 shadow-sm transition-all"
						onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
						autoFocus
					/>
					<div className="flex items-center gap-2 mt-2">
						{(['critical', 'medium', 'low'] as PriorityLevel[]).map((level) => {
							const config = LEVEL_CONFIG[level];
							const isSelected = newLevel === level;
							return (
								<button
									key={level}
									onClick={() => setNewLevel(level)}
									className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${isSelected
										? `${config.bg} text-white`
										: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
										}`}
								>
									{config.label}
								</button>
							);
						})}
					</div>
					<button
						onClick={handleAdd}
						disabled={!newText.trim() || adding}
						className="w-full mt-2.5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-400 to-orange-400 rounded-lg hover:shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-sm"
					>
						{adding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add Priority'}
					</button>
				</div>
			)}

			{/* Priority List */}
			<div className="flex-1 overflow-auto">
				{/* Active */}
				{incomplete.length > 0 && (
					<div className="p-2 space-y-1">
						{incomplete.map((priority) => (
							<PriorityItem
								key={priority.id}
								priority={priority}
								isToggling={toggling === priority.id}
								isDeleting={deleting === priority.id}
								onToggle={() => handleToggle(priority.id, priority.completed)}
								onDelete={() => handleDelete(priority.id)}
							/>
						))}
					</div>
				)}

				{/* Completed */}
				{completed.length > 0 && (
					<div className="p-2 pt-0">
						<div className="flex items-center gap-2 py-2 px-1">
							<div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
							<span className="text-[10px] text-gray-400 dark:text-gray-500">
								{completed.length} done
							</span>
							<div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
						</div>
						<div className="space-y-1">
							{completed.map((priority) => (
								<PriorityItem
									key={priority.id}
									priority={priority}
									isToggling={toggling === priority.id}
									isDeleting={deleting === priority.id}
									onToggle={() => handleToggle(priority.id, priority.completed)}
									onDelete={() => handleDelete(priority.id)}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ==========================================
// PRIORITY ITEM
// ==========================================

interface PriorityItemProps {
	priority: PriorityWithLevel;
	isToggling: boolean;
	isDeleting: boolean;
	onToggle: () => void;
	onDelete: () => void;
}

function PriorityItem({ priority, isToggling, isDeleting, onToggle, onDelete }: PriorityItemProps) {
	const config = LEVEL_CONFIG[priority.level];

	return (
		<div
			className={`
				group flex items-start gap-2 p-2 rounded-lg transition-all
				${priority.completed
					? 'bg-gray-50 dark:bg-white/5'
					: `${config.bgLight} ring-1 ${config.ring}`
				}
			`}
		>
			{/* Checkbox */}
			<button
				onClick={onToggle}
				disabled={isToggling}
				className={`
					flex-shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all
					${priority.completed
						? 'bg-green-500 border-green-500'
						: `${config.border} hover:${config.bg} hover:border-transparent`
					}
				`}
			>
				{isToggling ? (
					<Loader2 className="w-3 h-3 animate-spin text-white" />
				) : priority.completed ? (
					<Check className="w-3 h-3 text-white" />
				) : (
					<div className={`w-2 h-2 rounded-sm ${config.bg} opacity-0 group-hover:opacity-100 transition-opacity`} />
				)}
			</button>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<span
					className={`
						text-sm leading-tight
						${priority.completed
							? 'line-through text-gray-400 dark:text-gray-500'
							: 'text-gray-900 dark:text-white'
						}
					`}
				>
					{priority.content}
				</span>
			</div>

			{/* Level indicator (only for incomplete) */}
			{!priority.completed && (
				<span className={`flex-shrink-0 w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${config.bg} text-white`}>
					{config.shortLabel}
				</span>
			)}

			{/* Delete */}
			<button
				onClick={onDelete}
				disabled={isDeleting}
				className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
			>
				{isDeleting ? (
					<Loader2 className="w-3 h-3 animate-spin" />
				) : (
					<Trash2 className="w-3 h-3" />
				)}
			</button>
		</div>
	);
}

export default PrioritiesWidgetContent;
