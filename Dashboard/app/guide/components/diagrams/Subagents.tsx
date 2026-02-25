'use client';

// Chapter 6: Parallel subagent threads converging
export function Subagents() {
	const agents = [
		{ label: 'web-research', color: 'rgba(218, 119, 86, 0.6)' },
		{ label: 'data-scientist', color: 'rgba(218, 119, 86, 0.5)' },
		{ label: 'best-practices', color: 'rgba(218, 119, 86, 0.4)' },
		{ label: 'practitioner', color: 'rgba(218, 119, 86, 0.5)' },
		{ label: 'skeptic', color: 'rgba(218, 119, 86, 0.6)' },
	];

	const startX = 80;
	const endX = 420;
	const midX = 250;
	const topY = 30;
	const spreadY = 40;

	return (
		<svg viewBox="0 0 500 220" className="w-full max-w-xl mx-auto" aria-label="Subagent parallel execution">
			{/* Chief start node */}
			<circle cx={startX} cy={110} r="22" fill="rgba(218, 119, 86, 0.1)" stroke="#da7756" strokeWidth="1.5" />
			<text x={startX} y={114} textAnchor="middle" fill="#da7756" fontSize="9" fontFamily="monospace">Chief</text>

			{/* Diverging lines */}
			{agents.map((agent, i) => {
				const y = topY + i * spreadY;
				return (
					<g key={i}>
						{/* Line from chief to midpoint */}
						<line x1={startX + 22} y1={110} x2={midX - 40} y2={y + 10} stroke={agent.color} strokeWidth="1" opacity="0.6" />
						{/* Agent label at midpoint */}
						<rect x={midX - 40} y={y} width="80" height="20" rx="4" fill="rgba(245, 240, 232, 0.03)" stroke={agent.color} strokeWidth="0.5" />
						<text x={midX} y={y + 14} textAnchor="middle" fill={agent.color} fontSize="7" fontFamily="monospace">{agent.label}</text>
						{/* Line from midpoint to convergence */}
						<line x1={midX + 40} y1={y + 10} x2={endX - 22} y2={110} stroke={agent.color} strokeWidth="1" opacity="0.6" />
					</g>
				);
			})}

			{/* Convergence: Synthesis node */}
			<circle cx={endX} cy={110} r="22" fill="rgba(218, 119, 86, 0.1)" stroke="#da7756" strokeWidth="1.5" />
			<text x={endX} y={108} textAnchor="middle" fill="#da7756" fontSize="8" fontFamily="monospace">Synth-</text>
			<text x={endX} y={118} textAnchor="middle" fill="#da7756" fontSize="8" fontFamily="monospace">esize</text>
		</svg>
	);
}
