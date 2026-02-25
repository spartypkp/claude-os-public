'use client';

/**
 * Error Boundary System
 *
 * Three fallback variants, ordered by blast radius:
 * - PanelErrorCard: ClaudePanel crash (highest — loses Claude access)
 * - WindowErrorCard: single DesktopWindow crash (medium — one window dies)
 * - ComponentErrorCard: inline widget crash (low — tiny piece breaks)
 *
 * Design: errors are expected (Claude edits the UI live).
 * Treat as partial loading states, not catastrophic failures.
 * Action-first layout: buttons before explanations (ADHD scan pattern).
 * Visual language matches the rest of Claude OS (CSS variables, no hardcoded grays).
 */

import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Clipboard, RefreshCw, X } from 'lucide-react';
import { getErrorMessage } from './error-messages';
import { copyErrorToClipboard } from './copy-error';
import { DEFAULT_PANEL_WIDTH } from '@/components/ClaudePanel/constants';

/** Coerce unknown error to Error instance */
function toError(thrown: unknown): Error {
	if (thrown instanceof Error) return thrown;
	return new Error(typeof thrown === 'string' ? thrown : String(thrown));
}

// =============================================================================
// AUTO-RETRY HOOK (exported for route-level error pages)
// =============================================================================

/** Auto-retry with escalating delays: 5s -> 15s -> 30s -> give up */
export function useAutoRetry(resetFn: () => void, maxRetries = 3) {
	const [retryCount, setRetryCount] = useState(0);
	const [countdown, setCountdown] = useState(0);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const countdownRef = useRef<NodeJS.Timeout | null>(null);

	const delays = [5, 15, 30];

	useEffect(() => {
		if (retryCount >= maxRetries) return;

		const delay = delays[Math.min(retryCount, delays.length - 1)];
		setCountdown(delay);

		countdownRef.current = setInterval(() => {
			setCountdown((c) => Math.max(0, c - 1));
		}, 1000);

		timerRef.current = setTimeout(() => {
			setRetryCount((c) => c + 1);
			resetFn();
		}, delay * 1000);

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
			if (countdownRef.current) clearInterval(countdownRef.current);
		};
	}, [retryCount, maxRetries, resetFn]);

	const retryNow = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		if (countdownRef.current) clearInterval(countdownRef.current);
		setRetryCount((c) => c + 1);
		resetFn();
	}, [resetFn]);

	return { countdown, retryCount, maxRetries, gaveUp: retryCount >= maxRetries, retryNow };
}

// =============================================================================
// SHARED UI
// =============================================================================

function CopyForClaudeButton({ error: rawError, componentName, size = 'sm' }: { error: unknown; componentName?: string; size?: 'sm' | 'md' }) {
	const error = toError(rawError);
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		const success = await copyErrorToClipboard(error, componentName);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<button
			onClick={handleCopy}
			className={`inline-flex items-center gap-1.5 rounded-md
				bg-[var(--surface-muted)] hover:bg-[var(--surface-accent)]
				text-[var(--text-secondary)] hover:text-[var(--text-primary)]
				border border-[var(--border-subtle)] transition-colors
				${size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-xs'}`}
		>
			{copied ? <Check className="w-3 h-3 text-[var(--color-success)]" /> : <Clipboard className="w-3 h-3" />}
			{copied ? 'Copied!' : 'Copy for Claude'}
		</button>
	);
}

function RecoveryWarning({ panelCrashed }: { panelCrashed?: boolean }) {
	return (
		<div className="flex items-start gap-1.5 text-[10px] text-[var(--text-muted)] pt-2 mt-2 border-t border-[var(--border-subtle)]">
			<AlertTriangle className="w-3 h-3 shrink-0 mt-px text-[var(--color-warning)]" />
			<span>
				{panelCrashed ? 'Panel is down' : 'Claude not responding'}?
				Paste into tmux. Nothing working? Run{' '}
				<code className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-mono">./restart.sh</code>
			</span>
		</div>
	);
}

function ErrorDetails({ error: rawError }: { error: unknown }) {
	const error = toError(rawError);
	const [open, setOpen] = useState(false);

	return (
		<div className="w-full">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
			>
				<ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
				Details
			</button>
			{open && (
				<pre className="mt-1 p-2 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-sunken)] rounded border border-[var(--border-subtle)] overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
					{error.message}
					{error.stack && `\n\n${error.stack.split('\n').slice(1, 8).join('\n')}`}
				</pre>
			)}
		</div>
	);
}

