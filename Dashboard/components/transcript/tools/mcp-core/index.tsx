'use client';

/**
 * MCP Core Tool Expanded Views
 * 
 * Life system MCP tools: worker, team, session, priority, contact, status, ping, log
 * These are the infrastructure tools for the Claude team system.
 */

import { Check, ExternalLink, Search, Star, User, Users, Zap } from 'lucide-react';
import { useOpenInDesktop } from '../ClickableRef';
import { LiveWorkerEmbed } from '../LiveSessionEmbed';
import { CodeBlock, InfoBox, SectionHeader } from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// ROLE COLORS (shared)
// =============================================================================

const ROLE_COLORS: Record<string, string> = {
	builder: 'var(--color-info)',
	chief: 'var(--color-claude)',
	specialist: 'var(--color-success)',
	worker: 'var(--color-warning)',
	// Legacy alias (system → builder)
	system: 'var(--color-info)',
};

// =============================================================================
// WORKER TOOL
// =============================================================================

export function WorkerExpanded({ input, result, rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || input.operation || 'worker');
	const hasError = result?.error;

	let workerId = rawInput?.worker_id ? String(rawInput.worker_id) : input.workerId;
	if (!workerId && result?.data && typeof result.data === 'object') {
		const data = result.data as Record<string, unknown>;
		workerId = data.worker_id ? String(data.worker_id) : undefined;
	}
	if (!workerId && rawResult) {
		try {
			const parsed = JSON.parse(rawResult);
			if (parsed.worker_id) workerId = String(parsed.worker_id);
		} catch { }
	}

	const instructions = rawInput?.instructions ? String(rawInput.instructions) : input.instructions;

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{op}</span>
				{workerId && (
					<span className="text-[10px] font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
						{workerId.slice(0, 8)}
					</span>
				)}
			</div>

			{workerId && (
				<LiveWorkerEmbed workerId={workerId} instructions={instructions} />
			)}

			{instructions && !workerId && (
				<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
					{instructions}
				</div>
			)}

			{rawResult && !workerId && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : (
					<div className="text-[11px] text-[var(--color-success)] flex items-center gap-1.5">
						<Check className="w-3 h-3" />
						<span>Worker spawned</span>
					</div>
				)
			)}
		</div>
	);
}

// =============================================================================
// SESSION TOOL
// =============================================================================

export function SessionExpanded({ input, result, rawInput, rawResult }: ToolExpandedProps) {
	const op = rawInput?.operation || '';
	const role = rawInput?.role ? String(rawInput.role) : '';
	const task = rawInput?.task ? String(rawInput.task) : '';
	const description = rawInput?.description ? String(rawInput.description) : '';
	let sessionId = rawInput?.session_id ? String(rawInput.session_id) : rawInput?.id ? String(rawInput.id) : '';
	const hasError = result?.error;

	let resultData: { success?: boolean; session_id?: string; role?: string; window_name?: string; } | null = null;
	if (rawResult && !hasError) {
		try {
			resultData = JSON.parse(rawResult);
			if (!sessionId && resultData?.session_id) sessionId = resultData.session_id;
		} catch { }
	}

	const roleColor = role ? (ROLE_COLORS[role.toLowerCase()] || 'var(--color-claude)') : 'var(--color-claude)';

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 flex-wrap">
				{role && (
					<span
						className="text-[10px] px-1.5 py-0.5 rounded"
						style={{
							backgroundColor: `color-mix(in srgb, ${roleColor} 15%, transparent)`,
							color: roleColor
						}}
					>
						{role}
					</span>
				)}
				{sessionId && (
					<span className="text-[10px] font-mono text-[var(--text-muted)]">
						{sessionId.slice(0, 8)}
					</span>
				)}
				{resultData?.window_name && (
					<span className="text-[10px] text-[var(--text-muted)]">
						• {resultData.window_name}
					</span>
				)}
			</div>

			{description && (
				<div className="text-[11px] text-[var(--text-secondary)]">
					{description}
				</div>
			)}

			{task && (
				<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
					{task}
				</div>
			)}

			{rawResult && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : resultData?.success ? (
					<div className="text-[11px] text-[var(--color-success)] flex items-center gap-1.5">
						<Check className="w-3 h-3" />
						<span>Session spawned</span>
					</div>
				) : (
					<CodeBlock code={rawResult} maxHeight="100px" />
				)
			)}
		</div>
	);
}

// =============================================================================
// TEAM TOOL
// =============================================================================

