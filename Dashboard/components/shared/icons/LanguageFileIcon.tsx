'use client';

import { memo } from 'react';

interface LanguageFileIconProps {
	label: string;
	className?: string;
}

function LanguageFileIconBase({ label, className }: LanguageFileIconProps) {
	const text = label.toUpperCase().slice(0, 4);
	return (
		<svg
			viewBox="0 0 24 24"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path
				d="M7 2h7l5 5v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
				fill="currentColor"
				fillOpacity="0.12"
			/>
			<path d="M14 2v6h6" />
			<text
				x="12"
				y="16.5"
				textAnchor="middle"
				fontSize="7.5"
				fontWeight="800"
				fontFamily="ui-sans-serif, system-ui"
				fill="currentColor"
			>
				{text}
			</text>
		</svg>
	);
}

export const LanguageFileIcon = memo(LanguageFileIconBase);

export function createLanguageFileIcon(label: string) {
	const Icon = ({ className }: { className?: string }) => (
		<LanguageFileIcon label={label} className={className} />
	);
	Icon.displayName = `LanguageFileIcon(${label})`;
	return Icon;
}
