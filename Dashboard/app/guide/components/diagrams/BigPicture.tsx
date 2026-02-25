'use client';

// Chapter 1: Chat window vs Claude OS split comparison
export function BigPicture() {
	return (
		<div className="flex flex-col md:flex-row gap-6 md:gap-10 items-stretch">
			{/* Left: Generic chat */}
			<div className="flex-1 rounded-xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
				<p className="text-xs font-mono uppercase tracking-[0.15em] mb-4" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>
					Typical AI Chat
				</p>
				<svg viewBox="0 0 300 200" className="w-full" aria-label="Generic chat interface">
					{/* Chat bubbles */}
					<rect x="20" y="20" width="180" height="24" rx="12" fill="rgba(245, 240, 232, 0.06)" />
					<rect x="60" y="56" width="220" height="24" rx="12" fill="rgba(245, 240, 232, 0.04)" />
					<rect x="20" y="92" width="160" height="24" rx="12" fill="rgba(245, 240, 232, 0.06)" />
					<rect x="80" y="128" width="200" height="24" rx="12" fill="rgba(245, 240, 232, 0.04)" />
					{/* Fade out / forget */}
					<rect x="20" y="164" width="260" height="24" rx="12" fill="rgba(245, 240, 232, 0.02)" />
					{/* X mark */}
					<line x1="260" y1="170" x2="280" y2="190" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="2" />
					<line x1="280" y1="170" x2="260" y2="190" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="2" />
				</svg>
				<div className="mt-3 space-y-1.5">
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>No memory between sessions</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>Single conversation thread</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>Starts blank every time</p>
				</div>
			</div>

			{/* Arrow */}
			<div className="flex items-center justify-center md:flex-none">
				<svg width="40" height="40" viewBox="0 0 40 40" className="rotate-90 md:rotate-0">
					<path d="M10 20 L28 20 M22 14 L28 20 L22 26" stroke="#da7756" strokeWidth="2" fill="none" />
				</svg>
			</div>

			{/* Right: Claude OS */}
			<div className="flex-1 rounded-xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(218, 119, 86, 0.15)' }}>
				<p className="text-xs font-mono uppercase tracking-[0.15em] mb-4" style={{ color: '#da7756' }}>
					Claude OS
				</p>
				<svg viewBox="0 0 300 200" className="w-full" aria-label="Claude OS system">
					{/* File system representation */}
					<rect x="20" y="15" width="80" height="20" rx="4" fill="rgba(218, 119, 86, 0.15)" stroke="rgba(218, 119, 86, 0.3)" strokeWidth="1" />
					<text x="60" y="29" textAnchor="middle" fill="rgba(218, 119, 86, 0.7)" fontSize="8" fontFamily="monospace">TODAY.md</text>

					<rect x="110" y="15" width="80" height="20" rx="4" fill="rgba(218, 119, 86, 0.15)" stroke="rgba(218, 119, 86, 0.3)" strokeWidth="1" />
					<text x="150" y="29" textAnchor="middle" fill="rgba(218, 119, 86, 0.7)" fontSize="8" fontFamily="monospace">MEMORY.md</text>

					<rect x="200" y="15" width="80" height="20" rx="4" fill="rgba(218, 119, 86, 0.15)" stroke="rgba(218, 119, 86, 0.3)" strokeWidth="1" />
					<text x="240" y="29" textAnchor="middle" fill="rgba(218, 119, 86, 0.7)" fontSize="8" fontFamily="monospace">IDENTITY.md</text>

					{/* Chief node */}
					<circle cx="150" cy="80" r="22" fill="rgba(218, 119, 86, 0.1)" stroke="#da7756" strokeWidth="1.5" />
					<text x="150" y="84" textAnchor="middle" fill="#da7756" fontSize="9" fontFamily="monospace">Chief</text>

					{/* Lines from files to chief */}
					<line x1="60" y1="35" x2="140" y2="60" stroke="rgba(218, 119, 86, 0.2)" strokeWidth="1" />
					<line x1="150" y1="35" x2="150" y2="58" stroke="rgba(218, 119, 86, 0.2)" strokeWidth="1" />
					<line x1="240" y1="35" x2="160" y2="60" stroke="rgba(218, 119, 86, 0.2)" strokeWidth="1" />

					{/* Specialist nodes */}
					<circle cx="60" cy="150" r="16" fill="rgba(245, 240, 232, 0.04)" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="1" />
					<text x="60" y="154" textAnchor="middle" fill="rgba(245, 240, 232, 0.5)" fontSize="7" fontFamily="monospace">Builder</text>

					<circle cx="150" cy="160" r="16" fill="rgba(245, 240, 232, 0.04)" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="1" />
					<text x="150" y="164" textAnchor="middle" fill="rgba(245, 240, 232, 0.5)" fontSize="7" fontFamily="monospace">Writer</text>

					<circle cx="240" cy="150" r="16" fill="rgba(245, 240, 232, 0.04)" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="1" />
					<text x="240" y="154" textAnchor="middle" fill="rgba(245, 240, 232, 0.5)" fontSize="6" fontFamily="monospace">Researcher</text>

					{/* Lines from chief to specialists */}
					<line x1="135" y1="98" x2="68" y2="136" stroke="rgba(245, 240, 232, 0.1)" strokeWidth="1" />
					<line x1="150" y1="102" x2="150" y2="144" stroke="rgba(245, 240, 232, 0.1)" strokeWidth="1" />
					<line x1="165" y1="98" x2="232" y2="136" stroke="rgba(245, 240, 232, 0.1)" strokeWidth="1" />
				</svg>
				<div className="mt-3 space-y-1.5">
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Persistent memory across sessions</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Specialist team with domain expertise</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Compounds over time</p>
				</div>
			</div>
		</div>
	);
}
