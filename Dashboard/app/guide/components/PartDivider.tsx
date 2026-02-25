'use client';

import type { PartData } from '../content/types';

interface PartDividerProps {
	part: PartData;
}

export function PartDivider({ part }: PartDividerProps) {
	const paddedNumber = String(part.number).padStart(2, '0');

	return (
		<div
			className="relative w-full overflow-hidden"
			style={{
				backgroundColor: '#141414',
				paddingTop: '140px',
				paddingBottom: '140px',
			}}
		>
			{/* Large faded part number in background */}
			<div
				className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
				aria-hidden="true"
			>
				<span
					className="font-bold"
					style={{
						fontSize: '200px',
						color: 'rgba(245, 240, 232, 0.04)',
						lineHeight: 1,
					}}
				>
					{paddedNumber}
				</span>
			</div>

			{/* Content */}
			<div className="relative max-w-[760px] mx-auto px-6 text-center">
				<p
					className="text-xs uppercase tracking-[0.15em] mb-3"
					style={{ color: '#da7756' }}
				>
					Part {part.number}
				</p>
				<h2
					className="text-4xl font-semibold mb-4"
					style={{ color: '#f5f0e8' }}
				>
					{part.title}
				</h2>
				<p
					className="text-lg"
					style={{ color: 'rgba(245, 240, 232, 0.5)' }}
				>
					{part.teaser}
				</p>
			</div>
		</div>
	);
}
