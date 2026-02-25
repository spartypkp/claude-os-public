'use client';

/**
 * Chrome DevTools MCP Tool Expanded Views
 *
 * Every Chrome tool gets a custom view — no falling through to DefaultExpanded.
 * Tool names arrive stripped: mcp__chrome-isolated__X -> X
 */

import type { ToolExpandedProps } from '../types';
import { CodeBlock, ErrorBox, KeyValue } from '../shared';

// =============================================================================
// NAVIGATE PAGE
// =============================================================================

function NavigatePageExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const type = input.raw?.type ? String(input.raw.type) : 'url';
	const url = input.raw?.url ? String(input.raw.url) : '';

	return (
		<div className="space-y-1">
			{type !== 'url' && <KeyValue label="Action" value={type} />}
			{url && <KeyValue label="URL" value={url} mono />}
			{Boolean(input.raw?.ignoreCache) && <KeyValue label="Cache" value="ignored" />}
		</div>
	);
}

// =============================================================================
// EVALUATE SCRIPT
// =============================================================================

function EvaluateScriptExpanded({ input, result }: ToolExpandedProps) {
	const fn = input.raw?.function ? String(input.raw.function) : '';
	const returnVal = result?.data !== undefined ? JSON.stringify(result.data, null, 2) : result?.content;

	if (result?.error) return <ErrorBox message={result.error} />;

	return (
		<div className="space-y-2">
			{fn && <CodeBlock code={fn} language="javascript" maxHeight="120px" />}
			{returnVal && (
				<div>
					<span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Return</span>
					<CodeBlock code={returnVal} maxHeight="80px" />
				</div>
			)}
		</div>
	);
}

// =============================================================================
// INTERACTION (click, fill, hover, press_key)
// =============================================================================