export function TeamExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const id = rawInput?.id ? String(rawInput.id) : '';
	const role = rawInput?.role ? String(rawInput.role) : '';
	const task = rawInput?.task ? String(rawInput.task) : '';
	const hasError = rawResult?.toLowerCase().includes('error');

	let resultData: {
		success?: boolean;
		session_id?: string;
		full_id?: string;
		window_name?: string;
		role?: string;
		output?: string;
		reminder?: string;
	} | null = null;

	if (rawResult && !hasError) {
		try {
			resultData = JSON.parse(rawResult);
		} catch { }
	}

	const roleColor = role ? (ROLE_COLORS[role.toLowerCase()] || 'var(--color-claude)') : 'var(--color-claude)';

	// === SPAWN OPERATION ===
	if (op === 'spawn') {
		const sessionId = resultData?.session_id || id;

		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2 bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
					<div
						className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
						style={{ backgroundColor: roleColor }}
					>
						{role ? role[0].toUpperCase() : '?'}
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[12px] font-medium text-[var(--text-primary)]">
							{role || 'Session'}
						</div>
						{sessionId && (
							<div className="text-[10px] font-mono text-[var(--text-muted)]">
								{sessionId} • {resultData?.window_name || ''}
							</div>
						)}
					</div>
					{resultData?.success && (
						<Check className="w-4 h-4 text-[var(--color-success)]" />
					)}
				</div>

				{task && (
					<div>
						<div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Task</div>
						<div className="bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
							<p className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">{task}</p>
						</div>
					</div>
				)}

				{resultData?.reminder && (
					<div className="text-[10px] text-[var(--text-muted)] italic">
						💡 {resultData.reminder}
					</div>
				)}

				{hasError && rawResult && (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono">{rawResult}</code>
					</div>
				)}
			</div>
		);
	}

	// === PEEK OPERATION ===
	if (op === 'peek') {
		const peekOutput = resultData?.output || '';
		const peekRole = resultData?.role || '';
		const sessionId = id || resultData?.session_id || resultData?.full_id;

		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2 text-[11px]">
					<span className="font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">{sessionId?.slice(0, 8) || id}</span>
					{peekRole && (
						<span
							className="px-1.5 py-0.5 rounded text-[10px]"
							style={{
								backgroundColor: `color-mix(in srgb, ${ROLE_COLORS[peekRole.toLowerCase()] || 'var(--color-claude)'} 15%, transparent)`,
								color: ROLE_COLORS[peekRole.toLowerCase()] || 'var(--color-claude)'
							}}
						>
							{peekRole}
						</span>
					)}
				</div>

			{peekOutput && (
					<div>
						<div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Captured Output</div>
						<div className="bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] max-h-[150px] overflow-y-auto">
							<pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap font-mono">
								{peekOutput}
							</pre>
						</div>
					</div>
				)}

				{!peekOutput && !sessionId && rawResult && !hasError && (
					<CodeBlock code={rawResult} maxHeight="150px" />
				)}

				{hasError && rawResult && (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono">{rawResult}</code>
					</div>
				)}
			</div>
		);
	}

	// === CLOSE OPERATION ===
	if (op === 'close') {
		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2 text-[11px]">
					<span className="font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">{id}</span>
					{resultData?.success && (
						<span className="text-[var(--color-success)] flex items-center gap-1">
							<Check className="w-3 h-3" /> Closed
						</span>
					)}
				</div>
				{hasError && rawResult && (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono">{rawResult}</code>
					</div>
				)}
			</div>
		);
	}

	// === LIST OPERATION ===
	if (op === 'list') {
		let sessions: Array<{ id: string; role: string; status?: string; }> = [];
		if (resultData && Array.isArray(resultData)) {
			sessions = resultData as typeof sessions;
		} else if (rawResult && !hasError) {
			try {
				const parsed = JSON.parse(rawResult);
				if (Array.isArray(parsed)) sessions = parsed;
				else if (parsed.sessions) sessions = parsed.sessions;
			} catch { }
		}

		if (sessions.length > 0) {
			return (
				<div className="space-y-1">
					{sessions.map((s, i) => (
						<div
							key={i}
							className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]"
						>
							<div
								className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
								style={{ backgroundColor: ROLE_COLORS[s.role?.toLowerCase()] || 'var(--color-claude)' }}
							>
								{s.role ? s.role[0].toUpperCase() : '?'}
							</div>
							<span className="font-mono text-[var(--text-muted)]">{s.id?.slice(0, 8)}</span>
							<span className="text-[var(--text-secondary)]">{s.role}</span>
							{s.status && (
								<span className="text-[var(--text-muted)] ml-auto">{s.status}</span>
							)}
						</div>
					))}
				</div>
			);
		}

		return rawResult ? <CodeBlock code={rawResult} maxHeight="150px" /> : null;
	}

	// === DEFAULT FALLBACK ===
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 text-[10px]">
				<Users className="w-3 h-3 text-[var(--color-claude)]" />
				<span className="uppercase tracking-wider text-[var(--text-muted)]">{op}</span>
				{id && <span className="font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">{id.slice(0, 8)}</span>}
				{role && <span className="bg-[var(--color-claude)]/10 text-[var(--color-claude)] px-1.5 py-0.5 rounded">{role}</span>}
			</div>

			{task && (
				<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
					{task}
				</div>
			)}

			{rawResult && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : (
					<CodeBlock code={rawResult} maxHeight="150px" />
				)
			)}
		</div>
	);
}

