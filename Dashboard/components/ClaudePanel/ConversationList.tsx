'use client';

import type { ActiveSession, ActiveConversation } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import { useRolesQuery } from '@/hooks/queries';
import { getRoleConfigBySlug, findRole } from '@/lib/roleConfig';
import {
	Briefcase,
	Code2,
	HelpCircle,
	Lightbulb,
	Loader2,
	Minus,
	Plus,
	Target,
	X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

// Activity states - minimal, Claude Code style
type ActivityState = 'idle' | 'thinking' | 'working' | 'waiting';

// Simple dot indicator component
function ActivityDotIndicator({ state }: { state: ActivityState; }) {
	if (state === 'idle') {
		return <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-[#555]" />;
	}
	if (state === 'thinking') {
		return (
			<span className="flex items-center gap-0.5">
				<span className="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-pulse" />
				<span className="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-pulse" style={{ animationDelay: '150ms' }} />
				<span className="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-pulse" style={{ animationDelay: '300ms' }} />
			</span>
		);
	}
	if (state === 'waiting') {
		// Waiting for workers - slower pulse, muted color
		return <span className="w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" style={{ animationDuration: '2s' }} />;
	}
	// working
	return <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />;
}


// Derive activity state from session data
function getActivityState(session: ActiveSession | null | undefined, hasActiveWorkers?: boolean): ActivityState {
	if (!session) return 'idle';
	const state = session.current_state;
	if (!state || state === 'idle') {
		// If idle but workers are running, show waiting state
		if (hasActiveWorkers) return 'waiting';
		return 'idle';
	}
	if (state === 'active') return 'thinking';
	if (state === 'tool_active') return 'working';
	return 'idle';
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Claude logo
function ClaudeLogo({ className = "w-4 h-4" }: { className?: string; }) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
		</svg>
	);
}

// Helper to render icon from role config
function renderRoleIcon(roleSlug: string, className: string, roles: any[] | undefined) {
	const role = findRole(roles, roleSlug);
	if (!role) return null;

	const { icon: iconName, is_logo } = role.display;

	// Chief uses logo
	if (is_logo) {
		return <ClaudeLogo className={className} />;
	}

	// Map icon names to components for rendering
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

// Activity dot component
function ActivityDot({ state, className = '' }: { state: string | null; className?: string; }) {
	if (state === 'active') {
		return <span className={`w-2 h-2 rounded-full bg-green-500 animate-pulse ${className}`} />;
	}
	if (state === 'tool_active') {
		return <span className={`w-2 h-2 rounded-full bg-blue-500 animate-pulse ${className}`} />;
	}
	return null;
}

// Chief Hero Tab - larger with activity indicator
function ChiefHeroTab({
	session,
	isSelected,
	onSelect,
	resetCount = 0,
	hasActiveWorkers = false,
}: {
	session: ActiveSession;
	isSelected: boolean;
	onSelect: () => void;
	resetCount?: number;
	hasActiveWorkers?: boolean;
}) {
	const { openContextMenu } = useWindowStore();
	const activityState = getActivityState(session, hasActiveWorkers);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, 'panel-chief', undefined, {
			panelSessionId: session.session_id,
			panelSessionRole: 'chief',
			panelSessionStatus: session.status_text || 'Working...',
		});
	}, [openContextMenu, session.session_id, session.status_text]);

	return (
		<button
			onClick={onSelect}
			onContextMenu={handleContextMenu}
			className={`
        group relative flex items-center gap-3 px-4 py-2.5 min-w-[140px]
        transition-all rounded-t-lg
        ${isSelected
					? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-[#333] border-b-0 mb-[-1px] z-10'
					: 'bg-gray-200/50 dark:bg-[#252525] text-gray-600 dark:text-[#999] hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
				}
      `}
		>
			{/* Claude logo */}
			<span className={`flex-shrink-0 ${isSelected ? 'text-[#da7756]' : 'text-gray-400 dark:text-[#666]'}`}>
				<ClaudeLogo className="w-4 h-4" />
			</span>

			{/* Name */}
			<span className="font-medium text-sm">Chief</span>

			{/* Reset count */}
			{resetCount > 0 && (
				<span className="text-[9px] text-gray-400 dark:text-[#555]" title={`${resetCount} resets`}>
					×{resetCount + 1}
				</span>
			)}

			{/* Activity indicator - simple dots */}
			<div className="ml-auto">
				<ActivityDotIndicator state={activityState} />
			</div>
		</button>
	);
}

