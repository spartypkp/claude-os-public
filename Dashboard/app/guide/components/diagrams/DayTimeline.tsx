'use client';

// Chapter 3: A Day with Claude OS timeline
export function DayTimeline() {
	const events = [
		{ time: '6 AM', label: 'Morning reset runs automatically', icon: 'reset', accent: true },
		{ time: '7 AM', label: 'Brief arrives on your phone', icon: 'phone' },
		{ time: '10 AM', label: 'Chief helps prioritize the day', icon: 'chief', accent: true },
		{ time: '11 AM', label: 'Specialist works on a focused task', icon: 'specialist' },
		{ time: '2 PM', label: 'Background research running', icon: 'research' },
		{ time: '8 PM', label: 'Evening check-in closes the day', icon: 'checkin', accent: true },
	];

	return (
		<div className="max-w-md mx-auto">
			{events.map((event, i) => (
				<div key={i} className="flex items-start gap-4 relative">
					{/* Timeline line */}
					{i < events.length - 1 && (
						<div
							className="absolute left-[39px] top-8 w-px"
							style={{
								height: '48px',
								backgroundColor: 'rgba(245, 240, 232, 0.08)',
							}}
						/>
					)}

					{/* Time label */}
					<div
						className="text-xs font-mono w-12 pt-2 text-right shrink-0"
						style={{ color: event.accent ? 'rgba(218, 119, 86, 0.7)' : 'rgba(245, 240, 232, 0.3)' }}
					>
						{event.time}
					</div>

					{/* Dot */}
					<div
						className="w-3 h-3 rounded-full shrink-0 mt-2.5"
						style={{
							backgroundColor: event.accent ? '#da7756' : 'rgba(245, 240, 232, 0.15)',
							boxShadow: event.accent ? '0 0 8px rgba(218, 119, 86, 0.3)' : 'none',
						}}
					/>

					{/* Event label */}
					<p
						className="text-sm pt-1.5 pb-8"
						style={{ color: event.accent ? 'rgba(245, 240, 232, 0.8)' : 'rgba(245, 240, 232, 0.5)' }}
					>
						{event.label}
					</p>
				</div>
			))}
		</div>
	);
}
