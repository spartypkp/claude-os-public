'use client';

/**
 * MCP Core Tool Expanded Views
 *
 * Life system MCP tools with custom expanded views.
 * Tools without custom views (status, timeline, log, ping, show) render as
 * non-expandable system event chips — the one-liner IS the full info.
 */

import {
	Calendar,
	Check,
	Clock,
	ExternalLink,
	Folder,
	Mail,
	MapPin,
	MessageSquare,
	Radio,
	Search,
	Send,
	Star,
	User,
	Zap,
} from 'lucide-react';
import { getRoleConfig } from '@/lib/sessionUtils';
import { useOpenInDesktop } from '../ClickableRef';
import {
	CodeBlock,
	ErrorBox,
	InfoBox,
	KeyValue,
	ResultIndicator,
	StatusBadge,
	isErrorResult,
} from '../shared';
import type { ToolExpandedProps } from '../types';

// =============================================================================
// SHARED
// =============================================================================

const TIER_COLORS: Record<string, string> = {
	S: '#ef4444',
	A: '#f59e0b',
	B: '#3b82f6',
	C: 'var(--text-muted)',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResult(raw?: string): any {
	if (!raw) return null;
	try { return JSON.parse(raw); } catch { return null; }
}

function fmtTime(iso: string): string {
	try {
		return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
	} catch { return iso; }
}

function fmtDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	} catch { return iso; }
}

// =============================================================================
// TEAM — Shared helpers
// =============================================================================

/** Render a role icon + label pill using the shared role config */
function RolePill({ role }: { role: string }) {
	const config = getRoleConfig(role);
	const Icon = config.icon;
	return (
		<div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#da7756]/8 border border-[#da7756]/15">
			<Icon className="w-3.5 h-3.5 text-[#da7756]" />
			<span className="text-[11px] font-semibold text-[#da7756] capitalize">{config.label}</span>
		</div>
	);
}

/** Phase indicator for specialist modes */
const PHASE_COLORS: Record<string, string> = {
	preparation: '#60a5fa',
	implementation: '#f59e0b',
	verification: '#34d399',
	interactive: '#8b5cf6',
};

/** Render a conversation row for list view */
function ConversationRow({ conversation }: { conversation: { conversation_id?: string; role?: string; status?: string; mode?: string; sessions_count?: number; active_session_id?: string; spec_path?: string } }) {
	const role = conversation.role || 'unknown';
	const config = getRoleConfig(role);
	const Icon = config.icon;
	const mode = conversation.mode || '';
	const phaseColor = PHASE_COLORS[mode] || 'var(--text-muted)';
	const sessionCount = conversation.sessions_count || 1;

	return (
		<div className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2.5 py-2 rounded-md border border-[var(--border-subtle)]">
			<div className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, #da7756 12%, transparent)' }}>
				<Icon className="w-3 h-3 text-[#da7756]" />
			</div>
			<span className="font-medium text-[var(--text-secondary)] capitalize">{config.label}</span>
			{mode && mode !== 'interactive' && (
				<span
					className="text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize"
					style={{ color: phaseColor, backgroundColor: `color-mix(in srgb, ${phaseColor} 12%, transparent)` }}
				>
					{mode.slice(0, 4)}
				</span>
			)}
			{sessionCount > 1 && (
				<span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1 py-0.5 rounded">
					{sessionCount}
				</span>
			)}
			{conversation.status && (
				<span className="text-[10px] text-[var(--text-muted)] ml-auto truncate max-w-[150px]">{conversation.status}</span>
			)}
		</div>
	);
}

// =============================================================================
// TEAM — Main expanded view
// =============================================================================

