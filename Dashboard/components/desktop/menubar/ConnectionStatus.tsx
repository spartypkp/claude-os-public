'use client';

import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useConnectionQuery, useSystemHealthQuery } from '@/hooks/queries';

export function ConnectionStatus() {
	const { data } = useConnectionQuery();
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const { data: health } = useSystemHealthQuery(
		isOpen,
		data?.healthy ?? false,
		data?.latencyMs ?? null
	);

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

	const isHealthy = data?.healthy ?? null;

	const StatusDot = ({ ok }: { ok: boolean }) => (
		<span className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
	);

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				data-testid="connection-status"
				onClick={() => setIsOpen(!isOpen)}
				aria-label="Connection Status"
				className="
					p-1 rounded-[4px]
					hover:bg-[var(--surface-muted)]
					transition-colors duration-75
					focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
				"
				title={isHealthy ? 'Connected' : 'Disconnected'}
			>
				{isHealthy === null ? (
					<Wifi className="w-4 h-4 text-[var(--text-muted)]" />
				) : isHealthy ? (
					<Wifi className="w-4 h-4 text-[var(--text-primary)]" />
				) : (
					<WifiOff className="w-4 h-4 text-[var(--color-error)]" />
				)}
			</button>

			{isOpen && (
				<div
					className="
						absolute top-full right-0 mt-1
						w-[280px]
						bg-[var(--surface-raised)] border border-[var(--border-default)]
						rounded-xl shadow-2xl overflow-hidden
						z-[2000] p-4
					"
					onClick={(e) => e.stopPropagation()}
				>
					<h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
						System Status
					</h3>

					{health ? (
						<div className="space-y-2.5">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<StatusDot ok={health.backend.healthy} />
									<span className="text-xs text-[var(--text-secondary)]">Backend API</span>
								</div>
								<span className="text-xs font-mono text-[var(--text-tertiary)]">
									{health.backend.latencyMs}ms
								</span>
							</div>

							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<StatusDot ok={health.scheduler.running} />
									<span className="text-xs text-[var(--text-secondary)]">Scheduler</span>
								</div>
								<span className="text-xs font-mono text-[var(--text-tertiary)]">
									{health.scheduler.entries} entries
								</span>
							</div>

							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<StatusDot ok={health.sessions.chief} />
									<span className="text-xs text-[var(--text-secondary)]">Chief</span>
								</div>
								<span className="text-xs font-mono text-[var(--text-tertiary)]">
									{health.sessions.chief ? 'Running' : 'Offline'}
								</span>
							</div>

							<div className="pt-2 border-t border-[var(--border-subtle)]">
								<div className="flex items-center justify-between">
									<span className="text-xs text-[var(--text-secondary)]">Active Sessions</span>
									<span className="text-xs font-mono text-[var(--text-primary)]">
										{health.sessions.active}
									</span>
								</div>
							</div>
						</div>
					) : (
						<div className="text-center py-3">
							<p className="text-xs text-[var(--text-tertiary)]">Loading...</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