/** Retro TV icon shared between Window and Panel cards */
function RetroTV({ icon, size = 'md' }: { icon: string; size?: 'sm' | 'md' }) {
	const isMd = size === 'md';
	return (
		<div className="relative">
			<div className={`${isMd ? 'w-24 h-20' : 'w-16 h-14'} rounded-lg bg-gradient-to-br from-[var(--surface-muted)] to-[var(--surface-accent)] border-4 border-[var(--border-strong)] shadow-lg flex items-center justify-center overflow-hidden`}>
				<div className={`${isMd ? 'text-4xl animate-pulse' : 'text-2xl'}`}>{icon}</div>
				<div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)] pointer-events-none" />
			</div>
			<div className={`absolute ${isMd ? '-top-3' : '-top-2'} left-1/2 -translate-x-1/2 flex ${isMd ? 'gap-2' : 'gap-1.5'}`}>
				<div className={`w-0.5 ${isMd ? 'h-4' : 'h-3'} bg-[var(--border-strong)] rotate-[-20deg] origin-bottom`} />
				<div className={`w-0.5 ${isMd ? 'h-4' : 'h-3'} bg-[var(--border-strong)] rotate-[20deg] origin-bottom`} />
			</div>
			{isMd && (
				<div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-2 bg-[var(--border-strong)] rounded-b-sm" />
			)}
		</div>
	);
}

// =============================================================================
// COMPONENT ERROR CARD (inline, smallest blast radius)
// =============================================================================

interface ComponentErrorCardProps extends FallbackProps {
	componentName?: string;
}

export function ComponentErrorCard({ error: rawError, resetErrorBoundary, componentName }: ComponentErrorCardProps) {
	const error = toError(rawError);
	const msg = getErrorMessage(error);
	const { countdown, gaveUp, retryNow, retryCount, maxRetries } = useAutoRetry(resetErrorBoundary);

	return (
		<div className="flex flex-col items-start gap-1.5 p-3 min-h-[60px]">
			{/* Header + action on same row */}
			<div className="flex items-center gap-2 w-full">
				<span className="text-lg">{msg.icon}</span>
				<span className="text-xs font-medium text-[var(--text-primary)] flex-1">{msg.headline}</span>
				<button
					onClick={retryNow}
					className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded
						bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
				>
					<RefreshCw className="w-3 h-3" />
					{!gaveUp && countdown > 0 ? `Retry (${countdown}s)` : 'Retry'}
				</button>
			</div>

			{/* Guidance — muted, below the action */}
			<div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
				{!gaveUp ? (
					<>
						{componentName && <>{componentName}: </>}
						Likely transient. {retryCount > 0 && `Attempt ${retryCount}/${maxRetries}. `}
						Claude may be mid-edit.
					</>
				) : (
					<>Persisted through {maxRetries} retries. Copy and paste to Claude.</>
				)}
			</div>

			{/* Secondary actions + details */}
			<div className="flex items-center gap-2">
				<CopyForClaudeButton error={error} componentName={componentName} />
				<ErrorDetails error={error} />
			</div>

			{gaveUp && <RecoveryWarning />}
		</div>
	);
}

// =============================================================================
// WINDOW ERROR CARD (fills a DesktopWindow, medium blast radius)
// =============================================================================

interface WindowErrorCardProps extends FallbackProps {
	windowTitle?: string;
	onClose?: () => void;
}

export function WindowErrorCard({ error: rawError, resetErrorBoundary, windowTitle, onClose }: WindowErrorCardProps) {
	const error = toError(rawError);
	const msg = getErrorMessage(error);
	const { countdown, gaveUp, retryNow, retryCount, maxRetries } = useAutoRetry(resetErrorBoundary);

	return (
		<div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
			<RetroTV icon={msg.icon} size="sm" />

			{/* Title */}
			<div className="text-sm font-medium text-[var(--text-primary)]">
				{windowTitle ? `${windowTitle} stopped responding` : 'This window stopped responding'}
			</div>

			{/* Actions first */}
			<div className="flex flex-wrap items-center justify-center gap-2">
				<button
					onClick={retryNow}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
						bg-blue-600 hover:bg-blue-700 text-white transition-colors"
				>
					<RefreshCw className="w-3 h-3" />
					{!gaveUp && countdown > 0 ? `Reload (${countdown}s)` : 'Reload'}
				</button>
				{onClose && (
					<button
						onClick={onClose}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
							bg-[var(--surface-muted)] hover:bg-[var(--surface-accent)]
							text-[var(--text-secondary)] border border-[var(--border-subtle)]
							transition-colors"
					>
						<X className="w-3 h-3" />
						Close
					</button>
				)}
				<CopyForClaudeButton error={error} componentName={windowTitle || 'Window'} />
			</div>

			{/* Guidance — muted, below actions */}
			<div className="text-[11px] text-[var(--text-muted)] max-w-[280px] leading-relaxed">
				{!gaveUp ? (
					<>
						Usually transient. Claude may be editing this file.
						{retryCount > 0 && <> Attempt {retryCount}/{maxRetries}.</>}
					</>
				) : (
					<>Persisted through {maxRetries} retries. Copy the error and paste to Claude.</>
				)}
			</div>

			<ErrorDetails error={error} />

			{gaveUp && (
				<div className="max-w-[280px] w-full">
					<RecoveryWarning />
				</div>
			)}
		</div>
	);
}

// =============================================================================
// PANEL ERROR CARD (fills ClaudePanel, highest blast radius)
// Uses Claude brand colors to match EmptyState in the same context.
// =============================================================================

