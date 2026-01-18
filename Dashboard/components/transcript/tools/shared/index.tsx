'use client';

/**
 * Shared UI components for tool expanded views
 * 
 * These components provide consistent styling for displaying tool input/output
 * across all tool types. Use these to build new tool expanded views.
 */

import { AlertCircle, Check, Copy, ExternalLink, FileText, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { isViewableFile, useOpenInDesktop } from '../ClickableRef';

// =============================================================================
// COPY BUTTON
// =============================================================================

export function CopyButton({ text, className = '' }: { text: string; className?: string; }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			onClick={handleCopy}
			className={`p-1 rounded hover:bg-[var(--surface-accent)] transition-colors ${className}`}
			title="Copy"
		>
			{copied ? (
				<Check className="w-3 h-3 text-[var(--color-success)]" />
			) : (
				<Copy className="w-3 h-3 text-[var(--text-muted)]" />
			)}
		</button>
	);
}

// =============================================================================
// CODE BLOCK
// =============================================================================

interface CodeBlockProps {
	code: string;
	language?: string;
	maxHeight?: string;
	showLineNumbers?: boolean;
}

export function CodeBlock({
	code,
	language,
	maxHeight = '200px',
	showLineNumbers = false,
}: CodeBlockProps) {
	const lines = code.split('\n');

	return (
		<div className="relative group">
			<CopyButton text={code} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 z-10" />
			<pre
				className="font-mono text-[11px] text-[var(--text-secondary)] bg-[var(--surface-base)] p-2 rounded-md border border-[var(--border-subtle)] overflow-auto"
				style={{ maxHeight }}
			>
				{showLineNumbers ? (
					<code className="flex">
						<span className="select-none text-[var(--text-muted)] pr-3 text-right" style={{ minWidth: '2.5em' }}>
							{lines.map((_, i) => <div key={i}>{i + 1}</div>)}
						</span>
						<span className="flex-1">
							{lines.map((line, i) => <div key={i}>{line || ' '}</div>)}
						</span>
					</code>
				) : (
					<code className="whitespace-pre-wrap break-all">{code}</code>
				)}
			</pre>
		</div>
	);
}

// =============================================================================
// SECTION HEADER
// =============================================================================

type SectionVariant = 'default' | 'error' | 'success';

interface SectionHeaderProps {
	children: React.ReactNode;
	variant?: SectionVariant;
}

const VARIANT_COLORS: Record<SectionVariant, string> = {
	default: 'text-[var(--text-muted)]',
	error: 'text-[var(--color-error)]',
	success: 'text-[var(--color-success)]',
};

export function SectionHeader({ children, variant = 'default' }: SectionHeaderProps) {
	return (
		<div className={`text-[9px] font-medium uppercase tracking-wider mb-1 ${VARIANT_COLORS[variant]}`}>
			{children}
		</div>
	);
}

// =============================================================================
// KEY VALUE
// =============================================================================

interface KeyValueProps {
	label: string;
	value: string;
	mono?: boolean;
}

export function KeyValue({ label, value, mono = false }: KeyValueProps) {
	return (
		<div className="flex items-center gap-2 text-[11px]">
			<span className="text-[var(--text-muted)]">{label}:</span>
			<span className={`text-[var(--text-secondary)] ${mono ? 'font-mono' : ''}`}>{value}</span>
		</div>
	);
}

// =============================================================================
// INFO BOX
// =============================================================================

interface InfoBoxProps {
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; }>;
	color: string;
	children: React.ReactNode;
	copyText?: string;
}

export function InfoBox({ icon: Icon, color, children, copyText }: InfoBoxProps) {
	return (
		<div className="flex items-start gap-2 text-[11px] bg-[var(--surface-base)] px-2 py-1.5 rounded-md border border-[var(--border-subtle)]">
			<Icon className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color }} />
			<span className="text-[var(--text-secondary)] flex-1">{children}</span>
			{copyText && <CopyButton text={copyText} className="flex-shrink-0" />}
		</div>
	);
}

// =============================================================================
// FILE PATH HEADER
// =============================================================================

type FilePathVariant = 'default' | 'success' | 'warning';

interface FilePathHeaderProps {
	path: string;
	variant?: FilePathVariant;
}

const FILE_PATH_STYLES: Record<FilePathVariant, string> = {
	default: 'bg-[var(--surface-base)] border-[var(--border-subtle)]',
	success: 'bg-[var(--color-success)]/5 border-[var(--color-success)]/20',
	warning: 'bg-[var(--color-warning)]/5 border-[var(--color-warning)]/20',
};

const FILE_PATH_ICON_COLORS: Record<FilePathVariant, string> = {
	default: 'var(--color-cyan)',
	success: 'var(--color-success)',
	warning: 'var(--color-warning)',
};