export function TeamExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const id = rawInput?.id ? String(rawInput.id) : '';
	const role = rawInput?.role ? String(rawInput.role) : '';
	const specPath = rawInput?.spec_path ? String(rawInput.spec_path) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	// ── Spawn ────────────────────────────────────────────────────────────
	if (op === 'spawn') {
		const workspace = resultData?.workspace ? String(resultData.workspace) : '';
		const isRequestSent = Boolean(resultData?.request_sent);
		const requestedRole = resultData?.requested_role ? String(resultData.requested_role) : role;

		if (isRequestSent) {
			// Non-Chief: spawn routed as request to Chief
			return (
				<div className="space-y-2.5">
					<div className="flex items-center gap-2">
						<RolePill role={requestedRole} />
						<span className="flex items-center gap-1 text-[10px] font-medium text-[#8b5cf6] bg-[#8b5cf6]/10 px-1.5 py-0.5 rounded-full">
							<Send className="w-3 h-3" /> Request → Chief
						</span>
					</div>
					{specPath && (
						<div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
							<Folder className="w-3 h-3 flex-shrink-0" />
							<span className="font-mono truncate">{specPath}</span>
						</div>
					)}
					{hasError && rawResult && <ErrorBox message={rawResult} />}
				</div>
			);
		}

		return (
			<div className="space-y-2.5">
				<div className="flex items-center gap-2">
					<RolePill role={role} />
					{resultData?.success && (
						<span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
							<Check className="w-3 h-3" /> Spawned
						</span>
					)}
				</div>
				{specPath && (
					<div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
						<Folder className="w-3 h-3 flex-shrink-0" />
						<span className="font-mono truncate">{specPath}</span>
					</div>
				)}
				{workspace && (
					<div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
						<Folder className="w-3 h-3 flex-shrink-0" />
						<span className="font-mono truncate">{workspace}</span>
					</div>
				)}
				{hasError && rawResult && <ErrorBox message={rawResult} />}
			</div>
		);
	}

	// ── Peek ─────────────────────────────────────────────────────────────
	if (op === 'peek') {
		const peekOutput = resultData?.output ? String(resultData.output) : '';
		const peekRole = resultData?.role ? String(resultData.role) : '';
		const lines = resultData?.lines ? Number(resultData.lines) : 0;
		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					{peekRole && <RolePill role={peekRole} />}
					{lines > 0 && (
						<span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
							{lines} lines
						</span>
					)}
				</div>
				{peekOutput && <CodeBlock code={peekOutput} maxHeight="200px" />}
				{hasError && rawResult && <ErrorBox message={rawResult} />}
			</div>
		);
	}

	// ── Close ────────────────────────────────────────────────────────────
	if (op === 'close') {
		const closeRole = resultData?.role ? String(resultData.role) : '';
		return (
			<div className="flex items-center gap-2">
				{closeRole && <RolePill role={closeRole} />}
				{!closeRole && id && (
					<span className="font-mono text-[10px] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">{id.slice(0, 8)}</span>
				)}
				{resultData?.success && <ResultIndicator success successText="Closed" />}
				{hasError && rawResult && <ErrorBox message={rawResult} />}
			</div>
		);
	}

	// ── List ─────────────────────────────────────────────────────────────
	if (op === 'list') {
		// Try conversation-grouped format first, fall back to flat sessions
		let conversations: Array<{ conversation_id?: string; role?: string; status?: string; mode?: string; sessions_count?: number; active_session_id?: string; spec_path?: string }> = [];
		if (rawResult && !hasError) {
			const parsed = parseResult(rawResult);
			if (parsed?.conversations) conversations = parsed.conversations;
			else if (parsed?.sessions) {
				// Backward compat: flat session list
				conversations = (parsed.sessions as Array<Record<string, unknown>>).map(s => ({
					conversation_id: String(s.id || ''),
					role: String(s.role || 'unknown'),
					status: s.status ? String(s.status) : undefined,
				}));
			}
			else if (Array.isArray(parsed)) {
				conversations = parsed.map((s: Record<string, unknown>) => ({
					conversation_id: String(s.conversation_id || s.id || ''),
					role: String(s.role || 'unknown'),
					status: s.status ? String(s.status) : s.status_text ? String(s.status_text) : undefined,
					mode: s.mode ? String(s.mode) : undefined,
					sessions_count: typeof s.sessions_count === 'number' ? s.sessions_count : undefined,
				}));
			}
		}
		if (conversations.length > 0) {
			return (
				<div className="space-y-1">
					{conversations.map((c, i) => <ConversationRow key={i} conversation={c} />)}
				</div>
			);
		}
		return rawResult ? <CodeBlock code={rawResult} maxHeight="150px" /> : null;
	}

	// ── Message ──────────────────────────────────────────────────────────
	if (op === 'message') {
		const message = rawInput?.message ? String(rawInput.message) : '';
		const targetRole = resultData?.role ? String(resultData.role) : '';
		return (
			<div className="space-y-2">
				{targetRole && (
					<div className="flex items-center gap-2">
						<span className="text-[10px] text-[var(--text-muted)]">To:</span>
						<RolePill role={targetRole} />
					</div>
				)}
				{message && (
					<div className="flex items-start gap-2 text-[11px] bg-[var(--color-primary)]/8 px-3 py-2 rounded-xl border border-[var(--color-primary)]/15">
						<Send className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
						<span className="text-[var(--text-secondary)] leading-relaxed">{message}</span>
					</div>
				)}
				{resultData?.success && <ResultIndicator success successText="Delivered" />}
				{hasError && rawResult && <ErrorBox message={rawResult} />}
			</div>
		);
	}

	// ── Subscribe ────────────────────────────────────────────────────────
	if (op === 'subscribe') {
		const subRole = resultData?.role ? String(resultData.role) : '';
		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					{subRole && <RolePill role={subRole} />}
					{resultData?.success && (
						<span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
							<Radio className="w-3 h-3" /> Listening
						</span>
					)}
				</div>
				{hasError && rawResult && <ErrorBox message={rawResult} />}
			</div>
		);
	}

	// ── Default ──────────────────────────────────────────────────────────
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2 text-[10px]">
				<span className="uppercase tracking-wider text-[var(--text-muted)]">{op}</span>
				{id && <span className="font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">{id.slice(0, 8)}</span>}
				{role && <RolePill role={role} />}
			</div>
			{rawResult && (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />)}
		</div>
	);
}

