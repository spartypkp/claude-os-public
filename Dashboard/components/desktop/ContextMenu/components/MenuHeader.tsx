'use client';

export function BrandedHeader({ icon, title, subtitle, color }: {
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	color: string;
}) {
	return (
		<div className={`px-3 py-2 flex items-center gap-2.5 ${color}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
			<div className="w-5 h-5 shrink-0">
				{icon}
			</div>
			<div className="flex-1 min-w-0">
				<div className="text-[12px] font-semibold truncate">{title}</div>
				<div className="text-[10px] opacity-70">{subtitle}</div>
			</div>
		</div>
	);
}
