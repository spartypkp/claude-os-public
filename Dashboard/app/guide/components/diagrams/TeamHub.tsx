'use client';

// Chapter 4: Chief hub-and-spoke diagram
export function TeamHub() {
	const spokes = [
		{ label: 'You', x: 250, y: 60, accent: true },
		{ label: 'Builder', x: 380, y: 130 },
		{ label: 'Researcher', x: 380, y: 230 },
		{ label: 'Email', x: 250, y: 300 },
		{ label: 'Calendar', x: 120, y: 230 },
		{ label: 'Writer', x: 120, y: 130 },
	];

	const cx = 250;
	const cy = 180;

	return (
		<svg viewBox="0 0 500 360" className="w-full max-w-lg mx-auto" aria-label="Chief hub-and-spoke diagram">
			{/* Connecting lines */}
			{spokes.map((spoke, i) => (
				<line
					key={i}
					x1={cx}
					y1={cy}
					x2={spoke.x}
					y2={spoke.y}
					stroke={spoke.accent ? 'rgba(218, 119, 86, 0.3)' : 'rgba(245, 240, 232, 0.08)'}
					strokeWidth="1"
				/>
			))}

			{/* Center: Chief */}
			<circle cx={cx} cy={cy} r="36" fill="rgba(218, 119, 86, 0.1)" stroke="#da7756" strokeWidth="1.5" />
			<text x={cx} y={cy + 4} textAnchor="middle" fill="#da7756" fontSize="13" fontFamily="monospace">Chief</text>

			{/* Spoke nodes */}
			{spokes.map((spoke, i) => (
				<g key={i}>
					<circle
						cx={spoke.x}
						cy={spoke.y}
						r="28"
						fill={spoke.accent ? 'rgba(218, 119, 86, 0.08)' : 'rgba(245, 240, 232, 0.03)'}
						stroke={spoke.accent ? 'rgba(218, 119, 86, 0.4)' : 'rgba(245, 240, 232, 0.12)'}
						strokeWidth="1"
					/>
					<text
						x={spoke.x}
						y={spoke.y + 4}
						textAnchor="middle"
						fill={spoke.accent ? 'rgba(218, 119, 86, 0.8)' : 'rgba(245, 240, 232, 0.5)'}
						fontSize="10"
						fontFamily="monospace"
					>
						{spoke.label}
					</text>
				</g>
			))}
		</svg>
	);
}
