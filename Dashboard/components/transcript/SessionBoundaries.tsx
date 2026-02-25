'use client';

/**
 * Session Boundary Components — shared renderers for session lifecycle markers.
 *
 * Used by TranscriptViewer (production) and UI Test Suite (visual audit).
 * Single source of truth — any changes here affect both.
 *
 * Layout: full-width orange line with centered chip overlaid on top.
 * The chip has a solid background that masks the line beneath it.
 */

import {
	Brain,
	Check,
	RefreshCw,
} from 'lucide-react';
import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';

// =============================================================================
// SHARED UTILITIES
// =============================================================================

/** Specialist phase ordering */
const PHASE_ORDER = ['preparation', 'implementation', 'verification'] as const;
type Phase = typeof PHASE_ORDER[number];

function formatModeName(mode: string): string {
	const modeMap: Record<string, string> = {
		'preparation': 'Preparation',
		'implementation': 'Implementation',
		'verification': 'Verification',
		'interactive': 'Interactive',
	};
	return modeMap[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
}

export function formatBoundaryTime(ts: string): string {
	try {
		const date = new Date(ts);
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	} catch {
		return '';
	}
}

/** Shared wrapper: full-width line behind a centered chip */
function BoundaryLine({ children }: { children: React.ReactNode }) {
	return (
		<div className="py-4 my-2">
			<div className="relative flex items-center justify-center">
				{/* Full-width line behind the chip */}
				<div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-[var(--color-claude)] opacity-40" />
				{/* Chip overlaid — solid bg masks the line */}
				<div className="relative">
					{children}
				</div>
			</div>
		</div>
	);
}

/** Shared chip styling */
function BoundaryChip({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--surface-claude)] border-[0.5px]"
			style={{ borderColor: 'color-mix(in srgb, var(--color-claude) 20%, transparent)' }}
		>
			{children}
		</div>
	);
}

/** Shared timestamp display */
function BoundaryTime({ time }: { time: string }) {
	if (!time) return null;
	return (
		<>
			<span className="w-1 h-1 rounded-full bg-[var(--color-claude)] opacity-30" />
			<span className="text-[10px] text-[var(--color-claude)] opacity-50">{time}</span>
		</>
	);
}

// =============================================================================
// SESSION BOUNDARY COMPONENTS
// =============================================================================

/**
 * Session Start Boundary — first session in a conversation.
 */
export function SessionStartBoundary({ timestamp }: { timestamp?: string }) {
	const time = timestamp ? formatBoundaryTime(timestamp) : '';
	return (
		<BoundaryLine>
			<BoundaryChip>
				<ClaudeLogo className="w-3.5 h-3.5 text-[var(--color-claude)]" />
				<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-claude)] opacity-80">
					Session started
				</span>
				<BoundaryTime time={time} />
			</BoundaryChip>
		</BoundaryLine>
	);
}

/**
 * Mode Transition Boundary — shows phase progression bar for autonomous specialist flows.
 * e.g. Preparation ✓ → Implementation ● → Verification ○
 */
export function ModeTransitionBoundary({ mode, timestamp }: { mode?: string; timestamp?: string }) {
	const time = timestamp ? formatBoundaryTime(timestamp) : '';
	const currPhaseIdx = PHASE_ORDER.indexOf(mode as Phase);

	return (
		<BoundaryLine>
			<BoundaryChip>
				<div className="flex items-center gap-1">
					{PHASE_ORDER.map((phase, idx) => {
						const isCompleted = idx < currPhaseIdx;
						const isCurrent = idx === currPhaseIdx;
						const isFuture = idx > currPhaseIdx;

						const phaseColors: Record<string, string> = {
							preparation: 'var(--color-primary)',
							implementation: 'var(--color-warning)',
							verification: 'var(--color-success)',
						};
						const color = phaseColors[phase] || 'var(--text-muted)';

						return (
							<div key={phase} className="flex items-center gap-1">
								{idx > 0 && (
									<div
										className="w-4 h-px"
										style={{
											backgroundColor: isCompleted || isCurrent
												? color
												: 'var(--border-subtle)',
											opacity: isCompleted || isCurrent ? 0.6 : 0.3,
										}}
									/>
								)}
								<div className="flex items-center gap-1">
									{isCompleted ? (
										<Check className="w-3 h-3" style={{ color }} />
									) : isCurrent ? (
										<div
											className="w-2 h-2 rounded-full"
											style={{ backgroundColor: color }}
										/>
									) : (
										<div
											className="w-2 h-2 rounded-full border"
											style={{ borderColor: 'var(--text-muted)', opacity: 0.3 }}
										/>
									)}
									<span
										className="text-[10px] font-medium"
										style={{
											color: isFuture ? 'var(--text-muted)' : color,
											opacity: isFuture ? 0.4 : 1,
										}}
									>
										{formatModeName(phase).slice(0, 4)}
									</span>
								</div>
							</div>
						);
					})}
				</div>
				<BoundaryTime time={time} />
			</BoundaryChip>
		</BoundaryLine>
	);
}

/**
 * Reset Boundary — shown when a session calls reset() for context handoff.
 */
export function ResetBoundary({ timestamp }: { timestamp?: string }) {
	const time = timestamp ? formatBoundaryTime(timestamp) : '';

	return (
		<BoundaryLine>
			<BoundaryChip>
				<RefreshCw className="w-3.5 h-3.5 text-[var(--color-claude)]" />
				<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-claude)] opacity-80">
					Context reset
				</span>
				<BoundaryTime time={time} />
			</BoundaryChip>
		</BoundaryLine>
	);
}

/**
 * Summarizer Boundary — Memory Agent marker.
 */
export function SummarizerBoundary({ timestamp }: { timestamp?: string }) {
	const time = timestamp ? formatBoundaryTime(timestamp) : '';

	return (
		<BoundaryLine>
			<BoundaryChip>
				<Brain className="w-3.5 h-3.5 text-[var(--color-claude)]" />
				<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-claude)] opacity-80">
					Memory Agent
				</span>
				<BoundaryTime time={time} />
			</BoundaryChip>
		</BoundaryLine>
	);
}

/**
 * Session Boundary dispatcher — routes to the right boundary component
 * based on boundary_type from event metadata.
 */
export function SessionBoundary({ boundaryType, mode, timestamp }: {
	boundaryType?: string;
	mode?: string;
	timestamp?: string;
}) {
	if (boundaryType === 'session_start') return <SessionStartBoundary timestamp={timestamp} />;
	if (boundaryType === 'mode_transition') return <ModeTransitionBoundary mode={mode} timestamp={timestamp} />;
	if (boundaryType === 'summarizer') return <SummarizerBoundary timestamp={timestamp} />;
	return <ResetBoundary timestamp={timestamp} />;
}

/**
 * Conversation Ended — final bar when a conversation closes.
 */
export function ConversationEnded({ timestamp }: { timestamp?: string }) {
	const time = timestamp ? formatBoundaryTime(timestamp) : '';

	return (
		<BoundaryLine>
			<BoundaryChip>
				<Check className="w-3.5 h-3.5 text-[var(--color-claude)]" />
				<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-claude)] opacity-80">
					Session complete
				</span>
				<BoundaryTime time={time} />
			</BoundaryChip>
		</BoundaryLine>
	);
}
