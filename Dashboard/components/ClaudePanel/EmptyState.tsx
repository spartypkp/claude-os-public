'use client';

/**
 * Empty State Display
 * 
 * Shows fun "BRB" messages when no sessions exist,
 * or "Select a session" when sessions exist but none selected.
 */

import { Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BREAK_MESSAGES } from './constants';

interface EmptyStateProps {
	hasAnySession: boolean;
	onSpawnChief: () => void;
}

export function EmptyState({ hasAnySession, onSpawnChief }: EmptyStateProps) {
	// Pick a random message only on client to avoid hydration mismatch
	const [messageIndex, setMessageIndex] = useState(0);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMessageIndex(Math.floor(Math.random() * BREAK_MESSAGES.length));
		setMounted(true);
	}, []);

	const message = BREAK_MESSAGES[messageIndex];

	// Simple state when sessions exist but none selected
	if (hasAnySession) {
		return (
			<div className="h-full flex flex-col items-center justify-center px-8 text-center">
				<div className="text-4xl mb-4">👆</div>
				<h3 className="text-sm font-medium text-gray-900 dark:text-white">
					Select a session
				</h3>
				<p className="mt-1.5 text-xs text-gray-500 dark:text-[#888] max-w-[200px]">
					Click on a session above to view the conversation
				</p>
			</div>
		);
	}

	// Fun state when no sessions (Chief is down/resetting)
	return (
		<div className={`h-full flex flex-col items-center justify-center px-8 text-center transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
			{/* Retro TV static effect */}
			<div className="relative">
				<div className="w-24 h-20 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300 dark:from-[#2a2a2a] dark:to-[#1a1a1a] border-4 border-gray-400 dark:border-[#444] shadow-lg flex items-center justify-center overflow-hidden">
					{/* Screen with icon */}
					<div className="text-4xl animate-pulse">
						{message.icon}
					</div>
					{/* Scanlines effect */}
					<div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)] pointer-events-none" />
				</div>
				{/* TV antenna */}
				<div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-2">
					<div className="w-0.5 h-4 bg-gray-400 dark:bg-[#555] rotate-[-20deg] origin-bottom" />
					<div className="w-0.5 h-4 bg-gray-400 dark:bg-[#555] rotate-[20deg] origin-bottom" />
				</div>
				{/* TV stand */}
				<div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-2 bg-gray-400 dark:bg-[#444] rounded-b-sm" />
			</div>

			<h3 className="mt-8 text-sm font-medium text-gray-900 dark:text-white">
				{message.headline}
			</h3>
			<p className="mt-1 text-xs text-gray-500 dark:text-[#888] max-w-[200px]">
				{message.subtext}
			</p>

			{/* Anthropic attribution - small and subtle */}
			<div className="mt-3 text-[9px] text-gray-400 dark:text-[#666] tracking-wider uppercase">
				Powered by Anthropic
			</div>

			<button
				onClick={onSpawnChief}
				className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-b from-[#da7756] to-[#C15F3C] text-white text-xs font-medium shadow-lg shadow-[#da7756]/20 hover:shadow-xl hover:shadow-[#da7756]/30 hover:scale-105 transition-all"
			>
				<Crown className="w-3.5 h-3.5" />
				<span>Start Chief</span>
			</button>
		</div>
	);
}

