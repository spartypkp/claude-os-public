'use client';

/**
 * LifecycleToast - Minimal session lifecycle notifications
 *
 * Simplified: only shows the "Fresh session spawned" success toast.
 * The main handoff progress is now shown inline in the tab bar and transcript.
 */

import { useEventStream } from '@/hooks/useEventStream';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Toast {
	id: string;
	message: string;
	timestamp: number;
}

const TOAST_DURATION = 3000;

export function LifecycleToast() {
	const { lastEvent } = useEventStream();
	const [toasts, setToasts] = useState<Toast[]>([]);

	useEffect(() => {
		if (!lastEvent) return;

		// Only show toast for the final "respawned" confirmation
		if (lastEvent.type !== 'session.respawned') return;

		const toast: Toast = {
			id: `respawned-${Date.now()}`,
			message: 'Fresh session spawned',
			timestamp: Date.now(),
		};

		setToasts((prev) => [...prev, toast]);

		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== toast.id));
		}, TOAST_DURATION);
	}, [lastEvent]);

	if (toasts.length === 0) return null;

	return (
		<div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className="pointer-events-auto"
					style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
				>
					<div
						className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg"
						style={{
							background: 'var(--surface-claude-raised)',
							border: '1px solid var(--border-claude)',
							color: 'var(--text-primary)',
						}}
					>
						<CheckCircle2 size={18} style={{ color: 'var(--color-claude)' }} />
						<span className="text-sm font-medium">{toast.message}</span>
					</div>
				</div>
			))}

			<style jsx>{`
				@keyframes fadeSlideIn {
					from {
						opacity: 0;
						transform: translateX(20px);
					}
					to {
						opacity: 1;
						transform: translateX(0);
					}
				}
			`}</style>
		</div>
	);
}
