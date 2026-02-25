'use client';

// Chapter 7: Three-tier memory diagram
export function MemoryLayers() {
	const layers = [
		{
			label: 'TODAY.md',
			description: "What's happening right now",
			color: 'rgba(218, 119, 86, 0.9)',
			bg: 'rgba(218, 119, 86, 0.12)',
			border: 'rgba(218, 119, 86, 0.3)',
			examples: ['Schedule: 10AM standup, 2PM review', 'Priority: Ship feature X', 'Open loop: Reply to Sarah'],
		},
		{
			label: 'MEMORY.md',
			description: 'Patterns proven over time',
			color: 'rgba(218, 119, 86, 0.7)',
			bg: 'rgba(218, 119, 86, 0.08)',
			border: 'rgba(218, 119, 86, 0.2)',
			examples: ['Works best in 60-min blocks', 'Avoids hard tasks after 3PM', 'Prefers options with a recommendation'],
		},
		{
			label: 'IDENTITY.md',
			description: 'Who you are, permanent',
			color: 'rgba(218, 119, 86, 0.5)',
			bg: 'rgba(218, 119, 86, 0.05)',
			border: 'rgba(218, 119, 86, 0.12)',
			examples: ['Software engineer', 'Values: honesty, depth, craft', 'Communication style: direct'],
		},
	];

	return (
		<div className="space-y-4 max-w-lg mx-auto">
			{layers.map((layer, i) => (
				<div key={i}>
					<div
						className="rounded-lg px-5 py-4"
						style={{
							backgroundColor: layer.bg,
							border: `1px solid ${layer.border}`,
						}}
					>
						<div className="flex items-baseline gap-3 mb-2">
							<span className="text-sm font-mono font-medium" style={{ color: layer.color }}>
								{layer.label}
							</span>
							<span className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>
								{layer.description}
							</span>
						</div>
						<div className="space-y-1">
							{layer.examples.map((ex, j) => (
								<p key={j} className="text-xs font-mono" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>
									{ex}
								</p>
							))}
						</div>
					</div>
					{/* Arrow between layers */}
					{i < layers.length - 1 && (
						<div className="flex justify-center py-1">
							<svg width="24" height="20" viewBox="0 0 24 20">
								<path d="M12 2 L12 16 M8 12 L12 16 L16 12" stroke="rgba(218, 119, 86, 0.2)" strokeWidth="1.5" fill="none" />
							</svg>
						</div>
					)}
				</div>
			))}
			<p className="text-center text-xs" style={{ color: 'rgba(245, 240, 232, 0.25)' }}>
				Information flows down as it gets confirmed, up as it gets questioned
			</p>
		</div>
	);
}
