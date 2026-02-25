'use client';

// Chapter 20: Confidence/stakes decision matrix
export function DecisionMatrix() {
	return (
		<div className="max-w-md mx-auto">
			<div className="grid grid-cols-2 gap-2">
				{/* Header row */}
				<div />
				<div className="grid grid-cols-2 gap-2">
					<p className="text-center text-xs font-mono" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>Low Stakes</p>
					<p className="text-center text-xs font-mono" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>High Stakes</p>
				</div>
			</div>

			<div className="grid grid-cols-[auto_1fr] gap-2 mt-2">
				{/* High confidence row */}
				<div className="flex items-center pr-2">
					<p className="text-xs font-mono whitespace-nowrap" style={{ color: 'rgba(245, 240, 232, 0.3)', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
						High Confidence
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<div
						className="rounded-lg p-3"
						style={{ backgroundColor: 'rgba(218, 119, 86, 0.08)', border: '1px solid rgba(218, 119, 86, 0.15)' }}
					>
						<p className="text-sm font-medium mb-1" style={{ color: '#da7756' }}>Act, mention</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>Just do it and note what you did</p>
					</div>
					<div
						className="rounded-lg p-3"
						style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.08)' }}
					>
						<p className="text-sm font-medium mb-1" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>Surface, recommend</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>Present options, suggest one</p>
					</div>
				</div>

				{/* Low confidence row */}
				<div className="flex items-center pr-2">
					<p className="text-xs font-mono whitespace-nowrap" style={{ color: 'rgba(245, 240, 232, 0.3)', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
						Low Confidence
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<div
						className="rounded-lg p-3"
						style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.08)' }}
					>
						<p className="text-sm font-medium mb-1" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>Surface uncertainty</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>Say you're unsure, suggest options</p>
					</div>
					<div
						className="rounded-lg p-3"
						style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.08)' }}
					>
						<p className="text-sm font-medium mb-1" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>Present trade-offs</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>Full context, let them decide</p>
					</div>
				</div>
			</div>
		</div>
	);
}
