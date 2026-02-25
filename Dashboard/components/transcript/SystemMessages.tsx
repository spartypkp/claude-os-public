'use client';

/**
 * System Message Components — shared renderers for system messages in transcripts.
 *
 * Used by TranscriptViewer (production) and UI Test Suite (visual audit).
 * Single source of truth — any changes here affect both.
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LucideIcon } from 'lucide-react';
import {
	AlertTriangle,
	ArrowDown,
	ArrowRight,
	Bell,
	Brain,
	Bug,
	Calendar,
	Check,
	Clock,
	ExternalLink,
	Info,
	Lightbulb,
	Mail,
	MessageCircle,
	Play,
	RefreshCw,
	Timer,
	User,
	UserPlus,
	X,
	Zap,
} from 'lucide-react';
import {
	parseSpecialistNotification,
	parseSpecialistReply,
	parseTeamMessage,
	parseTeamRequest,
	parseTaskNotification,
	parseContextPrefix,
	summarizeSystemMessage,
	parseSystemPrefix,
	isContextMessage,
	isSpecialistNotification,
	isSpecialistReply,
	isTeamMessage,
	isTeamRequest,
	isTaskNotification,
	normalizeMessageContent,
} from '@/lib/systemMessages';
import { getRoleConfig } from '@/lib/sessionUtils';
import { MarkdownLink } from './MarkdownLink';

// =============================================================================
// SHARED CONSTANTS
// =============================================================================

/**
 * Map from Lucide icon key strings (returned by summarizeSystemMessage)
 * to actual Lucide components.
 */
export const SYSTEM_ICON_MAP: Record<string, LucideIcon> = {
	'clock': Clock,
	'timer': Timer,
	'calendar': Calendar,
	'alert-triangle': AlertTriangle,
	'refresh-cw': RefreshCw,
	'bell': Bell,
	'zap': Zap,
	'info': Info,
	'arrow-right': ArrowRight,
	'user-plus': UserPlus,
	'check': Check,
	'x-circle': X,
	'play': Play,
	'brain': Brain,
	'arrow-down': ArrowDown,
	'bug': Bug,
	'lightbulb': Lightbulb,
	'external-link': ExternalLink,
	'message-circle': MessageCircle,
};

const MARKDOWN_COMPONENTS = {
	a: MarkdownLink,
};

// =============================================================================
// SHARED UTILITIES
// =============================================================================

function formatTime(timestamp?: string): string {
	if (!timestamp) return '';
	try {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
	} catch { return ''; }
}

// =============================================================================
// SYSTEM MESSAGE COMPONENTS
// =============================================================================

/**
 * Wake Divider — tiny inline timestamp, nearly invisible.
 * Replaces the full pill treatment for WAKE messages.
 */
export function WakeDivider({ timestamp }: { timestamp?: string }) {
	const formattedTime = formatTime(timestamp);

	return (
		<div className="flex items-center gap-3 my-1 px-4">
			<div className="flex-1 h-px bg-[var(--border-subtle)] opacity-40" />
			<div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] opacity-50">
				<Clock className="w-2.5 h-2.5" />
				{formattedTime && <span>{formattedTime}</span>}
			</div>
			<div className="flex-1 h-px bg-[var(--border-subtle)] opacity-40" />
		</div>
	);
}

/**
 * Warning Message — amber/red accent for WARNING and FORCE-HANDOFF.
 * Demands attention. Uses AlertTriangle icon.
 */
export function WarningMessage({ content, timestamp }: { content: string; timestamp?: string }) {
	const { summary } = summarizeSystemMessage(content);
	const parsed = parseSystemPrefix(content);
	const isForceHandoff = parsed?.type === 'FORCE-HANDOFF';
	const color = isForceHandoff ? 'var(--color-error)' : 'var(--color-warning)';
	const formattedTime = formatTime(timestamp);

	return (
		<div className="flex justify-center my-2">
			<div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
				style={{
					color,
					backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
					border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
				}}>
				<AlertTriangle className="w-3 h-3" />
				<span className="font-medium">{summary}</span>
				{formattedTime && (
					<span className="text-[10px] opacity-60 ml-1">{formattedTime}</span>
				)}
			</div>
		</div>
	);
}

/**
 * System message — center aligned, compact, muted.
 * For handoffs, wakes, worker notifications, session context.
 *
 * variant='plumbing' — extra muted for CRON, INFO, session plumbing.
 */
