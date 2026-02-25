'use client';

import { useEffect, useState } from 'react';

interface ScrollProgressProps {
	currentPart: string | null;
}

export function ScrollProgress({ currentPart }: ScrollProgressProps) {
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		const container = document.getElementById('guide-scroll-container');
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			const maxScroll = scrollHeight - clientHeight;
			if (maxScroll <= 0) {
				setProgress(0);
				return;
			}
			setProgress(Math.min(1, scrollTop / maxScroll));
		};

		container.addEventListener('scroll', handleScroll, { passive: true });
		handleScroll();
		return () => container.removeEventListener('scroll', handleScroll);
	}, []);

	return (
		<div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
			{/* Progress bar */}
			<div
				className="h-[3px] origin-left transition-transform duration-100"
				style={{
					backgroundColor: '#da7756',
					transform: `scaleX(${progress})`,
				}}
			/>
			{/* Part label */}
			{currentPart && (
				<div
					className="absolute top-2 left-4 text-xs font-mono uppercase tracking-[0.15em] transition-opacity duration-300"
					style={{ color: 'rgba(218, 119, 86, 0.6)' }}
				>
					{currentPart}
				</div>
			)}
		</div>
	);
}