export function PanelErrorCard({ error: rawError, resetErrorBoundary }: FallbackProps) {
	const error = toError(rawError);
	const msg = getErrorMessage(error);
	const { countdown, gaveUp, retryNow, retryCount, maxRetries } = useAutoRetry(resetErrorBoundary);

	return (
		<div
			className="h-full flex flex-col shrink-0 bg-[var(--surface-claude)] border-l border-[var(--border-claude)] shadow-[-4px_0_20px_rgba(0,0,0,0.15)]"
			style={{ width: DEFAULT_PANEL_WIDTH }}
		>
			<div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
				<RetroTV icon={msg.icon} size="md" />

				<h3 className="mt-6 text-sm font-medium text-[var(--text-primary)]">
					{msg.headline}
				</h3>

				{/* Actions — Claude brand gradient to match EmptyState */}
				<div className="mt-3 flex flex-col items-center gap-2">
					<button
						onClick={retryNow}
						className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
							bg-gradient-to-b from-[var(--color-claude)] to-[var(--color-primary-hover)]
							text-white text-xs font-medium
							shadow-lg shadow-[var(--color-claude)]/20
							hover:shadow-xl hover:shadow-[var(--color-claude)]/30 hover:scale-105
							transition-all"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						{!gaveUp && countdown > 0 ? `Retry (${countdown}s)` : 'Retry'}
					</button>
					<CopyForClaudeButton error={error} componentName="ClaudePanel" size="md" />
				</div>

				{/* Guidance */}
				<p className="mt-3 text-[11px] text-[var(--text-muted)] max-w-[260px] leading-relaxed">
					{!gaveUp ? (
						<>
							Usually transient. Claude may be mid-edit.
							{retryCount > 0 && <> Attempt {retryCount}/{maxRetries}.</>}
						</>
					) : (
						<>Persisted through {maxRetries} retries. Copy the error above and paste into a tmux window.</>
					)}
				</p>

				{/* Details */}
				<div className="mt-3 w-full max-w-[280px]">
					<ErrorDetails error={error} />
				</div>

				{/* Recovery — always visible since panel IS Claude */}
				<div className="mt-3 max-w-[280px] w-full text-left">
					<RecoveryWarning panelCrashed />
				</div>
			</div>
		</div>
	);
}

// =============================================================================
// BACKEND HEALTH BANNER
// =============================================================================

interface BackendBannerProps {
	connected: boolean;
}

export function BackendBanner({ connected }: BackendBannerProps) {
	const [show, setShow] = useState(false);
	const [disconnectedAt, setDisconnectedAt] = useState<number | null>(null);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (!connected) {
			setDisconnectedAt((prev) => prev ?? Date.now());
			const timer = setTimeout(() => setShow(true), 3000);
			return () => clearTimeout(timer);
		}
		setShow(false);
		setDisconnectedAt(null);
		setElapsed(0);
	}, [connected]);

	useEffect(() => {
		if (!disconnectedAt || !show) return;
		const timer = setInterval(() => {
			setElapsed(Math.floor((Date.now() - disconnectedAt) / 1000));
		}, 1000);
		return () => clearInterval(timer);
	}, [disconnectedAt, show]);

	if (!show) return null;

	const isLong = elapsed > 120;

	return (
		<div
			className={`
				shrink-0 px-3 py-1.5 text-xs flex items-center justify-center gap-2
				border-b transition-colors
				${isLong
					? 'bg-[var(--color-error)]/10 border-[var(--color-error)]/20 text-[var(--color-error)]'
					: 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20 text-[var(--color-warning)]'
				}
			`}
		>
			<div className={`w-1.5 h-1.5 rounded-full ${isLong ? 'bg-[var(--color-error)]' : 'bg-[var(--color-warning)] animate-pulse'}`} />
			{isLong ? (
				<span>Backend unreachable for {Math.floor(elapsed / 60)}m {elapsed % 60}s</span>
			) : (
				<span>Backend reconnecting... {elapsed > 0 && `(${elapsed}s)`}</span>
			)}
		</div>
	);
}

// =============================================================================
// CONVENIENCE WRAPPER
// =============================================================================

/**
 * Wrap a component with an error boundary.
 * Includes QueryErrorResetBoundary so React Query errors reset properly.
 */
export function WithErrorBoundary({
	children,
	name,
	resetKeys,
	silent,
}: {
	children: ReactNode;
	name: string;
	resetKeys?: unknown[];
	/** If true, renders nothing on error (for menubar items) */
	silent?: boolean;
}) {
	if (silent) {
		return (
			<ErrorBoundary
				fallback={<></>}
				onError={(e) => console.error(`[${name}]`, e)}
				resetKeys={resetKeys}
			>
				{children}
			</ErrorBoundary>
		);
	}

	return (
		<QueryErrorResetBoundary>
			{({ reset }) => (
				<ErrorBoundary
					FallbackComponent={(props) => <ComponentErrorCard {...props} componentName={name} />}
					onReset={reset}
					onError={(e) => console.error(`[${name}]`, e)}
					resetKeys={resetKeys}
				>
					{children}
				</ErrorBoundary>
			)}
		</QueryErrorResetBoundary>
	);
}