// =============================================================================
// PRIORITY
// =============================================================================

export function PriorityExpanded({ input, rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const content = rawInput?.content ? String(rawInput.content) : input.priorityContent || '';
	const level = rawInput?.level ? String(rawInput.level) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	const levelColors: Record<string, string> = {
		critical: 'var(--color-error)',
		high: 'var(--color-warning)',
		medium: 'var(--color-primary)',
		low: 'var(--text-muted)',
	};

	return (
		<div className="space-y-2">
			{level && <StatusBadge label={level} color={levelColors[level] || 'var(--text-muted)'} />}
			{content && (
				<InfoBox icon={Star} color={levelColors[level] || 'var(--color-warning)'}>{content}</InfoBox>
			)}
			{rawResult && (
				hasError ? <ErrorBox message={rawResult} /> :
				resultData?.success ? (
					<ResultIndicator success successText={op === 'create' ? 'Created' : op === 'delete' ? 'Deleted' : 'Completed'} />
				) : <CodeBlock code={rawResult} maxHeight="100px" />
			)}
		</div>
	);
}

// =============================================================================
// CONTACT
// =============================================================================

export function ContactExpanded({ input, result, rawInput, rawResult }: ToolExpandedProps) {
	const { openContact } = useOpenInDesktop();
	const op = String(rawInput?.operation || '');
	const query = rawInput?.query ? String(rawInput.query) : input.contactQuery || '';
	const identifier = rawInput?.identifier ? String(rawInput.identifier) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	let contacts: Array<{ name: string; company?: string; role?: string }> = [];
	if (result?.data && Array.isArray(result.data)) {
		contacts = result.data.slice(0, 5).map((c: Record<string, unknown>) => ({
			name: String(c.name || c.full_name || 'Unknown'),
			company: c.company ? String(c.company) : undefined,
			role: c.role ? String(c.role) : undefined,
		}));
	}

	return (
		<div className="space-y-2">
			{query && (
				<InfoBox icon={Search} color="var(--color-info)">&quot;{query}&quot;</InfoBox>
			)}
			{identifier && !query && (
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
							{contact.company && <span className="text-[var(--text-muted)]">· {contact.company}</span>}
							{contact.role && <span className="text-[var(--text-muted)] text-[10px]">({contact.role})</span>}
							<ExternalLink className="w-3 h-3 text-[var(--text-muted)] ml-auto" />
						</button>
					))}
				</div>
			)}
			{rawResult && contacts.length === 0 && (
				hasError ? <ErrorBox message={rawResult} /> :
				resultData?.success && (op === 'create' || op === 'update' || op === 'enrich') ? (
					<ResultIndicator success successText={op === 'create' ? 'Created' : op === 'update' ? 'Updated' : 'Enriched'} />
				) : <CodeBlock code={rawResult} maxHeight="150px" />
			)}
		</div>
	);
}

// =============================================================================
// EMAIL
// =============================================================================

