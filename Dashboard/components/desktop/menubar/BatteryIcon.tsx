export function BatteryIcon({ percentage, color }: { percentage: number; color: string }) {
	const fillWidth = Math.max(0, Math.min(100, percentage));

	const fillColor = color.includes('green') ? '#22c55e'
		: color.includes('yellow') ? '#eab308'
			: color.includes('orange') ? '#f97316'
				: color.includes('red') ? '#ef4444'
					: '#888';

	return (
		<svg width="22" height="11" viewBox="0 0 22 11" fill="none" className="mt-px">
			<rect
				x="0.5" y="0.5" width="18" height="10" rx="2.5"
				stroke="currentColor" strokeWidth="1" fill="none"
				className="text-[var(--text-secondary)]"
			/>
			{fillWidth > 0 && (
				<rect
					x="2" y="2" width={Math.max(0.5, (fillWidth / 100) * 15)} height="7" rx="1.5"
					fill={fillColor}
				/>
			)}
			<path
				d="M19.5 3.5 C20.5 3.5, 21.5 4, 21.5 5.5 C21.5 7, 20.5 7.5, 19.5 7.5"
				stroke="currentColor" strokeWidth="1" fill="none"
				className="text-[var(--text-secondary)]"
			/>
		</svg>
	);
}
