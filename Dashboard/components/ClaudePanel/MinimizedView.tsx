'use client';

/**
 * Minimized View
 *
 * Vertical strip showing session icons when panel is minimized.
 * Click to expand and select a session.
 */

import { Briefcase, ChevronLeft, Code2, HelpCircle, Lightbulb, Plus, Target } from 'lucide-react';
import { ClaudeLogo } from './ClaudeLogo';
import { useRolesQuery } from '@/hooks/queries';
import { findRole } from '@/lib/roleConfig';

// =============================================================================
// TYPES
// =============================================================================

interface SessionLike {
	session_id: string;
	role?: string;
	session_subtype?: string;
	current_state?: string | null;
}

interface MinimizedViewProps {
	sessions: SessionLike[];
	selectedSessionId: string | null;
	onSelectSession: (sessionId: string, role: string) => void;
	onExpand: () => void;
	onSpawnChief: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Helper to render icon from role config
function renderRoleIcon(roleSlug: string, className: string, roles: any[] | undefined) {
	const role = findRole(roles, roleSlug);
	if (!role) return null;

	const { icon: iconName, is_logo } = role.display;

	// Chief uses logo
	if (is_logo) {
		return <ClaudeLogo className={className} />;
	}

	// Map icon names to components
	const iconMap: Record<string, any> = {
		'code-2': Code2,
		'target': Target,
		'briefcase': Briefcase,
		'lightbulb': Lightbulb,
		'help-circle': HelpCircle,
	};

	const Icon = iconMap[iconName];
	return Icon ? <Icon className={className} /> : null;
}

// Helper to get role color
function getRoleColor(roleSlug: string, roles: any[] | undefined): string {
	const role = findRole(roles, roleSlug);
	if (!role) return 'text-gray-400 dark:text-[#666]';

	const { color, is_logo } = role.display;

	// Chief uses special color
	if (is_logo) {
		return 'text-[#da7756]';
	}

	// Map base colors to Tailwind classes
	const colorMap: Record<string, string> = {
		cyan: 'text-blue-500',
		purple: 'text-green-500',
		blue: 'text-purple-500',
		orange: 'text-yellow-500',
	};

	return colorMap[color] || 'text-gray-400';
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MinimizedView({
	sessions,
	selectedSessionId,
	onSelectSession,
	onExpand,
	onSpawnChief,
}: MinimizedViewProps) {
	// Fetch roles dynamically
	const { data: roles } = useRolesQuery();

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

			{/* Session icons - vertical stack */}
			<div className="flex-1 flex flex-col items-center py-2 gap-1.5 overflow-y-auto">
				{sessions.map((session) => {
					const role = session.role || session.session_subtype || 'builder';
					const isChief = role === 'chief' || session.session_subtype === 'main';
					const normalizedRole = isChief ? 'chief' : role;
					const roleColor = getRoleColor(normalizedRole, roles);
					const isSelected = session.session_id === selectedSessionId;
					const isActive = session.current_state === 'active';
					const isToolActive = session.current_state === 'tool_active';

					return (
						<button
							key={session.session_id}
							onClick={() => {
								onSelectSession(session.session_id, role);
								onExpand();
							}}
							className={`
								group relative w-10 h-10 rounded-lg flex items-center justify-center transition-all
								${isSelected
									? 'bg-white dark:bg-[#1e1e1e] shadow-sm border border-gray-200 dark:border-[#404040]'
									: 'hover:bg-gray-100 dark:hover:bg-[#333]'
								}
							`}
							title={isChief ? 'Chief' : normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)}
						>
							{/* Icon with role color */}
							<span className={`${isSelected ? roleColor : 'text-gray-400 dark:text-[#666] group-hover:text-gray-600 dark:group-hover:text-[#999]'}`}>
								{renderRoleIcon(normalizedRole, 'w-4 h-4', roles)}
							</span>

							{/* Activity indicator */}
							{(isActive || isToolActive) && (
								<span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${isToolActive ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`} />
							)}

							{/* Selection indicator - left bar */}
							{isSelected && (
								<span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#da7756]" />
							)}
						</button>
					);
				})}

				{/* No sessions - show start Chief */}
				{sessions.length === 0 && (
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

			{/* Add specialist button at bottom */}
			{sessions.length > 0 && (
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