export function EmailExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const to = rawInput?.to ? String(rawInput.to) : '';
	const subject = rawInput?.subject ? String(rawInput.subject) : '';
	const content = rawInput?.content ? String(rawInput.content) : '';
	const account = rawInput?.account ? String(rawInput.account) : '';
	const query = rawInput?.query ? String(rawInput.query) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	// Send/Draft
	if (op === 'send' || op === 'draft') {
		return (
			<div className="space-y-2">
				<StatusBadge label={op} color={op === 'send' ? 'var(--color-error)' : 'var(--color-primary)'} />
				{to && <KeyValue label="To" value={to} mono />}
				{account && <KeyValue label="From" value={account} mono />}
				{subject && <div className="text-[12px] font-medium text-[var(--text-primary)]">{subject}</div>}
				{content && (
					<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] max-h-24 overflow-y-auto whitespace-pre-wrap">
						{content.slice(0, 500)}{content.length > 500 ? '...' : ''}
					</div>
				)}
				{rawResult && (
					hasError ? <ErrorBox message={rawResult} /> :
					resultData?.success ? <ResultIndicator success successText={op === 'draft' ? 'Draft created' : 'Queued'} /> :
					<CodeBlock code={rawResult} maxHeight="80px" />
				)}
			</div>
		);
	}

	// Search
	if (op === 'search') {
		let emails: Array<Record<string, unknown>> = [];
		if (resultData) {
			if (Array.isArray(resultData)) emails = resultData;
			else if (Array.isArray(resultData.messages)) emails = resultData.messages;
			else if (Array.isArray(resultData.results)) emails = resultData.results;
		}
		return (
			<div className="space-y-2">
				{query && <InfoBox icon={Search} color="var(--color-info)">&quot;{query}&quot;</InfoBox>}
				{emails.length > 0 ? (
					<div className="space-y-1">
						{emails.slice(0, 5).map((e, i) => (
							<div key={i} className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
								<Mail className="w-3 h-3 text-[#ef4444] flex-shrink-0" />
								<span className="font-medium text-[var(--text-secondary)] truncate">
									{String(e.from || e.sender || 'Unknown')}
								</span>
								{e.subject ? (
									<span className="text-[var(--text-muted)] truncate flex-1">— {String(e.subject)}</span>
								) : null}
							</div>
						))}
						{emails.length > 5 && <div className="text-[10px] text-[var(--text-muted)]">+{emails.length - 5} more</div>}
					</div>
				) : rawResult ? (
					hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />
				) : null}
			</div>
		);
	}

	// Unread
	if (op === 'unread') {
		let emails: Array<Record<string, unknown>> = [];
		if (resultData) {
			if (Array.isArray(resultData)) emails = resultData;
			else if (Array.isArray(resultData.messages)) emails = resultData.messages;
		}
		const count = emails.length || (resultData?.count as number) || 0;
		return (
			<div className="space-y-2">
				{count > 0 ? (
					<>
						<div className="text-[12px] font-medium text-[var(--text-primary)]">
							{count} unread message{count !== 1 ? 's' : ''}
						</div>
						{emails.length > 0 && (
							<div className="space-y-1">
								{emails.slice(0, 5).map((e, i) => (
									<div key={i} className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
										<Mail className="w-3 h-3 text-[#ef4444] flex-shrink-0" />
										<span className="font-medium text-[var(--text-secondary)] truncate">
											{String(e.from || e.sender || 'Unknown')}
										</span>
										{e.subject ? (
											<span className="text-[var(--text-muted)] truncate flex-1">— {String(e.subject)}</span>
										) : null}
									</div>
								))}
							</div>
						)}
					</>
				) : rawResult ? (
					hasError ? <ErrorBox message={rawResult} /> :
					resultData?.success ? <ResultIndicator success successText="No unread messages" /> :
					<CodeBlock code={rawResult} maxHeight="100px" />
				) : null}
			</div>
		);
	}

	// Read
	if (op === 'read') {
		const emailSubject = resultData?.subject ? String(resultData.subject) : '';
		const emailFrom = resultData?.from ? String(resultData.from) : resultData?.sender ? String(resultData.sender) : '';
		const emailBody = resultData?.body ? String(resultData.body) : resultData?.snippet ? String(resultData.snippet) : '';
		if (emailSubject || emailFrom) {
			return (
				<div className="space-y-2">
					{emailFrom && <KeyValue label="From" value={emailFrom} />}
					{emailSubject && <div className="text-[12px] font-medium text-[var(--text-primary)]">{emailSubject}</div>}
					{emailBody && (
						<div className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] max-h-32 overflow-y-auto">
							{emailBody.slice(0, 500)}{emailBody.length > 500 ? '...' : ''}
						</div>
					)}
				</div>
			);
		}
		return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="200px" />) : null;
	}

	// Default (accounts, test, discover)
	return rawResult ? (
		hasError ? <ErrorBox message={rawResult} /> :
		resultData?.success ? <ResultIndicator success successText={String(op)} /> :
		<CodeBlock code={rawResult} maxHeight="100px" />
	) : null;
}

