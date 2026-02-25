'use client';

/**
 * ScheduleCard — Block-level card for schedule() tool calls.
 *
 * Renders as a self-contained card (not chip + expanded).
 * Shows operation type, human-readable time, action type, and payload at a glance.
 * Spinner while running, success/error indicator when complete.
 */

import { AlertCircle, Check, Clock, Loader2, Minus, Plus, List, ToggleLeft, ToggleRight, History } from 'lucide-react';
import { isErrorResult } from './shared';

interface ScheduleCardProps {
	toolInput?: Record<string, unknown>;
	resultContent?: string;
}

// ─── Cron description ────────────────────────────────────────────────────────

type CronFormatter = (m: RegExpMatchArray) => string;

function fmtHour(h: number, m?: number): string {
	const period = h >= 12 ? 'PM' : 'AM';
	const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
	if (m !== undefined && m > 0) return `${hour}:${String(m).padStart(2, '0')} ${period}`;
	return `${hour} ${period}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtDays(dayStr: string): string {
	const days = dayStr.split(',').map(Number);
	if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
	if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
	return days.map(d => DAY_NAMES[d] || d).join(', ');
}

const CRON_DESCRIPTIONS: [RegExp, CronFormatter][] = [
	[/^\*\/(\d+) \* \* \* \*$/, (m: RegExpMatchArray) => `Every ${m[1]} min`],
	[/^0 \*\/(\d+) \* \* \*$/, (m: RegExpMatchArray) => `Every ${m[1]} hr`],
	[/^\* \* \* \* \*$/, () => 'Every minute'],
	[/^0 \* \* \* \*$/, () => 'Every hour'],
	[/^(\d+) (\d+) \* \* \*$/, (m: RegExpMatchArray) => `Daily at ${fmtHour(Number(m[2]), Number(m[1]))}`],
	[/^0 (\d+) \* \* \*$/, (m: RegExpMatchArray) => `Daily at ${fmtHour(Number(m[1]))}`],
	[/^(\d+) (\d+) \* \* ([0-6,]+)$/, (m: RegExpMatchArray) => `${fmtDays(m[3])} at ${fmtHour(Number(m[2]), Number(m[1]))}`],
];

function describeCron(expr: string): string | null {
	const trimmed = expr.trim();
	for (const [pattern, formatter] of CRON_DESCRIPTIONS) {
		const match = trimmed.match(pattern);
		if (match) return formatter(match);
	}
	return null;
}

// ─── ISO datetime formatting ─────────────────────────────────────────────────

function describeISOTime(iso: string): string | null {
	try {
		const date = new Date(iso);
		if (isNaN(date.getTime())) return null;

		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const isTomorrow = date.toDateString() === tomorrow.toDateString();

		const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

		if (isToday) return `Today at ${time}`;
		if (isTomorrow) return `Tomorrow at ${time}`;

		const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
		return `${dateStr} at ${time}`;
	} catch {
		return null;
	}
}

// ─── Expression → human-readable ─────────────────────────────────────────────

function describeExpression(expr: string): { text: string; isOneOff: boolean } {
	// Try ISO datetime first
	const isoDesc = describeISOTime(expr);
	if (isoDesc) return { text: isoDesc, isOneOff: true };

	// Try cron
	const cronDesc = describeCron(expr);
	if (cronDesc) return { text: cronDesc, isOneOff: false };

	// Fallback: show raw
	return { text: expr, isOneOff: expr.includes('T') };
}

// ─── Operation config ────────────────────────────────────────────────────────

const OP_CONFIG: Record<string, { icon: typeof Plus; label: string; color: string }> = {
	add: { icon: Plus, label: 'Schedule', color: 'var(--color-success)' },
	remove: { icon: Minus, label: 'Remove', color: 'var(--color-error)' },
	list: { icon: List, label: 'List', color: 'var(--color-info)' },
	enable: { icon: ToggleRight, label: 'Enable', color: 'var(--color-success)' },
	disable: { icon: ToggleLeft, label: 'Disable', color: 'var(--text-muted)' },
	history: { icon: History, label: 'History', color: 'var(--color-info)' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ScheduleCard({ toolInput, resultContent }: ScheduleCardProps) {
	const op = String(toolInput?.operation || 'add');
	const isRunning = resultContent === undefined || resultContent === null;
	const hasError = isErrorResult(resultContent);

	const config = OP_CONFIG[op] || OP_CONFIG.add;
	const OpIcon = config.icon;

	// Parse result
	let resultData: Record<string, unknown> | null = null;
	if (resultContent && !hasError) {
		try { resultData = JSON.parse(resultContent); } catch { /* not JSON */ }
	}

	// ─── ADD operation ─────────────────────────────────────────────────────
	if (op === 'add') {
		const expr = toolInput?.expression ? String(toolInput.expression) : '';
		const action = toolInput?.action ? String(toolInput.action) : '';
		const payload = toolInput?.payload ? String(toolInput.payload) : '';
		const critical = Boolean(toolInput?.critical);
		const { text: timeText, isOneOff } = expr ? describeExpression(expr) : { text: '', isOneOff: false };

		return (
			<div className="my-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)]">
					<span
						className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
						style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`, color: config.color }}
					>
						{isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <OpIcon className="w-3 h-3" />}
					</span>
					<span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
						{isOneOff ? 'Reminder' : 'Schedule'}
					</span>
					{critical && (
						<span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium bg-[var(--color-error)]/15 text-[var(--color-error)]">
							Critical
						</span>
					)}
					{/* Result indicator */}
					{!isRunning && (
						<span className="ml-auto flex items-center gap-1">
							{hasError ? (
								<AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
							) : (
								<Check className="w-3 h-3 text-[var(--color-success)]" />
							)}
						</span>
					)}
				</div>

				{/* Body */}
				<div className="px-3 py-2 space-y-1.5">
					{/* Time row */}
					{timeText && (
						<div className="flex items-center gap-2">
							<Clock className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
							<span className="text-[12px] font-medium text-[var(--text-primary)]">{timeText}</span>
							{action && (
								<span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium bg-[var(--surface-muted)] text-[var(--text-muted)]">
									{action}
								</span>
							)}
						</div>
					)}

					{/* Payload */}
					{payload && (
						<div className="text-[11px] text-[var(--text-secondary)] pl-5 truncate">
							{payload.length > 120 ? payload.slice(0, 120) + '...' : payload}
						</div>
					)}

					{/* Raw expression fallback if no timeText */}
					{!timeText && expr && (
						<code className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
							{expr}
						</code>
					)}

					{/* Error */}
					{hasError && resultContent && (
						<div className="text-[10px] text-[var(--color-error)] font-mono truncate">
							{resultContent.length > 100 ? resultContent.slice(0, 100) + '...' : resultContent}
						</div>
					)}
				</div>
			</div>
		);
	}

	// ─── LIST operation ────────────────────────────────────────────────────
	if (op === 'list') {
		const entries = (resultData as Record<string, unknown> | null)?.entries;
		const entryList = Array.isArray(entries) ? entries as Array<{ expression?: string; action?: string; payload?: string; enabled?: boolean; id?: string }> : [];

		return (
			<div className="my-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
				<div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)]">
					<span
						className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
						style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`, color: config.color }}
					>
						{isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <OpIcon className="w-3 h-3" />}
					</span>
					<span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
						Schedule
					</span>
					{!isRunning && entryList.length > 0 && (
						<span className="text-[10px] text-[var(--text-muted)]">
							{entryList.length} {entryList.length === 1 ? 'entry' : 'entries'}
						</span>
					)}
					{!isRunning && (
						<span className="ml-auto flex items-center gap-1">
							{hasError ? (
								<AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
							) : (
								<Check className="w-3 h-3 text-[var(--color-success)]" />
							)}
						</span>
					)}
				</div>

				{/* Entry list */}
				{entryList.length > 0 && (
					<div className="px-3 py-2 space-y-1">
						{entryList.slice(0, 8).map((entry, i) => {
							const desc = entry.expression ? describeExpression(entry.expression) : null;
							return (
								<div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
									<span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.enabled === false ? 'bg-[var(--text-muted)]' : 'bg-[var(--color-success)]'}`} />
									<span className="text-[var(--text-secondary)] font-medium flex-shrink-0">
										{desc?.text || entry.expression}
									</span>
									<span className="text-[var(--text-muted)] truncate">
										{entry.action}{entry.payload ? ` · ${entry.payload}` : ''}
									</span>
								</div>
							);
						})}
						{entryList.length > 8 && (
							<div className="text-[10px] text-[var(--text-muted)] pl-3.5">
								+{entryList.length - 8} more
							</div>
						)}
					</div>
				)}

				{hasError && resultContent && (
					<div className="px-3 py-2 text-[10px] text-[var(--color-error)] font-mono truncate">
						{resultContent.length > 100 ? resultContent.slice(0, 100) + '...' : resultContent}
					</div>
				)}
			</div>
		);
	}

	// ─── REMOVE / ENABLE / DISABLE ─────────────────────────────────────────
	if (op === 'remove' || op === 'enable' || op === 'disable') {
		const id = toolInput?.id ? String(toolInput.id) : '';
		return (
			<div className="my-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
				<div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)]">
					<span
						className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
						style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`, color: config.color }}
					>
						{isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <OpIcon className="w-3 h-3" />}
					</span>
					<span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
						{config.label}
					</span>
					{id && (
						<code className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
							{id.length > 12 ? id.slice(0, 12) + '...' : id}
						</code>
					)}
					{!isRunning && (
						<span className="ml-auto flex items-center gap-1">
							{hasError ? (
								<AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
							) : (
								<Check className="w-3 h-3 text-[var(--color-success)]" />
							)}
						</span>
					)}
				</div>

				{hasError && resultContent && (
					<div className="px-3 py-2 text-[10px] text-[var(--color-error)] font-mono truncate">
						{resultContent.length > 100 ? resultContent.slice(0, 100) + '...' : resultContent}
					</div>
				)}
			</div>
		);
	}

	// ─── HISTORY ───────────────────────────────────────────────────────────
	if (op === 'history') {
		const runs = (() => {
			if (!resultData) return [];
			const h = (resultData as Record<string, unknown>).history;
			if (Array.isArray(h)) return h as Array<{ timestamp?: string; action?: string; status?: string }>;
			if (Array.isArray(resultData)) return resultData as Array<{ timestamp?: string; action?: string; status?: string }>;
			return [];
		})();

		return (
			<div className="my-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
				<div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)]">
					<span
						className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
						style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`, color: config.color }}
					>
						{isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <OpIcon className="w-3 h-3" />}
					</span>
					<span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
						Run History
					</span>
					{!isRunning && (
						<span className="ml-auto flex items-center gap-1">
							{hasError ? (
								<AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
							) : (
								<Check className="w-3 h-3 text-[var(--color-success)]" />
							)}
						</span>
					)}
				</div>

				{runs.length > 0 && (
					<div className="px-3 py-2 space-y-1">
						{runs.slice(0, 10).map((run, i) => {
							const timeStr = run.timestamp ? (() => {
								try {
									return new Date(run.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
								} catch { return run.timestamp; }
							})() : '';
							const isOk = run.status === 'ok' || run.status === 'success';
							return (
								<div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
									<span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOk ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
									{timeStr && <span className="text-[10px] font-mono text-[var(--text-muted)] flex-shrink-0">{timeStr}</span>}
									<span className="text-[var(--text-secondary)] truncate">{run.action}</span>
								</div>
							);
						})}
					</div>
				)}

				{hasError && resultContent && (
					<div className="px-3 py-2 text-[10px] text-[var(--color-error)] font-mono truncate">
						{resultContent.length > 100 ? resultContent.slice(0, 100) + '...' : resultContent}
					</div>
				)}
			</div>
		);
	}

	// ─── Fallback for unknown operations ───────────────────────────────────
	return (
		<div className="my-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
			<div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)]">
				<span
					className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
					style={{ backgroundColor: `color-mix(in srgb, var(--text-muted) 15%, transparent)`, color: 'var(--text-muted)' }}
				>
					{isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
				</span>
				<span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
					Schedule · {op}
				</span>
				{!isRunning && (
					<span className="ml-auto flex items-center gap-1">
						{hasError ? (
							<AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
						) : (
							<Check className="w-3 h-3 text-[var(--color-success)]" />
						)}
					</span>
				)}
			</div>
		</div>
	);
}