// =============================================================================
// PRIORITY TOOL
// =============================================================================

export function PriorityExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const op = rawInput?.operation || '';
	const content = rawInput?.content ? String(rawInput.content) : input.priorityContent || '';
	const level = rawInput?.level ? String(rawInput.level) : '';
	const hasError = rawResult?.toLowerCase().includes('error');

	const levelColors: Record<string, string> = {
		critical: 'var(--color-error)',
		high: 'var(--color-warning)',
		medium: 'var(--color-primary)',
		low: 'var(--text-muted)',
	};

	// Parse result for simple operations
	let resultData: { success?: boolean } | null = null;
	if (rawResult && !hasError) {
		try {
			resultData = JSON.parse(rawResult);
		} catch { }
	}

	return (
		<div className="space-y-3">
			{level && (
				<span
					className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
					style={{ backgroundColor: `color-mix(in srgb, ${levelColors[level] || 'var(--text-muted)'} 15%, transparent)`, color: levelColors[level] }}
				>
					{level}
				</span>
			)}

			{content && (
				<InfoBox icon={Star} color={levelColors[level] || 'var(--color-warning)'}>
					{content}
				</InfoBox>
			)}

			{rawResult && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : resultData?.success && (op === 'create' || op === 'delete' || op === 'complete') ? (
					<div className="text-[11px] text-[var(--color-success)] flex items-center gap-1.5">
						<Check className="w-3 h-3" />
						<span>{op === 'create' ? 'Created' : op === 'delete' ? 'Deleted' : 'Completed'}</span>
					</div>
				) : (
					<CodeBlock code={rawResult} maxHeight="100px" />
				)
			)}
		</div>
	);
}

// =============================================================================
// CONTACT TOOL
// =============================================================================

export function ContactExpanded({ input, result, rawInput, rawResult }: ToolExpandedProps) {
	const { openContact } = useOpenInDesktop();
	const op = rawInput?.operation || '';
	const query = rawInput?.query ? String(rawInput.query) : input.contactQuery || '';
	const identifier = rawInput?.identifier ? String(rawInput.identifier) : '';
	const hasError = result?.error;

	let contacts: Array<{ name: string; company?: string; }> = [];
	if (result?.data && Array.isArray(result.data)) {
		contacts = result.data.slice(0, 5).map((c: Record<string, unknown>) => ({
			name: String(c.name || c.full_name || 'Unknown'),
			company: c.company ? String(c.company) : undefined,
		}));
	}

	// Parse result for simple operations
	let resultData: { success?: boolean } | null = null;
	if (rawResult && !hasError) {
		try {
			resultData = JSON.parse(rawResult);
		} catch { }
	}

	return (
		<div className="space-y-3">
			{query && (
				<InfoBox icon={Search} color="var(--color-info)">
					Search: "{query}"
				</InfoBox>
			)}

			{identifier && (
				<button onClick={() => openContact(identifier)} className="w-full">
					<InfoBox icon={User} color="var(--color-cyan)">
						<span className="hover:text-[#da7756] hover:underline decoration-dotted transition-colors">
							{identifier}
						</span>
					</InfoBox>
				</button>
			)}

			{contacts.length > 0 && (
				<div className="space-y-1">
					{contacts.map((contact, i) => (
						<button
							key={i}
							onClick={() => openContact(contact.name)}
							className="w-full flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-[#da7756]/30 transition-colors"
						>
							<User className="w-3 h-3 text-[var(--color-cyan)] flex-shrink-0" />
							<span className="font-medium text-[var(--text-secondary)] hover:text-[#da7756]">{contact.name}</span>
							{contact.company && (
								<span className="text-[var(--text-muted)]">· {contact.company}</span>
							)}
							<ExternalLink className="w-3 h-3 text-[var(--text-muted)] ml-auto opacity-0 group-hover:opacity-100" />
						</button>
					))}
				</div>
			)}

			{rawResult && contacts.length === 0 && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : resultData?.success && (op === 'create' || op === 'update' || op === 'enrich') ? (
					<div className="text-[11px] text-[var(--color-success)] flex items-center gap-1.5">
						<Check className="w-3 h-3" />
						<span>{op === 'create' ? 'Created' : op === 'update' ? 'Updated' : 'Enriched'}</span>
					</div>
				) : (
					<CodeBlock code={rawResult} maxHeight="150px" />
				)
			)}
		</div>
	);
}