// =============================================================================
// CALENDAR
// =============================================================================

export function CalendarExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const title = rawInput?.title ? String(rawInput.title) : '';
	const startTime = rawInput?.start_time ? String(rawInput.start_time) : '';
	const endTime = rawInput?.end_time ? String(rawInput.end_time) : '';
	const location = rawInput?.location ? String(rawInput.location) : '';
	const allDay = Boolean(rawInput?.all_day);
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	// Create/Update
	if (op === 'create' || op === 'update') {
		return (
			<div className="space-y-2">
				{title && <div className="text-[12px] font-medium text-[var(--text-primary)]">{title}</div>}
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
					{startTime && (
						<span className="flex items-center gap-1">
							<Clock className="w-3 h-3" />
							{fmtDate(startTime)}{!allDay ? `, ${fmtTime(startTime)}` : ''}
						</span>
					)}
					{endTime && !allDay && (
						<><span>→</span><span>{fmtTime(endTime)}</span></>
					)}
					{allDay && <StatusBadge label="all day" color="var(--color-info)" />}
				</div>
				{location && (
					<div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
						<MapPin className="w-3 h-3" />{location}
					</div>
				)}
				{rawResult && (
					hasError ? <ErrorBox message={rawResult} /> :
					resultData?.success ? <ResultIndicator success successText={op === 'create' ? 'Created' : 'Updated'} /> :
					<CodeBlock code={rawResult} maxHeight="80px" />
				)}
			</div>
		);
	}

	// List
	if (op === 'list') {
		let events: Array<Record<string, unknown>> = [];
		if (resultData) {
			if (Array.isArray(resultData)) events = resultData;
			else if (Array.isArray(resultData.events)) events = resultData.events;
		}
		if (events.length > 0) {
			return (
				<div className="space-y-1">
					{events.slice(0, 8).map((evt, i) => (
						<div key={i} className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
							<Calendar className="w-3 h-3 text-[#3b82f6] flex-shrink-0" />
							<span className="font-medium text-[var(--text-secondary)] truncate">{String(evt.title || 'Event')}</span>
							{evt.start_time ? (
								<span className="text-[var(--text-muted)] ml-auto flex-shrink-0 text-[10px]">
									{evt.all_day ? 'All day' : fmtTime(String(evt.start_time))}
								</span>
							) : null}
						</div>
					))}
					{events.length > 8 && <div className="text-[10px] text-[var(--text-muted)]">+{events.length - 8} more</div>}
				</div>
			);
		}
		return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />) : null;
	}

	// Delete
	if (op === 'delete') {
		return rawResult ? (
			hasError ? <ErrorBox message={rawResult} /> :
			resultData?.success ? <ResultIndicator success successText="Deleted" /> :
			<CodeBlock code={rawResult} maxHeight="80px" />
		) : null;
	}

	// Default (get, calendars)
	return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />) : null;
}

// =============================================================================
// MESSAGES (iMessage)
// =============================================================================