export function FilePathHeader({ path, variant = 'default' }: FilePathHeaderProps) {
	const { openFile, openInFinder } = useOpenInDesktop();
	const fileName = path.split('/').pop() || path;
	const parentPath = path.split('/').slice(0, -1).join('/');
	const canView = isViewableFile(path);

	return (
		<div className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${FILE_PATH_STYLES[variant]}`}>
			<FileText className="w-4 h-4 flex-shrink-0" style={{ color: FILE_PATH_ICON_COLORS[variant] }} />
			<div className="flex-1 min-w-0">
				<div className="text-[12px] font-medium text-[var(--text-primary)] truncate">{fileName}</div>
				{parentPath && (
					<div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{parentPath}/</div>
				)}
			</div>
			<div className="flex items-center gap-1 flex-shrink-0">
				<button
					onClick={() => openFile(path, !canView)}
					className="p-1 rounded hover:bg-[var(--surface-accent)] transition-colors"
					title={canView ? 'Open file' : 'Show in Finder'}
				>
					<ExternalLink className="w-3 h-3 text-[var(--text-muted)] hover:text-[#da7756]" />
				</button>
				{canView && (
					<button
						onClick={() => openInFinder(parentPath)}
						className="p-1 rounded hover:bg-[var(--surface-accent)] transition-colors"
						title="Show in Finder"
					>
						<FolderOpen className="w-3 h-3 text-[var(--text-muted)] hover:text-[#da7756]" />
					</button>
				)}
				<CopyButton text={path} />
			</div>
		</div>
	);
}

// =============================================================================
// STATUS BADGE - Reusable colored badge for status/type/level indicators
// =============================================================================

interface StatusBadgeProps {
	/** The text to display */
	label: string;
	/** CSS color value (e.g., 'var(--color-success)', '#22c55e') */
	color: string;
	/** Size variant */
	size?: 'sm' | 'md';
}

/**
 * Colored status badge with automatic background tinting.
 * Use for: operation types, status indicators, priority levels, etc.
 * 
 * @example
 * <StatusBadge label="critical" color="var(--color-error)" />
 * <StatusBadge label="in_progress" color="var(--color-primary)" />
 */
export function StatusBadge({ label, color, size = 'sm' }: StatusBadgeProps) {
	const sizeClasses = size === 'sm'
		? 'text-[9px] px-1.5 py-0.5'
		: 'text-[10px] px-2 py-1';

	return (
		<span
			className={`${sizeClasses} uppercase tracking-wider rounded font-medium`}
			style={{
				backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
				color,
			}}
		>
			{label}
		</span>
	);
}

// =============================================================================
// OPERATION HEADER - Shows operation type + optional ID
// =============================================================================

interface OperationHeaderProps {
	/** Operation name (e.g., 'create', 'list', 'delete') */
	operation: string;
	/** Optional ID to display (will be truncated to 8 chars) */
	id?: string;
	/** Optional icon */
	icon?: React.ComponentType<{ className?: string; }>;
}

/**
 * Header for MCP operation-based tools.
 * Shows the operation name and optional truncated ID.
 * 
 * @example
 * <OperationHeader operation="create" id="abc123def456" icon={Users} />
 */
export function OperationHeader({ operation, id, icon: Icon }: OperationHeaderProps) {
	return (
		<div className="flex items-center gap-2">
			{Icon && <Icon className="w-3 h-3 text-[var(--text-muted)]" />}
			<span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{operation}</span>
			{id && (
				<span className="text-[10px] font-mono bg-[var(--surface-muted)] px-1.5 py-0.5 rounded">
					{id.slice(0, 8)}
				</span>
			)}
		</div>
	);
}

// =============================================================================
// ERROR BOX
// =============================================================================

interface ErrorBoxProps {
	message: string;
}

export function ErrorBox({ message }: ErrorBoxProps) {
	return (
		<div className="bg-[var(--color-error)]/10 rounded-md p-2 border border-[var(--color-error)]/20">
			<code className="text-[11px] text-[var(--color-error)] font-mono">{message}</code>
		</div>
	);
}

// =============================================================================
// RESULT SECTION - Consistent result/error display
// =============================================================================

interface ResultSectionProps {
	/** Raw result string */
	result: string;
	/** Override error detection */
	hasError?: boolean;
	/** Max height for code block */
	maxHeight?: string;
	/** Custom success label */
	successLabel?: string;
}

/**
 * Standardized result section with automatic error detection.
 * Use at the bottom of expanded views to show tool output.
 * 
 * @example
 * {rawResult && <ResultSection result={rawResult} />}
 */
export function ResultSection({
	result,
	hasError,
	maxHeight = '150px',
	successLabel = 'Result',
}: ResultSectionProps) {
	const isError = hasError ?? result.toLowerCase().includes('error');

	return (
		<div>
			<SectionHeader variant={isError ? 'error' : 'default'}>
				{isError ? 'Error' : successLabel}
			</SectionHeader>
			<CodeBlock code={result} maxHeight={maxHeight} />
		</div>
	);
}

// =============================================================================
// RESULT INDICATOR - Inline success/error indicator
// =============================================================================

interface ResultIndicatorProps {
	success: boolean;
	successText?: string;
	errorText?: string;
}

export function ResultIndicator({
	success,
	successText = '✓ Success',
	errorText,
}: ResultIndicatorProps) {
	if (success) {
		return (
			<div className="text-[10px] flex items-center gap-1.5 text-[var(--color-success)]">
				<Check className="w-3 h-3" />
				{successText}
			</div>
		);
	}

	return (
		<div className="text-[10px] flex items-center gap-1.5 text-[var(--color-error)]">
			<AlertCircle className="w-3 h-3" />
			{errorText || 'Error'}
		</div>
	);
}

// =============================================================================
// UTILITY: Check if result indicates error
// =============================================================================

/**
 * Check if a raw result string indicates an error.
 * Use this for consistent error detection across tools.
 */
export function isErrorResult(rawResult?: string): boolean {
	if (!rawResult) return false;
	const lower = rawResult.toLowerCase();
	return lower.includes('error') || lower.includes('failed') || lower.includes('exception');
}
