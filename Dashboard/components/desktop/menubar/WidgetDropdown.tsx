'use client';

import { useEffect, useRef } from 'react';

interface WidgetDropdownProps {
	icon: React.ReactNode;
	label?: React.ReactNode;
	title: string;
	isOpen: boolean;
	onToggle: () => void;
	onClose: () => void;
	children: React.ReactNode;
}

export function WidgetDropdown({ icon, label, title, isOpen, onToggle, onClose, children }: WidgetDropdownProps) {
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onClose]);

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				data-testid={`widget-${title.toLowerCase()}`}
				onClick={onToggle}
				aria-label={title}
				className="
					flex items-center gap-1.5 px-1.5 py-0.5 rounded-[4px]
					hover:bg-[var(--surface-muted)]
					transition-colors duration-75
					focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
				"
				title={title}
			>
				{icon}
				{label}
			</button>

			{isOpen && (
				<div
					className="
						absolute top-full right-0 mt-1
						w-[340px] max-h-[500px]
						bg-[var(--surface-raised)] border border-[var(--border-default)]
						rounded-xl shadow-2xl overflow-hidden
						z-[2000]
					"
					onClick={(e) => e.stopPropagation()}
				>
					{children}
				</div>
			)}
		</div>
	);
}
