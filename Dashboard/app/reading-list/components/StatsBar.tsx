/**
 * StatsBar - Visual stats cards for reading list metrics.
 */

'use client';

import { BookOpen, BookMarked, Star, CheckCircle2 } from 'lucide-react';
import type { ReadingStats } from '../page';

interface StatsBarProps {
	stats: ReadingStats;
}

export function StatsBar({ stats }: StatsBarProps) {
	const cards = [
		{
			label: 'Total',
			value: stats.total,
			icon: BookOpen,
			color: 'text-[#ccc]',
			bg: 'bg-white/[0.03]',
		},
		{
			label: 'Reading',
			value: stats.by_status.reading,
			icon: BookMarked,
			color: 'text-emerald-400',
			bg: 'bg-emerald-500/[0.06]',
		},
		{
			label: 'Finished',
			value: stats.by_status.finished,
			icon: CheckCircle2,
			color: 'text-amber-400',
			bg: 'bg-amber-500/[0.06]',
		},
		{
			label: 'Avg Rating',
			value: stats.average_rating ? `${stats.average_rating.toFixed(1)}` : '--',
			icon: Star,
			color: 'text-amber-400',
			bg: 'bg-amber-500/[0.06]',
			suffix: stats.average_rating ? '/5' : '',
		},
	];

	return (
		<div className="grid grid-cols-4 gap-3">
			{cards.map((card) => {
				const Icon = card.icon;
				return (
					<div
						key={card.label}
						className={`${card.bg} rounded-lg px-3 py-2.5 flex items-center gap-2.5`}
					>
						<Icon className={`w-4 h-4 ${card.color} shrink-0`} />
						<div className="min-w-0">
							<div className="flex items-baseline gap-0.5">
								<span className={`text-base font-semibold ${card.color}`}>
									{card.value}
								</span>
								{'suffix' in card && card.suffix && (
									<span className="text-[10px] text-[#666]">{card.suffix}</span>
								)}
							</div>
							<span className="text-[10px] text-[#666] uppercase tracking-wider">
								{card.label}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