export function SystemMessage({
	content,
	isExpanded,
	onToggle,
	variant = 'default',
}: {
	content: string;
	isExpanded?: boolean;
	onToggle?: () => void;
	variant?: 'default' | 'plumbing';
}) {
	const { icon: iconKey, summary } = summarizeSystemMessage(content);
	const IconComponent = SYSTEM_ICON_MAP[iconKey];

	if (variant === 'plumbing') {
		return (
			<div className="flex justify-center my-1">
				<div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-[var(--text-muted)] opacity-50">
					{IconComponent && <IconComponent className="w-2.5 h-2.5" />}
					<span>{summary}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-center my-2">
			<div className="flex items-center gap-3 max-w-[90%]">
				<div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-transparent to-[var(--border-subtle)]" />
				<button
					onClick={onToggle}
					disabled={!onToggle}
					className={`
						group flex items-center gap-2 px-3 py-1.5 text-[11px]
						text-[var(--text-muted)] bg-[var(--surface-subtle)]
						border border-[var(--border-subtle)] rounded-full
						${onToggle ? 'hover:bg-[var(--surface-accent)] hover:border-[var(--border-default)] cursor-pointer' : 'cursor-default'}
						transition-all duration-150
					`}
				>
					{IconComponent ? (
						<IconComponent className="w-3 h-3" />
					) : (
						<span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
					)}
					<span className="font-medium">{summary}</span>
				</button>
				<div className="hidden sm:block flex-1 h-px bg-gradient-to-l from-transparent to-[var(--border-subtle)]" />
			</div>
		</div>
	);
}

/**
 * Shared card wrapper for all team/specialist system messages.
 * Ensures consistent structure: orange-tinted card → header → body → optional footer.
 */
function TeamCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="my-3">
			<div className="rounded-lg border border-[var(--color-claude)]/15 bg-[var(--color-claude)]/5 p-3 max-w-[90%]">
				{children}
			</div>
		</div>
	);
}

function TeamCardHeader({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2 mb-2">
			{children}
		</div>
	);
}

function RoleIconBadge({ icon: Icon }: { icon: LucideIcon }) {
	return (
		<div
			className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
			style={{ backgroundColor: 'color-mix(in srgb, var(--color-claude) 12%, transparent)' }}
		>
			<Icon className="w-3.5 h-3.5 text-[var(--color-claude)]" />
		</div>
	);
}

function TeamCardBody({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
			{children}
		</p>
	);
}

/**
 * Specialist Report — renders specialist completion/failure notifications.
 */
export function SpecialistReport({ content, timestamp }: { content: string; timestamp?: string }) {
	const notification = parseSpecialistNotification(content);
	if (!notification) return <SystemMessage content={content} />;

	const { role, passed, summary, workspace } = notification;
	const roleConfig = getRoleConfig(role);
	const formattedTime = formatTime(timestamp);

	return (
		<TeamCard>
			<TeamCardHeader>
				<RoleIconBadge icon={roleConfig.icon} />
				<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
					{roleConfig.label}
				</span>
				{passed ? (
					<span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded-full">
						<Check className="w-3 h-3" />
						Passed
					</span>
				) : (
					<span className="flex items-center gap-0.5 text-[10px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
						<X className="w-3 h-3" />
						Failed
					</span>
				)}
				{formattedTime && (
					<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
				)}
			</TeamCardHeader>
			{summary && <TeamCardBody>{summary}</TeamCardBody>}
			{workspace && (
				<div className="mt-2 pt-2 border-t border-[var(--color-claude)]/10 flex items-center gap-1.5">
					<span className="text-[10px] text-[var(--text-muted)] font-mono truncate">
						{workspace}
					</span>
				</div>
			)}
		</TeamCard>
	);
}

/**
 * Specialist Reply — renders injected "Reply from {role}" messages.
 */
export function SpecialistReplyCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const reply = parseSpecialistReply(content);
	if (!reply) return <SystemMessage content={content} />;

	const { role, sessionId, message } = reply;
	const roleConfig = getRoleConfig(role);
	const formattedTime = formatTime(timestamp);

	return (
		<TeamCard>
			<TeamCardHeader>
				<RoleIconBadge icon={roleConfig.icon} />
				<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
					{roleConfig.label}
				</span>
				<span className="text-[10px] font-mono text-[var(--text-muted)]">
					{sessionId.slice(0, 8)}
				</span>
				{formattedTime && (
					<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
				)}
			</TeamCardHeader>
			<TeamCardBody>{message}</TeamCardBody>
		</TeamCard>
	);
}

