'use client';

// Chapter 16: 4-step custom app build flow
export function AppBuildFlow() {
	const steps = [
		{
			num: '1',
			label: 'Write a spec',
			desc: 'APP-SPEC.md',
			detail: 'One page, plain language',
		},
		{
			num: '2',
			label: 'Spawn a Builder',
			desc: 'Specialist reads spec',
			detail: 'Investigates, plans, builds',
		},
		{
			num: '3',
			label: 'Builder builds',
			desc: 'Full stack',
			detail: 'Database, API, MCP, React UI',
		},
		{
			num: '4',
			label: 'App appears',
			desc: 'In your Dashboard',
			detail: 'Connected to Claude',
		},
	];

	return (
		<div className="flex flex-col md:flex-row items-stretch gap-3 max-w-2xl mx-auto">
			{steps.map((step, i) => (
				<div key={i} className="flex-1 flex items-center gap-3">
					<div
						className="rounded-lg px-4 py-4 flex-1"
						style={{
							backgroundColor: i === 3 ? 'rgba(218, 119, 86, 0.08)' : 'rgba(245, 240, 232, 0.03)',
							border: `1px solid ${i === 3 ? 'rgba(218, 119, 86, 0.2)' : 'rgba(245, 240, 232, 0.06)'}`,
						}}
					>
						<span
							className="text-xs font-mono block mb-1.5"
							style={{ color: i === 3 ? '#da7756' : 'rgba(218, 119, 86, 0.5)' }}
						>
							{step.num}
						</span>
						<p
							className="text-sm font-medium mb-0.5"
							style={{ color: i === 3 ? '#da7756' : 'rgba(245, 240, 232, 0.7)' }}
						>
							{step.label}
						</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>
							{step.desc}
						</p>
						<p className="text-xs mt-0.5" style={{ color: 'rgba(245, 240, 232, 0.25)' }}>
							{step.detail}
						</p>
					</div>
					{/* Arrow between steps */}
					{i < steps.length - 1 && (
						<div className="hidden md:block shrink-0">
							<svg width="16" height="16" viewBox="0 0 16 16">
								<path d="M4 8 L12 8 M9 5 L12 8 L9 11" stroke="rgba(245, 240, 232, 0.15)" strokeWidth="1.5" fill="none" />
							</svg>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
