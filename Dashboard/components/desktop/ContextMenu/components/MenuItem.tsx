'use client';

import { ChevronRight } from 'lucide-react';
import { MenuItemProps } from '../types';

export function MenuItem({ icon, label, shortcut, onClick, disabled, destructive, hasSubmenu }: MenuItemProps) {
	return (
		<button
			className="w-full flex items-center gap-3 py-1.5 text-left text-[13px] rounded-[5px] mx-1 px-2 transition-[background-color] duration-75"
			style={{
				color: disabled
					? 'var(--text-disabled)'
					: destructive
						? 'var(--color-error)'
						: 'var(--text-primary)',
				cursor: disabled ? 'not-allowed' : 'pointer',
				width: 'calc(100% - 8px)',
			}}
			onMouseEnter={(e) => {
				if (!disabled) {
					e.currentTarget.style.background = destructive
						? 'rgba(239, 68, 68, 0.1)'
						: 'var(--color-claude-dim)';
				}
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = 'transparent';
			}}
			onClick={disabled ? undefined : onClick}
			disabled={disabled}
		>
			<span className="w-4 h-4 shrink-0">{icon}</span>
			<span className="flex-1">{label}</span>
			{shortcut && !hasSubmenu && (
				<span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{shortcut}</span>
			)}
			{hasSubmenu && (
				<ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
			)}
		</button>
	);
}