/**
 * Team Message Card — renders direct team communication between sessions.
 */
export function TeamMessageCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseTeamMessage(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { sourceRole, targetRole, message } = parsed;
	const sourceConfig = getRoleConfig(sourceRole);
	const targetConfig = getRoleConfig(targetRole);
	const formattedTime = formatTime(timestamp);

	return (
		<TeamCard>
			<TeamCardHeader>
				<RoleIconBadge icon={sourceConfig.icon} />
				<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
					{sourceConfig.label}
				</span>
				<ArrowRight className="w-3 h-3 text-[var(--color-claude)]/50" />
				<RoleIconBadge icon={targetConfig.icon} />
				<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
					{targetConfig.label}
				</span>
				{formattedTime && (
					<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
				)}
			</TeamCardHeader>
			<TeamCardBody>{message}</TeamCardBody>
		</TeamCard>
	);
}

/**
 * Team Request Card — renders spawn requests from non-Chief specialists.
 */
export function TeamRequestCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseTeamRequest(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { requestingRole, requestedRole, purpose } = parsed;
	const reqConfig = getRoleConfig(requestingRole);
	const formattedTime = formatTime(timestamp);

	return (
		<TeamCard>
			<TeamCardHeader>
				<RoleIconBadge icon={reqConfig.icon} />
				<span className="text-[12px] font-semibold text-[var(--text-secondary)]">
					{reqConfig.label}
				</span>
				<span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-claude)] bg-[var(--color-claude)]/10 px-1.5 py-0.5 rounded-full">
					Spawn Request
				</span>
				{formattedTime && (
					<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
				)}
			</TeamCardHeader>
			<TeamCardBody>
				Wants <span className="font-semibold capitalize">{requestedRole}</span> for &ldquo;{purpose}&rdquo;
			</TeamCardBody>
		</TeamCard>
	);
}

/**
 * Task Notification Card — renders subagent completion results.
 * Collapsible: shows summary + stats in header, expands to full markdown result.
 */
export function TaskNotificationCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const notification = parseTaskNotification(content);
	const [isExpanded, setIsExpanded] = useState(false);

	if (!notification) return <SystemMessage content={content} />;

	const { status, summary, result, totalTokens, toolUses, durationMs } = notification;
	const isSuccess = status === 'completed';
	const formattedTime = formatTime(timestamp);

	const duration = durationMs ? (
		durationMs > 60000
			? `${Math.round(durationMs / 60000)}m`
			: `${Math.round(durationMs / 1000)}s`
	) : null;

	const cleanSummary = summary.replace(/^Agent "/, '"');

	return (
		<div className="my-3">
			<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] max-w-[90%] overflow-hidden">
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className="w-full flex items-center gap-2 p-3 text-left hover:bg-[var(--surface-accent)] transition-colors"
				>
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}
					>
						<Zap className="w-3.5 h-3.5 text-[var(--color-primary)]" />
					</div>

					<span className="text-[12px] font-semibold text-[var(--text-secondary)] flex-1 truncate">
						{cleanSummary}
					</span>

					{isSuccess ? (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
							<Check className="w-3 h-3" />
						</span>
					) : (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
							<X className="w-3 h-3" />
						</span>
					)}

					<div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] flex-shrink-0">
						{duration && <span>{duration}</span>}
						{toolUses !== undefined && <span>{toolUses} tools</span>}
						{formattedTime && (
							<>
								<span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)]" />
								<span>{formattedTime}</span>
							</>
						)}
					</div>

					<ArrowRight
						className={`w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
					/>
				</button>

				{isExpanded && result && (
					<div className="border-t border-[var(--border-subtle)] px-4 py-3 max-h-96 overflow-y-auto">
						<div className="text-[12px] text-[var(--text-secondary)] leading-relaxed prose prose-sm prose-invert max-w-none
							[&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2
							[&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
							[&_p]:my-1.5 [&_li]:my-0.5 [&_ul]:my-1 [&_ol]:my-1
							[&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1
							[&_code]:text-[11px] [&_code]:bg-[var(--surface-muted)] [&_code]:px-1 [&_code]:rounded
							[&_hr]:my-3 [&_hr]:border-[var(--border-subtle)]
							[&_a]:text-[var(--color-primary)] [&_a]:underline">
							<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
								{result}
							</ReactMarkdown>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Context Card — renders [CONTEXT:App] messages from AttachToChat.
 * Visually distinct from user/system messages: left-aligned, app-tinted accent.
 */
export function ContextCard({ content, timestamp }: { content: string; timestamp?: string }) {
	const parsed = parseContextPrefix(content);
	if (!parsed) return <SystemMessage content={content} />;

	const { app, body } = parsed;

	const appConfig: Record<string, { icon: typeof Mail; color: string }> = {
		Email: { icon: Mail, color: 'var(--color-primary)' },
		Calendar: { icon: Calendar, color: 'var(--color-error)' },
		Contact: { icon: User, color: 'var(--color-success)' },
		Project: { icon: Zap, color: '#10b981' },
	};
	const config = appConfig[app] || { icon: ExternalLink, color: '#6b7280' };
	const AppIcon = config.icon;
	const formattedTime = formatTime(timestamp);

	return (
		<div className="my-2">
			<div className="max-w-[90%]">
				<div className="flex items-center gap-2 mb-1.5">
					<div
						className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
						style={{ backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
					>
						<AppIcon className="w-3.5 h-3.5" style={{ color: config.color }} />
					</div>
					<span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
						style={{ color: config.color, backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)` }}>
						{app}
					</span>
					{formattedTime && (
						<span className="text-[10px] text-[var(--text-muted)] ml-auto">{formattedTime}</span>
					)}
				</div>
				<div className="ml-7 rounded-lg border px-3 py-2"
					style={{ borderColor: `color-mix(in srgb, ${config.color} 15%, transparent)`, backgroundColor: `color-mix(in srgb, ${config.color} 5%, transparent)` }}>
					<p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
						{body}
					</p>
				</div>
			</div>
		</div>
	);
}


