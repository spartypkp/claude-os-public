'use client';

// Chapter 5: Preparation > Implementation > Verification loop
export function SpecialistLoop() {
	return (
		<svg viewBox="0 0 500 200" className="w-full max-w-xl mx-auto" aria-label="Specialist 3-phase loop">
			{/* Phase boxes */}
			{[
				{ x: 30, label: 'Preparation', sub: 'Investigate and plan', accent: false },
				{ x: 190, label: 'Implementation', sub: 'Build the solution', accent: true },
				{ x: 350, label: 'Verification', sub: 'Fresh eyes check work', accent: false },
			].map((phase, i) => (
				<g key={i}>
					<rect
						x={phase.x}
						y="50"
						width="130"
						height="60"
						rx="8"
						fill={phase.accent ? 'rgba(218, 119, 86, 0.1)' : 'rgba(245, 240, 232, 0.03)'}
						stroke={phase.accent ? '#da7756' : 'rgba(245, 240, 232, 0.12)'}
						strokeWidth="1"
					/>
					<text
						x={phase.x + 65}
						y="78"
						textAnchor="middle"
						fill={phase.accent ? '#da7756' : 'rgba(245, 240, 232, 0.7)'}
						fontSize="11"
						fontFamily="monospace"
					>
						{phase.label}
					</text>
					<text
						x={phase.x + 65}
						y="96"
						textAnchor="middle"
						fill="rgba(245, 240, 232, 0.3)"
						fontSize="9"
					>
						{phase.sub}
					</text>
				</g>
			))}

			{/* Forward arrows */}
			<line x1="160" y1="80" x2="186" y2="80" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="1" />
			<polygon points="184,77 190,80 184,83" fill="rgba(245, 240, 232, 0.15)" />

			<line x1="320" y1="80" x2="346" y2="80" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="1" />
			<polygon points="344,77 350,80 344,83" fill="rgba(245, 240, 232, 0.15)" />

			{/* Loop-back arrow (verification fails) */}
			<path
				d="M 415 115 C 415 160, 255 170, 255 115"
				fill="none"
				stroke="rgba(218, 119, 86, 0.2)"
				strokeWidth="1"
				strokeDasharray="4 3"
			/>
			<polygon points="253,118 255,112 259,117" fill="rgba(218, 119, 86, 0.3)" />
			<text x="335" y="165" textAnchor="middle" fill="rgba(218, 119, 86, 0.35)" fontSize="8" fontFamily="monospace">
				if verification fails
			</text>

			{/* Success arrow */}
			<line x1="415" y1="115" x2="415" y2="135" stroke="rgba(245, 240, 232, 0.1)" strokeWidth="1" />
			<polygon points="412,133 415,139 418,133" fill="rgba(245, 240, 232, 0.1)" />
			<text x="415" y="152" textAnchor="middle" fill="rgba(245, 240, 232, 0.25)" fontSize="9" fontFamily="monospace">
				done
			</text>
		</svg>
	);
}
