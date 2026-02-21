'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useUsageQuery, useRefreshUsage } from '@/hooks/queries';
import { BatteryIcon } from './BatteryIcon';

export function UsageBattery() {
	const { data: usage } = useUsageQuery();
	const refreshMutation = useRefreshUsage();
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen]);

	const getBatteryColor = (): string => {
		if (!usage || usage.status !== 'success') return 'muted';

		const remaining = Math.min(
			100 - usage.session.percentage,
			usage.weekly ? 100 - usage.weekly.percentage : 100
		);

		if (remaining >= 80) return 'green';
		if (remaining >= 30) return 'yellow';
		if (remaining >= 10) return 'orange';
		return 'red';
	};

	const getRemainingPercentage = (): number => {
		if (!usage || usage.status !== 'success') return 100;
		return Math.min(
			100 - usage.session.percentage,
			usage.weekly ? 100 - usage.weekly.percentage : 100
		);
	};

	const formatTimeUntil = (resetAt: string): string => {
		const now = new Date();
		const reset = new Date(resetAt);
		const diff = reset.getTime() - now.getTime();

		if (diff < 0) return 'Soon';

		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	};

	const formatDate = (dateStr: string): string => {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	};

	const formatNumber = (num: number): string => {
		return num.toLocaleString();
	};

	const batteryColor = getBatteryColor();
	const remaining = getRemainingPercentage();
	const isRefreshing = refreshMutation.isPending;

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				data-testid="usage-battery"
				onClick={() => setIsOpen(!isOpen)}
				aria-label="Claude Code Usage"
				className="
					p-1 rounded-[4px]
					hover:bg-[var(--surface-muted)]
					transition-colors duration-75
					focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
				"
				title="Claude Code Usage"
			>
				{isRefreshing ? (
					<div className="animate-pulse">
						<BatteryIcon percentage={remaining} color={batteryColor} />
					</div>
				) : (
					<BatteryIcon percentage={remaining} color={batteryColor} />
				)}
			</button>

			{isOpen && (
				<div
					className="
						absolute top-full right-0 mt-1
						w-[320px]
						bg-[var(--surface-raised)] border border-[var(--border-default)]
						rounded-xl shadow-2xl overflow-hidden
						z-[2000] p-4
					"
					onClick={(e) => e.stopPropagation()}
				>
					<h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
						Claude Code Usage
					</h3>

					{usage && usage.status === 'success' ? (
						<>
							{/* Session Usage */}
							<div className="mb-4">
								<div className="flex justify-between items-center mb-1">
									<span className="text-xs text-[var(--text-secondary)]">5-Hour Session</span>
									<span className="text-xs font-mono text-[var(--text-primary)]">
										{usage.session.percentage.toFixed(1)}%
									</span>
								</div>
								<div className="w-full bg-[var(--surface-muted)] rounded-full h-2 mb-1">
									<div
										className={`h-2 rounded-full transition-all ${usage.session.percentage >= 90 ? 'bg-red-500' :
												usage.session.percentage >= 70 ? 'bg-orange-500' :
													usage.session.percentage >= 20 ? 'bg-yellow-500' :
														'bg-green-500'
											}`}
										style={{ width: `${usage.session.percentage}%` }}
									/>
								</div>
								<div className="text-xs text-[var(--text-tertiary)] flex justify-between">
									<span>Resets in: {formatTimeUntil(usage.session.resetAt)}</span>
									<span>{formatNumber(usage.session.used)} / {formatNumber(usage.session.total)}</span>
								</div>
							</div>

							{/* Weekly Usage */}
							{usage.weekly && (
								<div className="mb-4">
									<div className="flex justify-between items-center mb-1">
										<span className="text-xs text-[var(--text-secondary)]">Weekly Limit</span>
										<span className="text-xs font-mono text-[var(--text-primary)]">
											{usage.weekly.percentage.toFixed(1)}%
										</span>
									</div>
									<div className="w-full bg-[var(--surface-muted)] rounded-full h-2 mb-1">
										<div
											className={`h-2 rounded-full transition-all ${usage.weekly.percentage >= 90 ? 'bg-red-500' :
													usage.weekly.percentage >= 70 ? 'bg-orange-500' :
														usage.weekly.percentage >= 20 ? 'bg-yellow-500' :
															'bg-green-500'
												}`}
											style={{ width: `${usage.weekly.percentage}%` }}
										/>
									</div>
									<div className="text-xs text-[var(--text-tertiary)] flex justify-between">
										<span>Resets: {formatDate(usage.weekly.resetAt)}</span>
										<span>{formatNumber(usage.weekly.used)} / {formatNumber(usage.weekly.total)}</span>
									</div>
								</div>
							)}

							{/* Metadata */}
							<div className="pt-3 border-t border-[var(--border-subtle)] space-y-1 mb-3">
								{usage.model && (
									<div className="flex justify-between text-xs">
										<span className="text-[var(--text-secondary)]">Model:</span>
										<span className="text-[var(--text-primary)] font-mono">{usage.model}</span>
									</div>
								)}
								{usage.plan && (
									<div className="flex justify-between text-xs">
										<span className="text-[var(--text-secondary)]">Plan:</span>
										<span className="text-[var(--text-primary)] capitalize">{usage.plan}</span>
									</div>
								)}
								<div className="flex justify-between text-xs">
									<span className="text-[var(--text-secondary)]">Updated:</span>
									<span className="text-[var(--text-tertiary)]">
										{new Date(usage.lastUpdated).toLocaleTimeString()}
									</span>
								</div>
							</div>

							{/* Refresh Button */}
							<button
								onClick={() => refreshMutation.mutate()}
								disabled={isRefreshing}
								className="
									w-full py-1.5 px-3
									bg-blue-600 hover:bg-blue-700
									disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-tertiary)]
									text-white text-xs rounded
									transition-colors
									flex items-center justify-center gap-2
								"
							>
								<RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
								{isRefreshing ? 'Refreshing...' : 'Refresh Now'}
							</button>
						</>
					) : (
						<div className="text-center py-4">
							<p className="text-sm text-[var(--text-secondary)] mb-3">
								{usage?.error || usage?.message || 'No usage data available'}
							</p>
							<button
								onClick={() => refreshMutation.mutate()}
								className="
									py-1.5 px-3
									bg-blue-600 hover:bg-blue-700
									text-white text-xs rounded
									transition-colors
									flex items-center justify-center gap-2 mx-auto
								"
							>
								<RefreshCw className="w-3 h-3" />
								Try Refresh
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