// Specialist tab - smaller, simpler
function SpecialistTab({
	session,
	role,
	isSelected,
	onSelect,
	onClose,
	resetCount = 0,
	roles,
}: {
	session: ActiveSession;
	role: string;
	isSelected: boolean;
	onSelect: () => void;
	onClose?: () => void;
	resetCount?: number;
	roles: any[] | undefined;
}) {
	const [isHovered, setIsHovered] = useState(false);
	const { openContextMenu } = useWindowStore();
	const roleData = findRole(roles, role);
	const roleName = roleData?.name || role;

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, 'panel-specialist', undefined, {
			panelSessionId: session.session_id,
			panelSessionRole: role,
			panelSessionStatus: session.status_text || 'Working...',
		});
	}, [openContextMenu, session.session_id, role, session.status_text]);

	const handleCloseClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onClose?.();
	};

	return (
		<button
			onClick={onSelect}
			onContextMenu={handleContextMenu}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className={`
        group relative flex items-center gap-2 px-3 py-2 text-xs font-medium self-end
        transition-colors min-w-0 max-w-[140px] rounded-t-lg
        ${isSelected
					? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-[#333] border-b-0 mb-[-1px] z-10'
					: 'bg-gray-200/50 dark:bg-[#252525] text-gray-600 dark:text-[#999] hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
				}
      `}
		>
			{/* Activity dot */}
			<ActivityDot state={session.current_state || null} className="flex-shrink-0" />

			{/* Icon */}
			<span className={`flex-shrink-0 ${isSelected ? 'text-[#da7756]' : 'text-gray-400 dark:text-[#666]'}`}>
				{renderRoleIcon(role, 'w-3.5 h-3.5', roles)}
			</span>

			{/* Name */}
			<span className="truncate">{roleName}</span>

			{/* Reset count */}
			{resetCount > 0 && (
				<span className="flex-shrink-0 text-[9px] text-gray-400 dark:text-[#666]">
					×{resetCount + 1}
				</span>
			)}

			{/* Close button */}
			{onClose && (isHovered || isSelected) && (
				<span
					onClick={handleCloseClick}
					className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[#444] ml-auto"
				>
					<X className="w-3 h-3" />
				</span>
			)}
		</button>
	);
}

// TODO (Phase 5): Update to accept ActiveConversation[] once hook provides grouping
interface ConversationListProps {
	sessions: ActiveSession[];
	selectedSessionId: string | null;
	onSelectSession: (sessionId: string, role: string) => void;
	onEndSession: (sessionId: string) => void;
	onForceHandoff: (sessionId: string) => void;
	onResetChief: () => void;
	onSpawnChief: () => Promise<void>;
	onRefresh: () => void;
	isChiefRunning: boolean;
	onMinimize?: () => void;
	activeWorkerCount?: number;
	sseConnected?: boolean;
}

