'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, BookOpen, Code2, Download, FileText, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface JupyterViewerProps {
	filePath: string;
}

interface NotebookCell {
	cell_type: 'code' | 'markdown' | 'raw';
	source: string[];
	execution_count?: number | null;
	outputs?: CellOutput[];
}

interface CellOutput {
	output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
	text?: string[];
	data?: Record<string, string[]>;
	ename?: string;
	evalue?: string;
	traceback?: string[];
}

interface Notebook {
	cells: NotebookCell[];
	metadata?: {
		kernelspec?: { display_name?: string; language?: string };
		language_info?: { name?: string };
	};
}

function joinSource(source: string | string[]): string {
	return Array.isArray(source) ? source.join('') : source;
}

/**
 * Jupyter Notebook Viewer - renders .ipynb files.
 * Parses the JSON structure and displays markdown/code cells with outputs.
 */
export function JupyterViewer({ filePath }: JupyterViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [notebook, setNotebook] = useState<Notebook | null>(null);

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const downloadUrl = `${API_BASE}/api/finder/raw/${encodeURIComponent(apiPath)}`;

	const loadFile = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch file: ${response.statusText}`);
			}

			const json = await response.json();
			setNotebook(json);
		} catch (err) {
			console.error('Failed to load notebook:', err);
			setError(err instanceof Error ? err.message : 'Failed to load notebook');
		} finally {
			setLoading(false);
		}
	}, [downloadUrl]);

	useEffect(() => {
		loadFile();
	}, [loadFile]);

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = downloadUrl;
		link.download = fileName;
		link.click();
	}, [downloadUrl, fileName]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: 'var(--surface-raised)' }}>
				<Loader2 className="w-8 h-8 animate-spin" style={{ color: '#f97316' }} />
				<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading notebook...</p>
			</div>
		);
	}

	if (error || !notebook) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: 'var(--surface-sunken)' }}>
				<div className="flex flex-col items-center gap-3 max-w-md text-center">
					<AlertCircle className="w-10 h-10 text-red-400" />
					<p className="text-sm text-red-400">{error || 'Failed to parse notebook'}</p>
					<p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
						Try opening this notebook in JupyterLab or VS Code.
					</p>
					<button
						onClick={handleDownload}
						className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors mt-4"
						style={{ background: '#f97316', color: 'white' }}
					>
						<Download className="w-4 h-4" />
						Download Notebook
					</button>
				</div>
			</div>
		);
	}

	const language = notebook.metadata?.language_info?.name ||
		notebook.metadata?.kernelspec?.language ||
		'python';
	const kernelName = notebook.metadata?.kernelspec?.display_name || language;
	const codeCount = notebook.cells.filter(c => c.cell_type === 'code').length;
	const markdownCount = notebook.cells.filter(c => c.cell_type === 'markdown').length;

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-sunken)' }}>
			{/* Toolbar */}
			<div
				className="flex items-center justify-between px-3 py-1.5 shrink-0"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
				<div className="flex items-center gap-2">
					<BookOpen className="w-4 h-4" style={{ color: '#f97316' }} />
					<span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
						Jupyter Notebook
					</span>
					<span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
						{kernelName}
					</span>
					<span className="text-xs" style={{ color: 'var(--text-muted)' }}>
						{codeCount} code, {markdownCount} markdown cells
					</span>
				</div>

				<div className="flex items-center gap-2">
					<button
						onClick={handleDownload}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-accent)]"
						title="Download"
						style={{ color: 'var(--text-tertiary)' }}
					>
						<Download className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Notebook content */}
			<div className="flex-1 overflow-auto p-4">
				<div className="max-w-4xl mx-auto space-y-4">
					{notebook.cells.map((cell, idx) => (
						<CellRenderer key={idx} cell={cell} index={idx} language={language} />
					))}
				</div>
			</div>

			{/* Footer */}
			<div
				className="px-3 py-1 text-[10px] text-center shrink-0"
				style={{
					background: 'var(--surface-base)',
					borderTop: '1px solid var(--border-subtle)',
					color: 'var(--text-muted)',
				}}
			>
				{fileName} · {notebook.cells.length} cells
			</div>
		</div>
	);
}

interface CellRendererProps {
	cell: NotebookCell;
	index: number;
	language: string;
}

function CellRenderer({ cell, index, language }: CellRendererProps) {
	const source = joinSource(cell.source);

	if (cell.cell_type === 'markdown') {
		return (
			<div
				className="rounded-lg overflow-hidden"
				style={{ background: 'var(--surface-raised)' }}
			>
				<div
					className="px-3 py-1 flex items-center gap-2 text-xs"
					style={{
						background: 'var(--surface-base)',
						borderBottom: '1px solid var(--border-subtle)',
						color: 'var(--text-muted)'
					}}
				>
					<FileText className="w-3 h-3" />
					Markdown
				</div>
				<div
					className="p-4 prose prose-sm max-w-none dark:prose-invert"
					style={{ color: 'var(--text-primary)' }}
				>
					{/* Simple markdown rendering - headers, bold, italic, code */}
					<MarkdownRenderer content={source} />
				</div>
			</div>
		);
	}

	if (cell.cell_type === 'code') {
		return (
			<div
				className="rounded-lg overflow-hidden"
				style={{
					background: 'var(--surface-raised)',
					border: '1px solid var(--border-subtle)'
				}}
			>
				{/* Cell header */}
				<div
					className="px-3 py-1 flex items-center gap-2 text-xs"
					style={{
						background: 'var(--surface-base)',
						borderBottom: '1px solid var(--border-subtle)',
					}}
				>
					<Code2 className="w-3 h-3" style={{ color: '#3b82f6' }} />
					<span style={{ color: 'var(--text-muted)' }}>
						In [{cell.execution_count ?? ' '}]
					</span>
				</div>

				{/* Code */}
				<pre
					className="p-3 overflow-x-auto text-sm font-mono"
					style={{
						background: 'var(--surface-sunken)',
						color: 'var(--text-primary)',
						margin: 0
					}}
				>
					<code>{source}</code>
				</pre>

				{/* Outputs */}
				{cell.outputs && cell.outputs.length > 0 && (
					<div style={{ borderTop: '1px solid var(--border-subtle)' }}>
						<div
							className="px-3 py-1 flex items-center gap-2 text-xs"
							style={{
								background: 'var(--surface-base)',
								borderBottom: '1px solid var(--border-subtle)',
							}}
						>
							<Play className="w-3 h-3" style={{ color: '#22c55e' }} />
							<span style={{ color: 'var(--text-muted)' }}>
								Out [{cell.execution_count ?? ' '}]
							</span>
						</div>
						<div className="p-3 text-sm" style={{ background: 'var(--surface-raised)' }}>
							{cell.outputs.map((output, oidx) => (
								<OutputRenderer key={oidx} output={output} />
							))}
						</div>
					</div>
				)}
			</div>
		);
	}

	// Raw cell
	return (
		<div
			className="rounded-lg overflow-hidden"
			style={{ background: 'var(--surface-raised)' }}
		>
			<div
				className="px-3 py-1 flex items-center gap-2 text-xs"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
					color: 'var(--text-muted)'
				}}
			>
				Raw
			</div>
			<pre
				className="p-3 overflow-x-auto text-sm font-mono"
				style={{ color: 'var(--text-secondary)', margin: 0 }}
			>
				{source}
			</pre>
		</div>
	);
}

function OutputRenderer({ output }: { output: CellOutput }) {
	if (output.output_type === 'stream' && output.text) {
		return (
			<pre className="font-mono text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
				{joinSource(output.text)}
			</pre>
		);
	}

	if (output.output_type === 'error') {
		return (
			<pre className="font-mono text-xs text-red-400 whitespace-pre-wrap">
				{output.ename}: {output.evalue}
				{output.traceback && '\n' + output.traceback.join('\n')}
			</pre>
		);
	}

	if ((output.output_type === 'execute_result' || output.output_type === 'display_data') && output.data) {
		// Check for image data
		if (output.data['image/png']) {
			const imgData = joinSource(output.data['image/png']);
			return (
				<img
					src={`data:image/png;base64,${imgData}`}
					alt="Output"
					className="max-w-full rounded"
				/>
			);
		}
		if (output.data['image/jpeg']) {
			const imgData = joinSource(output.data['image/jpeg']);
			return (
				<img
					src={`data:image/jpeg;base64,${imgData}`}
					alt="Output"
					className="max-w-full rounded"
				/>
			);
		}
		// HTML output
		if (output.data['text/html']) {
			return (
				<div
					className="overflow-x-auto"
					dangerouslySetInnerHTML={{ __html: joinSource(output.data['text/html']) }}
				/>
			);
		}
		// Plain text fallback
		if (output.data['text/plain']) {
			return (
				<pre className="font-mono text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
					{joinSource(output.data['text/plain'])}
				</pre>
			);
		}
	}

	return null;
}

function MarkdownRenderer({ content }: { content: string }) {
	// Simple markdown parsing for display
	const lines = content.split('\n');
	const elements: React.ReactNode[] = [];
	let inCodeBlock = false;
	let codeContent: string[] = [];
	let codeLanguage = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Code blocks
		if (line.startsWith('```')) {
			if (inCodeBlock) {
				elements.push(
					<pre
						key={i}
						className="p-3 rounded text-sm font-mono overflow-x-auto my-2"
						style={{ background: 'var(--surface-sunken)' }}
					>
						<code>{codeContent.join('\n')}</code>
					</pre>
				);
				codeContent = [];
				inCodeBlock = false;
			} else {
				inCodeBlock = true;
				codeLanguage = line.slice(3).trim();
			}
			continue;
		}

		if (inCodeBlock) {
			codeContent.push(line);
			continue;
		}

		// Headers
		if (line.startsWith('# ')) {
			elements.push(<h1 key={i} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>);
			continue;
		}
		if (line.startsWith('## ')) {
			elements.push(<h2 key={i} className="text-xl font-bold mt-3 mb-2">{line.slice(3)}</h2>);
			continue;
		}
		if (line.startsWith('### ')) {
			elements.push(<h3 key={i} className="text-lg font-bold mt-2 mb-1">{line.slice(4)}</h3>);
			continue;
		}

		// Empty lines
		if (!line.trim()) {
			elements.push(<br key={i} />);
			continue;
		}

		// Lists
		if (line.match(/^[\-\*]\s/)) {
			elements.push(
				<div key={i} className="flex gap-2 ml-4">
					<span>•</span>
					<span>{formatInline(line.slice(2))}</span>
				</div>
			);
			continue;
		}

		// Numbered lists
		if (line.match(/^\d+\.\s/)) {
			const match = line.match(/^(\d+)\.\s(.*)$/);
			if (match) {
				elements.push(
					<div key={i} className="flex gap-2 ml-4">
						<span>{match[1]}.</span>
						<span>{formatInline(match[2])}</span>
					</div>
				);
			}
			continue;
		}

		// Regular paragraph
		elements.push(<p key={i} className="my-1">{formatInline(line)}</p>);
	}

	return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
	// Very basic inline formatting: **bold**, *italic*, `code`, [link](url)
	const parts: React.ReactNode[] = [];
	let remaining = text;
	let keyIdx = 0;

	while (remaining) {
		// Bold
		const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
		if (boldMatch && boldMatch.index === 0) {
			parts.push(<strong key={keyIdx++}>{boldMatch[1]}</strong>);
			remaining = remaining.slice(boldMatch[0].length);
			continue;
		}

		// Italic
		const italicMatch = remaining.match(/\*(.+?)\*/);
		if (italicMatch && italicMatch.index === 0) {
			parts.push(<em key={keyIdx++}>{italicMatch[1]}</em>);
			remaining = remaining.slice(italicMatch[0].length);
			continue;
		}

		// Code
		const codeMatch = remaining.match(/`(.+?)`/);
		if (codeMatch && codeMatch.index === 0) {
			parts.push(
				<code
					key={keyIdx++}
					className="px-1 py-0.5 rounded text-sm font-mono"
					style={{ background: 'var(--surface-sunken)' }}
				>
					{codeMatch[1]}
				</code>
			);
			remaining = remaining.slice(codeMatch[0].length);
			continue;
		}

		// Link
		const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);
		if (linkMatch && linkMatch.index === 0) {
			parts.push(
				<a
					key={keyIdx++}
					href={linkMatch[2]}
					target="_blank"
					rel="noopener noreferrer"
					className="text-blue-500 hover:underline"
				>
					{linkMatch[1]}
				</a>
			);
			remaining = remaining.slice(linkMatch[0].length);
			continue;
		}

		// Find next special character
		const nextSpecial = remaining.search(/[\*`\[]/);
		if (nextSpecial === -1) {
			parts.push(remaining);
			break;
		} else if (nextSpecial === 0) {
			// Not matched above, just add the character
			parts.push(remaining[0]);
			remaining = remaining.slice(1);
		} else {
			parts.push(remaining.slice(0, nextSpecial));
			remaining = remaining.slice(nextSpecial);
		}
	}

	return <>{parts}</>;
}

export default JupyterViewer;
