'use client';

import { useRef, useState } from 'react';
import { MenuItem } from './MenuItem';

export function Submenu({ label, icon, children, onSelect }: {
	label: string;
	icon: React.ReactNode;
	children: { label: string; icon?: React.ReactNode; value: string; }[];
	onSelect: (value: string) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const submenuRef = useRef<HTMLDivElement>(null);

	return (
		<div
			className="relative"
			onMouseEnter={() => setIsOpen(true)}
			onMouseLeave={() => setIsOpen(false)}
		>
			<MenuItem
				icon={icon}
				label={label}
				onClick={() => { }}
				hasSubmenu
			/>
			{isOpen && (
				<div
					ref={submenuRef}
					className="absolute left-full top-0 ml-1 min-w-[160px] py-1.5 rounded-lg z-[10001] backdrop-blur-xl"
					style={{
						background: 'var(--surface-raised)',
						border: '1px solid var(--border-default)',
						boxShadow: '0 10px 25px rgba(0,0,0,0.15), 0 0 0 1px var(--border-subtle)',
						animation: 'contextMenuIn 100ms ease-out',
					}}
					onMouseDown={(e) => e.stopPropagation()}
				>
					{children.map((item) => (
						<button
							key={item.value}
							className="w-full flex items-center gap-3 py-1.5 text-left text-[13px] rounded-[5px] mx-1 px-2 transition-[background-color] duration-75"
							style={{ color: 'var(--text-primary)', width: 'calc(100% - 8px)' }}
							onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-claude-dim)'; }}
							onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
							onClick={(e) => {
								e.stopPropagation();
								onSelect(item.value);
								setIsOpen(false);
							}}
							onMouseDown={(e) => e.stopPropagation()}
						>
							{item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
							<span className="flex-1">{item.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