// =============================================================================
// LOG TOOL
// =============================================================================

export function LogExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const section = rawInput?.section ? String(rawInput.section) : '';
	const content = rawInput?.content ? String(rawInput.content) : '';
	const hasError = rawResult?.toLowerCase().includes('error');

	// Parse result for simple operations
	let resultData: { success?: boolean } | null = null;
	if (rawResult && !hasError) {
		try {
			resultData = JSON.parse(rawResult);
		} catch { }
	}

	return (
		<div className="space-y-3">
			{section && (
				<span className="text-[9px] uppercase tracking-wider bg-[var(--surface-muted)] px-1.5 py-0.5 rounded text-[var(--text-muted)]">
					{section}
				</span>
			)}

			{content && (
				<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
					{content}
				</div>
			)}

			{rawResult && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : resultData?.success ? (
					<div className="text-[11px] text-[var(--color-success)] flex items-center gap-1.5">
						<Check className="w-3 h-3" />
						<span>Logged to {section}</span>
					</div>
				) : (
					<CodeBlock code={rawResult} maxHeight="80px" />
				)
			)}
		</div>
	);
}

// =============================================================================
// SKILL TOOL
// =============================================================================

export function SkillExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const skill = rawInput?.skill ? String(rawInput.skill) : '';
	const args = rawInput?.args ? String(rawInput.args) : '';
	const hasError = rawResult?.toLowerCase().includes('error');

	// Detect if args look like code (starts with -, has flags, etc.) vs natural language
	const argsLookLikeCode = args && (args.startsWith('-') || args.includes('--'));

	return (
		<div className="space-y-3">
			{skill && (
				<div className="flex items-center gap-2">
					<Zap className="w-3 h-3 text-[var(--color-warning)]" />
					<span className="text-[11px] font-medium text-[var(--text-secondary)]">{skill}</span>
				</div>
			)}

			{args && (
				argsLookLikeCode ? (
					<CodeBlock code={args} maxHeight="200px" />
				) : (
					<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)]">
						{args}
					</div>
				)
			)}

			{rawResult && (
				hasError ? (
					<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
						<code className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap">{rawResult}</code>
					</div>
				) : (
					<CodeBlock code={rawResult} maxHeight="150px" />
				)
			)}
		</div>
	);
}

// =============================================================================
// EXPORT MAP
// =============================================================================

export const mcpCoreExpandedViews = {
	// Workers
	worker: WorkerExpanded,
	worker_create: WorkerExpanded,
	worker_ack: WorkerExpanded,
	worker_list: WorkerExpanded,
	worker_cancel: WorkerExpanded,
	Task: WorkerExpanded,

	// Sessions
	session_spawn: SessionExpanded,
	session_close: SessionExpanded,
	session_peek: SessionExpanded,
	session_list: TeamExpanded,
	team: TeamExpanded,

	// Priority
	priority: PriorityExpanded,
	priority_create: PriorityExpanded,
	priority_delete: PriorityExpanded,
	priority_update: PriorityExpanded,

	// Contact
	contact: ContactExpanded,
	contact_search: ContactExpanded,
	contact_view: ContactExpanded,
	contact_update: ContactExpanded,
	contact_create: ContactExpanded,

	// Logs
	log: LogExpanded,
	ping: LogExpanded,
	status: LogExpanded,

	// Skill
	Skill: SkillExpanded,
};