export function MessagesExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const recipient = String(rawInput?.recipient || rawInput?.phone_number || rawInput?.email || '');
	const text = rawInput?.text ? String(rawInput.text) : '';
	const query = rawInput?.query ? String(rawInput.query) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	// Send
	if (op === 'send') {
		return (
			<div className="space-y-2">
				{recipient && <KeyValue label="To" value={recipient} mono />}
				{text && (
					<div className="flex items-start gap-2 text-[11px] bg-[var(--color-primary)]/10 px-3 py-2 rounded-xl border border-[var(--color-primary)]/20">
						<Send className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
						<span className="text-[var(--text-secondary)]">{text}</span>
					</div>
				)}
				{rawResult && (
					hasError ? <ErrorBox message={rawResult} /> :
					resultData?.success ? <ResultIndicator success successText="Sent" /> :
					<CodeBlock code={rawResult} maxHeight="80px" />
				)}
			</div>
		);
	}

	// Search
	if (op === 'search' && query) {
		return (
			<div className="space-y-2">
				<InfoBox icon={Search} color="var(--color-info)">&quot;{query}&quot;</InfoBox>
				{rawResult && (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="200px" />)}
			</div>
		);
	}

	// Read — mini thread
	if (op === 'read') {
		let messages: Array<Record<string, unknown>> = [];
		if (resultData) {
			if (Array.isArray(resultData)) messages = resultData;
			else if (Array.isArray(resultData.messages)) messages = resultData.messages;
		}
		if (messages.length > 0) {
			return (
				<div className="space-y-1">
					{messages.slice(-6).map((msg, i) => {
						const isMe = msg.is_from_me === true || msg.is_from_me === 1;
						return (
							<div key={i} className={`text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] ${
								isMe ? 'bg-[var(--color-primary)]/8 ml-6' : 'bg-[var(--surface-base)] mr-6'
							}`}>
								{!isMe && msg.sender ? (
									<span className="font-medium text-[var(--text-secondary)]">{String(msg.sender)}: </span>
								) : null}
								<span className="text-[var(--text-muted)]">
									{String(msg.text || msg.body || msg.content || '').slice(0, 150)}
								</span>
							</div>
						);
					})}
				</div>
			);
		}
		return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="200px" />) : null;
	}

	// Conversations
	if (op === 'conversations') {
		let convos: Array<Record<string, unknown>> = [];
		if (resultData) {
			if (Array.isArray(resultData)) convos = resultData;
			else if (Array.isArray(resultData.conversations)) convos = resultData.conversations;
		}
		if (convos.length > 0) {
			return (
				<div className="space-y-1">
					{convos.slice(0, 8).map((c, i) => (
						<div key={i} className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
							<MessageSquare className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
							<span className="font-medium text-[var(--text-secondary)] truncate">
								{String(c.display_name || c.name || c.chat_id || 'Unknown')}
							</span>
							{c.last_message ? (
								<span className="text-[var(--text-muted)] truncate flex-1 text-[10px]">
									{String(c.last_message).slice(0, 40)}
								</span>
							) : null}
						</div>
					))}
				</div>
			);
		}
		return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />) : null;
	}

	// Default (unread, test)
	return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />) : null;
}

// =============================================================================
// OPPORTUNITY
// =============================================================================

export function OpportunityExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const name = rawInput?.name ? String(rawInput.name) : '';
	const company = rawInput?.company ? String(rawInput.company) : '';
	const role = rawInput?.role ? String(rawInput.role) : '';
	const stage = rawInput?.stage ? String(rawInput.stage) : '';
	const tier = rawInput?.tier ? String(rawInput.tier) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	// List
	if (op === 'list') {
		let opps: Array<Record<string, unknown>> = [];
		if (resultData) {
			if (Array.isArray(resultData)) opps = resultData;
			else if (Array.isArray(resultData.opportunities)) opps = resultData.opportunities;
		}
		if (opps.length > 0) {
			return (
				<div className="space-y-1">
					{opps.slice(0, 8).map((opp, i) => (
						<div key={i} className="flex items-center gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
							{opp.tier ? <StatusBadge label={String(opp.tier)} color={TIER_COLORS[String(opp.tier)] || 'var(--text-muted)'} /> : null}
							<span className="font-medium text-[var(--text-secondary)] truncate">
								{String(opp.name || opp.company || 'Unknown')}
							</span>
							{opp.stage ? <span className="text-[var(--text-muted)] ml-auto text-[10px]">{String(opp.stage)}</span> : null}
						</div>
					))}
					{opps.length > 8 && <div className="text-[10px] text-[var(--text-muted)]">+{opps.length - 8} more</div>}
				</div>
			);
		}
		return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />) : null;
	}

	// Create/Update/Get — detail view
	if (name || company || role) {
		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2 flex-wrap">
					{tier && <StatusBadge label={tier} color={TIER_COLORS[tier] || 'var(--text-muted)'} />}
					<span className="text-[12px] font-medium text-[var(--text-primary)]">{name || company}</span>
					{stage && <StatusBadge label={stage} color="var(--color-primary)" />}
				</div>
				{role && <KeyValue label="Role" value={role} />}
				{company && name && <KeyValue label="Company" value={company} />}
				{rawResult && (
					hasError ? <ErrorBox message={rawResult} /> :
					resultData?.success ? <ResultIndicator success successText={op || 'Done'} /> :
					<CodeBlock code={rawResult} maxHeight="100px" />
				)}
			</div>
		);
	}

	// Default
	return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="150px" />) : null;
}