function InteractionExpanded({ formattedName, input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const uid = input.raw?.uid ? String(input.raw.uid) : '';
	const value = input.raw?.value ? String(input.raw.value) : '';
	const key = input.raw?.key ? String(input.raw.key) : '';

	return (
		<div className="space-y-1">
			{uid && <KeyValue label="Element" value={uid} mono />}
			{value && <KeyValue label="Value" value={value} />}
			{key && <KeyValue label="Key" value={key} mono />}
			{Boolean(input.raw?.dblClick) && <KeyValue label="Double click" value="yes" />}
			{formattedName === 'fill_form' && Array.isArray(input.raw?.elements) && (
				<div className="mt-1">
					<span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Fields</span>
					<div className="mt-0.5 space-y-0.5">
						{(input.raw!.elements as Array<{ uid: string; value: string }>).map((el, i) => (
							<div key={i} className="text-[10px] font-mono text-[var(--text-secondary)]">
								<span className="text-[var(--text-muted)]">{el.uid}</span> = {el.value}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// UPLOAD FILE
// =============================================================================

function UploadFileExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const uid = input.raw?.uid ? String(input.raw.uid) : '';
	const filePath = input.raw?.filePath ? String(input.raw.filePath) : '';
	const fileName = filePath.split('/').pop() || filePath;

	return (
		<div className="space-y-1">
			{uid && <KeyValue label="Element" value={uid} mono />}
			{filePath && <KeyValue label="File" value={fileName} mono />}
		</div>
	);
}

// =============================================================================
// DRAG
// =============================================================================

function DragExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const from = input.raw?.from_uid ? String(input.raw.from_uid) : '';
	const to = input.raw?.to_uid ? String(input.raw.to_uid) : '';

	return (
		<div className="space-y-1">
			{from && <KeyValue label="From" value={from} mono />}
			{to && <KeyValue label="To" value={to} mono />}
		</div>
	);
}

// =============================================================================
// SCREENSHOT
// =============================================================================

function ScreenshotExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const filePath = input.raw?.filePath ? String(input.raw.filePath) : '';
	const uid = input.raw?.uid ? String(input.raw.uid) : '';
	const fullPage = Boolean(input.raw?.fullPage);
	const format = input.raw?.format ? String(input.raw.format) : '';

	return (
		<div className="space-y-1">
			{uid && <KeyValue label="Element" value={uid} mono />}
			{fullPage && <KeyValue label="Full page" value="yes" />}
			{format && format !== 'png' && <KeyValue label="Format" value={format} />}
			{filePath && <KeyValue label="Saved to" value={filePath.split('/').pop() || filePath} mono />}
			{!filePath && result?.success && (
				<span className="text-[10px] text-[var(--text-muted)]">Image attached to response</span>
			)}
		</div>
	);
}

// =============================================================================
// SNAPSHOT (a11y tree)
// =============================================================================

function SnapshotExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const verbose = Boolean(input.raw?.verbose);
	const filePath = input.raw?.filePath ? String(input.raw.filePath) : '';

	// Show a preview of the snapshot content if available
	const content = result?.content || '';
	const hasContent = content && content.length > 5;

	return (
		<div className="space-y-1.5">
			{verbose && <KeyValue label="Verbose" value="yes" />}
			{filePath && <KeyValue label="Saved to" value={filePath.split('/').pop() || filePath} mono />}
			{hasContent && <CodeBlock code={content} maxHeight="120px" />}
		</div>
	);
}

// =============================================================================
// NEW PAGE / SELECT PAGE / CLOSE PAGE / LIST PAGES
// =============================================================================

function NewPageExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const url = input.raw?.url ? String(input.raw.url) : '';
	const background = Boolean(input.raw?.background);

	return (
		<div className="space-y-1">
			{url && <KeyValue label="URL" value={url} mono />}
			{background && <KeyValue label="Background" value="yes" />}
		</div>
	);
}

function PageIdExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const id = input.raw?.pageId;

	return id !== undefined ? (
		<div><KeyValue label="Tab" value={String(id)} /></div>
	) : null;
}

function ListPagesExpanded({ result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;

	// Try to parse the result as a tab list
	let tabs: Array<{ id?: number; url?: string; title?: string }> = [];
	if (result?.data && Array.isArray(result.data)) {
		tabs = result.data;
	}

	if (tabs.length === 0) return null;

	return (
		<div className="space-y-0.5">
			{tabs.map((tab, i) => {
				const host = tab.url ? (() => { try { return new URL(tab.url).host; } catch { return tab.url; } })() : '';
				return (
					<div key={i} className="text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
						<span className="text-[var(--text-muted)] w-3 text-right">{tab.id ?? i}</span>
						<span className="truncate">{tab.title || host || 'untitled'}</span>
					</div>
				);
			})}
		</div>
	);
}

// =============================================================================
// RESIZE PAGE
// =============================================================================

function ResizePageExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const w = input.raw?.width;
	const h = input.raw?.height;

	return w && h ? (
		<div><KeyValue label="Size" value={`${w} × ${h}`} /></div>
	) : null;
}

// =============================================================================
// PERFORMANCE
// =============================================================================

function PerformanceExpanded({ formattedName, input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const filePath = input.raw?.filePath ? String(input.raw.filePath) : '';
	const reload = input.raw?.reload;
	const autoStop = input.raw?.autoStop;
	const insightName = input.raw?.insightName ? String(input.raw.insightName) : '';

	return (
		<div className="space-y-1">
			{formattedName === 'performance_start_trace' && (
				<>
					{reload !== undefined && <KeyValue label="Reload" value={reload ? 'yes' : 'no'} />}
					{autoStop !== undefined && <KeyValue label="Auto-stop" value={autoStop ? 'yes' : 'no'} />}
				</>
			)}
			{filePath && <KeyValue label="Trace file" value={filePath.split('/').pop() || filePath} mono />}
			{insightName && <KeyValue label="Insight" value={insightName} />}
		</div>
	);
}

// =============================================================================
// EMULATE
// =============================================================================

function EmulateExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const viewport = input.raw?.viewport as { width?: number; height?: number } | null;
	const colorScheme = input.raw?.colorScheme ? String(input.raw.colorScheme) : '';
	const network = input.raw?.networkConditions ? String(input.raw.networkConditions) : '';
	const userAgent = input.raw?.userAgent;

	return (
		<div className="space-y-1">
			{colorScheme && <KeyValue label="Color scheme" value={colorScheme} />}
			{viewport && <KeyValue label="Viewport" value={`${viewport.width} × ${viewport.height}`} />}
			{network && <KeyValue label="Network" value={network} />}
			{userAgent !== undefined && <KeyValue label="User agent" value={userAgent ? String(userAgent) : '(cleared)'} />}
		</div>
	);
}

// =============================================================================
// HANDLE DIALOG
// =============================================================================

function HandleDialogExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const action = input.raw?.action ? String(input.raw.action) : '';
	const promptText = input.raw?.promptText ? String(input.raw.promptText) : '';

	return (
		<div className="space-y-1">
			{action && <KeyValue label="Action" value={action} />}
			{promptText && <KeyValue label="Prompt text" value={promptText} />}
		</div>
	);
}

// =============================================================================
// WAIT FOR
// =============================================================================

function WaitForExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const text = input.raw?.text ? String(input.raw.text) : '';
	const timeout = input.raw?.timeout ? Number(input.raw.timeout) : 0;

	return (
		<div className="space-y-1">
			{text && <KeyValue label="Text" value={text} />}
			{timeout > 0 && <KeyValue label="Timeout" value={`${timeout}ms`} />}
		</div>
	);
}