// =============================================================================
// SYSTEM MESSAGE ROUTER
// =============================================================================

/**
 * Routes a system message string to the correct production component.
 * Single source of truth — used by TranscriptViewer and UI Test Suite.
 *
 * Priority chain: Context → Specialist → Reply → Team → TeamReq → Task → Wake → Warning → Plumbing → Default
 */
export function renderSystemMessage(content: string, timestamp?: string): React.ReactNode {
	const normalized = normalizeMessageContent(content);

	const isCtx = isContextMessage(normalized);
	const isSpec = !isCtx && isSpecialistNotification(normalized);
	const isReply = !isCtx && !isSpec && isSpecialistReply(normalized);
	const isTeam = !isCtx && !isSpec && !isReply && isTeamMessage(normalized);
	const isReq = !isCtx && !isSpec && !isReply && !isTeam && isTeamRequest(normalized);
	const isTask = !isCtx && !isSpec && !isReply && !isTeam && !isReq && isTaskNotification(normalized);

	const isGeneric = !isCtx && !isSpec && !isReply && !isTeam && !isReq && !isTask;
	const systemParsed = isGeneric ? parseSystemPrefix(normalized) : null;
	const isWake = systemParsed?.type === 'WAKE';
	const isWarning = !!(systemParsed && (systemParsed.type === 'WARNING' || systemParsed.type === 'FORCE-HANDOFF'));
	const isPlumbing = !!(systemParsed && ['CRON', 'INFO', 'LATE', 'HANDOFF'].includes(systemParsed.type));

	const isSessionStartPlumbing = normalized.startsWith('SessionStart:');
	const isSessionRolePlumbing = normalized.startsWith('<session-role>');

	if (isCtx) return <ContextCard content={normalized} timestamp={timestamp} />;
	if (isSpec) return <SpecialistReport content={normalized} timestamp={timestamp} />;
	if (isReply) return <SpecialistReplyCard content={normalized} timestamp={timestamp} />;
	if (isTeam) return <TeamMessageCard content={normalized} timestamp={timestamp} />;
	if (isReq) return <TeamRequestCard content={normalized} timestamp={timestamp} />;
	if (isTask) return <TaskNotificationCard content={normalized} timestamp={timestamp} />;
	if (isWake) return <WakeDivider timestamp={timestamp} />;
	if (isWarning) return <WarningMessage content={normalized} timestamp={timestamp} />;
	if (isPlumbing || isSessionStartPlumbing || isSessionRolePlumbing) return <SystemMessage content={normalized} variant="plumbing" />;
	return <SystemMessage content={normalized} />;
}