// =============================================================================
// REPLY TO CHIEF
// =============================================================================

export function ReplyExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const message = rawInput?.message ? String(rawInput.message) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	return (
		<div className="space-y-2">
			{message && (
				<div className="flex items-start gap-2 text-[11px] bg-[var(--color-claude)]/8 px-3 py-2 rounded-lg border border-[var(--color-claude)]/15">
					<MessageSquare className="w-3.5 h-3.5 text-[var(--color-claude)] flex-shrink-0 mt-0.5" />
					<span className="text-[var(--text-secondary)] leading-relaxed">{message}</span>
				</div>
			)}
			{rawResult && (
				hasError ? <ErrorBox message={rawResult} /> :
				resultData?.success ? <ResultIndicator success successText="Delivered" /> :
				<CodeBlock code={rawResult} maxHeight="80px" />
			)}
		</div>
	);
}

// =============================================================================
// SKILL
// =============================================================================

export function SkillExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const skill = rawInput?.skill ? String(rawInput.skill) : '';
	const hasError = isErrorResult(rawResult);

	return (
		<div className="space-y-2">
			{skill && (
				<div className="flex items-center gap-2">
					<Zap className="w-3.5 h-3.5 text-[var(--color-warning)]" />
					<span className="text-[12px] font-medium text-[var(--text-primary)]">/{skill}</span>
				</div>
			)}
			{hasError && rawResult && <ErrorBox message={rawResult} />}
		</div>
	);
}

// =============================================================================
// PET (Companion)
// =============================================================================

export function PetExpanded({ rawInput, rawResult }: ToolExpandedProps) {
	const op = String(rawInput?.operation || '');
	const message = rawInput?.message ? String(rawInput.message) : '';
	const hasError = isErrorResult(rawResult);
	const resultData = !hasError ? parseResult(rawResult) : null;

	// Note — show the message
	if (op === 'note' && message) {
		return (
			<div className="space-y-2">
				<div className="flex items-start gap-2 text-[11px] bg-[#f59e0b]/8 px-3 py-2 rounded-lg border border-[#f59e0b]/15">
					<span className="text-[var(--text-secondary)] leading-relaxed">{message}</span>
				</div>
				{rawResult && (
					hasError ? <ErrorBox message={rawResult} /> :
					resultData?.success ? <ResultIndicator success successText="Note left" /> :
					null
				)}
			</div>
		);
	}

	// Status — show companion's state
	if (op === 'status' && resultData) {
		const mood = resultData.mood ? String(resultData.mood) : '';
		const stage = resultData.stage ? String(resultData.stage) : '';
		const lastFed = resultData.last_fed ? String(resultData.last_fed) : '';
		return (
			<div className="space-y-1.5">
				{mood && <KeyValue label="Mood" value={mood} />}
				{stage && <KeyValue label="Stage" value={stage} />}
				{lastFed && <KeyValue label="Last fed" value={lastFed} />}
			</div>
		);
	}

	// Play/Feed — just show success
	if (op === 'play' || op === 'feed') {
		return rawResult ? (
			hasError ? <ErrorBox message={rawResult} /> :
			resultData?.success ? <ResultIndicator success successText={op === 'feed' ? 'Fed' : 'Played'} /> :
			<CodeBlock code={rawResult} maxHeight="80px" />
		) : null;
	}

	// Default
	return rawResult ? (hasError ? <ErrorBox message={rawResult} /> : <CodeBlock code={rawResult} maxHeight="100px" />) : null;
}

// =============================================================================
// EXPORT MAP
// =============================================================================

export const mcpCoreExpandedViews = {
	// Team orchestration
	team: TeamExpanded,

	// Data tools
	priority: PriorityExpanded,
	contact: ContactExpanded,
	email: EmailExpanded,
	calendar: CalendarExpanded,
	messages: MessagesExpanded,
	opportunity: OpportunityExpanded,
	pet: PetExpanded,

	// Communication
	reply_to_chief: ReplyExpanded,

	// Skills
	Skill: SkillExpanded,

	// NOTE: status, timeline, log, ping, show are intentionally NOT mapped here.
	// They render as non-expandable system event chips — the one-liner is complete info.
};