export function ConversationList({
	sessions,
	selectedSessionId,
	onSelectSession,
	onEndSession,
	onSpawnChief,
	onRefresh,
	onMinimize,
	activeWorkerCount = 0,
	sseConnected = true,
}: ConversationListProps) {
	const [showSpawnDropdown, setShowSpawnDropdown] = useState(false);
	const [spawningRole, setSpawningRole] = useState<string | null>(null);
	const [spawningChief, setSpawningChief] = useState(false);

	// Fetch roles dynamically
	const { data: roles } = useRolesQuery();

	// Get specialist roles (exclude chief)
	const specialistRoles = roles?.filter(r => r.slug !== 'chief') || [];

	// Separate Chief from Specialists (active sessions only)
	const activeSessions = sessions.filter(s => !s.ended_at);

	const chiefSession = activeSessions.find(s =>
		s.role === 'chief' || s.session_subtype === 'chief' || s.session_subtype === 'main'
	);

	const specialists = activeSessions.filter(s =>
		s.role !== 'chief' && s.session_subtype !== 'chief' && s.session_subtype !== 'main'
	).sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

	// Compute reset counts for each conversation (how many ended sessions share the same conversation_id)
	const getResetCount = (session: ActiveSession): number => {
		if (!session.conversation_id) return 0;
		// Count ended sessions with same conversation_id (these are previous resets)
		return sessions.filter(s =>
			s.conversation_id === session.conversation_id &&
			s.ended_at &&
			s.session_id !== session.session_id
		).length;
	};

	// Spawn a new specialist
	const handleSpawn = async (role: string) => {
		setSpawningRole(role);
		try {
			const response = await fetch(`${API_BASE}/api/system/sessions/spawn`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role, mode: 'interactive' }),
			});
			const data = await response.json();
			if (data.success) {
				onRefresh();
				if (data.session_id) {
					onSelectSession(data.session_id, role);
				}
			}
		} catch (err) {
			console.error('Failed to spawn specialist:', err);
		} finally {
			setSpawningRole(null);
			setShowSpawnDropdown(false);
		}
	};

	// Handle spawning Chief
	const handleSpawnChief = async () => {
		setSpawningChief(true);
		try {
			await onSpawnChief();
		} finally {
			setSpawningChief(false);
		}
	};

	// Handle ending a specialist session
	const handleEndSession = (sessionId: string, role: string) => {
		if (window.confirm(`End ${role} session?`)) {
			onEndSession(sessionId);
		}
	};

	// Find selected session for status bar
	const selectedSession = selectedSessionId
		? sessions.find(s => s.session_id === selectedSessionId)
		: null;

	// Get activity info
	const hasActiveWorkers = activeWorkerCount > 0;
	const activityState = getActivityState(selectedSession, hasActiveWorkers);
	const isWorking = activityState !== 'idle';
	const statusText = selectedSession?.status_text || 'Ready';

	return (
		<div className="flex flex-col">
			{/* Tab bar - Chrome style */}
			<div className="flex items-end gap-1 px-2 pt-1.5 bg-gray-100 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-[#333]">
				{/* Chief hero tab or Start Chief button */}
				{chiefSession ? (
					<ChiefHeroTab
						session={chiefSession}
						isSelected={selectedSessionId === chiefSession.session_id}
						onSelect={() => onSelectSession(chiefSession.session_id, 'chief')}
						resetCount={getResetCount(chiefSession)}
						hasActiveWorkers={hasActiveWorkers}
					/>
				) : (
					<button
						onClick={handleSpawnChief}
						disabled={spawningChief}
						className={`
              flex flex-col gap-0.5 px-4 py-2 min-w-[140px]
              bg-gradient-to-b from-[#da7756] to-[#C15F3C] text-white
              hover:from-[#e08566] hover:to-[#d16f4c]
              rounded-t-lg transition-colors disabled:opacity-50
              border-t border-l border-r border-[#da7756]/30 mb-[-1px] z-10
            `}
					>
						<div className="flex items-center gap-2">
							{spawningChief ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<ClaudeLogo className="w-4 h-4" />
							)}
							<span className="font-semibold text-sm">Start Chief</span>
						</div>
						<span className="text-[10px] text-white/70">Click to begin</span>
					</button>
				)}

				{/* Specialist tabs */}
				{specialists.map((session) => {
					const role = session.role || session.session_subtype || 'builder';
					return (
						<SpecialistTab
							key={session.session_id}
							session={session}
							role={role}
							isSelected={selectedSessionId === session.session_id}
							onSelect={() => onSelectSession(session.session_id, role)}
							onClose={() => handleEndSession(session.session_id, role)}
							resetCount={getResetCount(session)}
							roles={roles}
						/>
					);
				})}

				{/* New specialist button */}
				<div className="relative self-end mb-px">
					<button
						onClick={() => setShowSpawnDropdown(!showSpawnDropdown)}
						className="flex items-center justify-center w-8 h-8 rounded-lg
              text-gray-400 dark:text-[#666] hover:text-gray-600 dark:hover:text-white
              hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
						title="New specialist"
					>
						<Plus className="w-4 h-4" />
					</button>

					{/* Spawn dropdown */}
					{showSpawnDropdown && (
						<>
							<div
								className="fixed inset-0 z-40"
								onClick={() => setShowSpawnDropdown(false)}
							/>
							<div className="absolute left-0 top-full mt-1 z-50 w-52 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#404040] rounded-lg shadow-xl overflow-hidden">
								<div className="px-3 py-2 border-b border-gray-100 dark:border-[#333] bg-gray-50 dark:bg-[#252525]">
									<span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-[#666]">
										New Specialist
									</span>
								</div>
								<div className="py-1">
									{specialistRoles.map((role) => (
										<button
											key={role.slug}
											onClick={() => handleSpawn(role.slug)}
											disabled={spawningRole !== null}
											className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
										>
											<span className="text-[#da7756] flex-shrink-0">
												{spawningRole === role.slug ? (
													<Loader2 className="w-4 h-4 animate-spin" />
												) : (
													renderRoleIcon(role.slug, 'w-4 h-4', roles)
												)}
											</span>
											<div className="flex-1 min-w-0">
												<div className="text-[11px] font-medium text-gray-900 dark:text-white">
													{role.name}
												</div>
												<div className="text-[10px] text-gray-500 dark:text-[#888]">
													{role.slug}
												</div>
											</div>
										</button>
									))}
								</div>
							</div>
						</>
					)}
				</div>

				{/* Spacer */}
				<div className="flex-1" />

				{/* SSE Connection Indicator */}
				<div
					className="flex items-center self-end mb-px mr-2"
					title={sseConnected ? "Real-time updates connected" : "Reconnecting..."}
				>
					<span
						className={`w-2 h-2 rounded-full transition-colors ${
							sseConnected
								? 'bg-green-500'
								: 'bg-amber-500 animate-pulse'
						}`}
					/>
				</div>

				{/* Minimize button */}
				{onMinimize && (
					<button
						onClick={onMinimize}
						className="flex items-center justify-center w-8 h-8 rounded-lg self-end mb-px
              text-gray-400 dark:text-[#555] hover:text-gray-600 dark:hover:text-[#888]
              hover:bg-gray-200 dark:hover:bg-[#333] transition-colors mr-1"
						title="Minimize panel"
					>
						<Minus className="w-3.5 h-3.5" />
					</button>
				)}
			</div>

			{/* Status strip - just the status text */}
			{selectedSession && (
				<div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-[#1e1e1e]">
					<div className={`w-0.5 h-4 rounded-full ${isWorking ? 'bg-[#da7756]' : 'bg-gray-200 dark:bg-[#444]'}`} />
					<span className={`text-[13px] truncate ${isWorking ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#666]'}`}>
						{statusText}
					</span>
				</div>
			)}
		</div>
	);
}

export default ConversationList;
