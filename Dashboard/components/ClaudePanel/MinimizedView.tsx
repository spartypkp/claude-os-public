'use client';

/**
 * Minimized View
 *
 * Vertical strip showing conversation icons when panel is minimized.
 * Click to expand and select a conversation.
 */

import type { ActiveConversation } from '@/lib/types';
import { ChevronLeft, Plus } from 'lucide-react';
import { ClaudeLogo } from './ClaudeLogo';
import { getRoleConfig } from '@/lib/sessionUtils';

interface MinimizedViewProps {
	conversations: ActiveConversation[];
	selectedConversationId: string | null;
	onSelectConversation: (conversationId: string, role: string) => void;
	onExpand: () => void;
	onSpawnChief: () => void;
}

function renderRoleIcon(roleSlug: string, className: string) {
	const config = getRoleConfig(roleSlug);
	if (config.isLogo) return <ClaudeLogo className={className} />;
	const Icon = config.icon;
	return <Icon className={className} />;
}

export function MinimizedView({
	conversations,
	selectedConversationId,
	onSelectConversation,
	onExpand,
	onSpawnChief,
}: MinimizedViewProps) {
	return (
		<div className="flex flex-col h-full bg-gray-50 dark:bg-[#2d2d2d]">
			{/* Header with expand button */}
			<div className="h-8 flex items-center justify-center border-b border-gray-200 dark:border-[#3a3a3a]">
				<button
					onClick={onExpand}
					className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-[#404040] transition-colors"
					title="Expand panel"
				>
					<ChevronLeft className="w-3.5 h-3.5 text-gray-500 dark:text-[#888]" />
				</button>
			</div>

			{/* Conversation icons - vertical stack */}
			<div className="flex-1 flex flex-col items-center py-2 gap-1.5 overflow-y-auto">
				{conversations.map((conv) => {
					const role = conv.role || 'builder';
					const isSelected = conv.conversation_id === selectedConversationId;
					const isActive = conv.current_state === 'active' || conv.current_state === 'tool_active';

					return (
						<button
							key={conv.conversation_id}
							onClick={() => {
								onSelectConversation(conv.conversation_id, role);
								onExpand();
							}}
							className={`
								group relative w-10 h-10 rounded-lg flex items-center justify-center transition-all
								${isSelected
									? 'bg-white dark:bg-[#1e1e1e] shadow-sm border border-gray-200 dark:border-[#404040]'
									: 'hover:bg-gray-100 dark:hover:bg-[#333]'
								}
							`}
							title={getRoleConfig(role).label}
						>
							<span className={`${isSelected ? 'text-[#da7756]' : 'text-gray-400 dark:text-[#666] group-hover:text-gray-600 dark:group-hover:text-[#999]'}`}>
								{renderRoleIcon(role, 'w-4 h-4')}
							</span>

							{isActive && (
								<span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#da7756] animate-pulse" />
							)}

							{isSelected && (
								<span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#da7756]" />
							)}
						</button>
					);
				})}

				{conversations.length === 0 && (
					<button
						onClick={() => {
							onSpawnChief();
							onExpand();
						}}
						className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-b from-[#da7756] to-[#C15F3C] text-white hover:opacity-90 transition-opacity shadow-sm"
						title="Start Chief"
					>
						<ClaudeLogo className="w-4 h-4" />
					</button>
				)}
			</div>

			{conversations.length > 0 && (
				<div className="border-t border-gray-200 dark:border-[#3a3a3a] p-2">
					<button
						onClick={onExpand}
						className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#333] transition-colors text-gray-400 dark:text-[#666] hover:text-gray-600 dark:hover:text-[#999]"
						title="Add specialist"
					>
						<Plus className="w-4 h-4" />
					</button>
				</div>
			)}
		</div>
	);
}