// =============================================================================
// NETWORK / CONSOLE LIST
// =============================================================================

function NetworkListExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const types = input.raw?.resourceTypes;

	// Try to parse result as request list
	let requests: Array<{ reqid?: number; url?: string; method?: string; status?: number }> = [];
	if (result?.data && Array.isArray(result.data)) {
		requests = result.data;
	}

	return (
		<div className="space-y-1.5">
			{Array.isArray(types) && types.length > 0 && (
				<KeyValue label="Filter" value={(types as string[]).join(', ')} />
			)}
			{requests.length > 0 && (
				<div className="space-y-0.5">
					{requests.map((req, i) => {
						const host = req.url ? (() => { try { return new URL(req.url).pathname; } catch { return req.url; } })() : '';
						return (
							<div key={i} className="text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
								{req.method && <span className="text-[var(--text-muted)] w-8">{req.method}</span>}
								{req.status && (
									<span className={req.status >= 400 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}>
										{req.status}
									</span>
								)}
								<span className="truncate">{host}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function ConsoleListExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const types = input.raw?.types;

	let messages: Array<{ msgid?: number; type?: string; text?: string }> = [];
	if (result?.data && Array.isArray(result.data)) {
		messages = result.data;
	}

	const typeColor = (type?: string) => {
		if (type === 'error') return 'text-[var(--color-error)]';
		if (type === 'warn') return 'text-[var(--color-warning)]';
		return 'text-[var(--text-muted)]';
	};

	return (
		<div className="space-y-1.5">
			{Array.isArray(types) && types.length > 0 && (
				<KeyValue label="Filter" value={(types as string[]).join(', ')} />
			)}
			{messages.length > 0 && (
				<div className="space-y-0.5">
					{messages.map((msg, i) => (
						<div key={i} className="text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
							{msg.type && <span className={`${typeColor(msg.type)} w-8`}>{msg.type}</span>}
							<span className="truncate">{msg.text}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function NetworkRequestExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const id = input.raw?.reqid;
	return id !== undefined ? (
		<div><KeyValue label="Request" value={`#${id}`} /></div>
	) : null;
}

function ConsoleMessageExpanded({ input, result }: ToolExpandedProps) {
	if (result?.error) return <ErrorBox message={result.error} />;
	const id = input.raw?.msgid;
	return id !== undefined ? (
		<div><KeyValue label="Message" value={`#${id}`} /></div>
	) : null;
}

// =============================================================================
// EXPORT MAP — every Chrome tool gets a view
// =============================================================================

export const chromeExpandedViews: Record<string, React.ComponentType<ToolExpandedProps>> = {
	// Navigation
	navigate_page: NavigatePageExpanded,
	new_page: NewPageExpanded,
	select_page: PageIdExpanded,
	list_pages: ListPagesExpanded,
	close_page: PageIdExpanded,
	resize_page: ResizePageExpanded,

	// Interaction
	click: InteractionExpanded,
	fill: InteractionExpanded,
	fill_form: InteractionExpanded,
	hover: InteractionExpanded,
	press_key: InteractionExpanded,
	upload_file: UploadFileExpanded,
	drag: DragExpanded,

	// Inspection
	take_screenshot: ScreenshotExpanded,
	take_snapshot: SnapshotExpanded,
	evaluate_script: EvaluateScriptExpanded,

	// Network & Console
	list_network_requests: NetworkListExpanded,
	get_network_request: NetworkRequestExpanded,
	list_console_messages: ConsoleListExpanded,
	get_console_message: ConsoleMessageExpanded,

	// Performance
	performance_start_trace: PerformanceExpanded,
	performance_stop_trace: PerformanceExpanded,
	performance_analyze_insight: PerformanceExpanded,

	// Emulation & Dialog
	emulate: EmulateExpanded,
	handle_dialog: HandleDialogExpanded,
	wait_for: WaitForExpanded,
};
