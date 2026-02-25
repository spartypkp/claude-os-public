'use client';

// Chapter 8: 6-step morning reset flow
export function MorningReset() {
	const steps = [
		{ num: '1', label: 'Archive yesterday', desc: 'Move completed items to history' },
		{ num: '2', label: 'Consolidate memory', desc: 'Curator audits patterns' },
		{ num: '3', label: 'Email triage', desc: 'Classify and surface what matters' },
		{ num: '4', label: 'Build schedule', desc: 'Time-block the day' },
		{ num: '5', label: 'Write the brief', desc: 'Summarize what matters' },
		{ num: '6', label: 'Send to phone', desc: 'Delivered via Telegram' },
	];

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl mx-auto">
			{steps.map((step, i) => (
				<div
					key={i}
					className="rounded-lg px-4 py-3.5 relative"
					style={{
						backgroundColor: 'rgba(218, 119, 86, 0.04)',
						border: '1px solid rgba(218, 119, 86, 0.1)',
					}}
				>
					<span
						className="text-xs font-mono block mb-1"
						style={{ color: 'rgba(218, 119, 86, 0.5)' }}
					>
						{step.num}
					</span>
					<p
						className="text-sm font-medium mb-0.5"
						style={{ color: 'rgba(245, 240, 232, 0.8)' }}
					>
						{step.label}
					</p>
					<p
						className="text-xs"
						style={{ color: 'rgba(245, 240, 232, 0.35)' }}
					>
						{step.desc}
					</p>
				</div>
			))}
		</div>
	);
}
