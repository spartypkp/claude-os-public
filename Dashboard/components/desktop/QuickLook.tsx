'use client';

import { API_BASE, fetchFileContent, finderInfo, FinderItem } from '@/lib/api';
import { useWindowStore } from '@/store/windowStore';
import { Folder, Image, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getDocumentType, getFileIconSpec, getLanguage } from './editors';

/**
 * macOS-style Quick Look preview modal.
 * Activated by pressing Space on a selected icon.
 * Supports: Markdown, Code, Images, Plain Text
 * Uses CSS custom properties for theming (see globals.css).
 */
export function QuickLook() {
	const { quickLookPath, closeQuickLook } = useWindowStore();
	const [loading, setLoading] = useState(false);
	const [content, setContent] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [itemInfo, setItemInfo] = useState<FinderItem | null>(null);
	const [isTooLarge, setIsTooLarge] = useState(false);

	const MAX_QUICKLOOK_BYTES = 200 * 1024;

	const formatBytes = (bytes: number | null | undefined) => {
		if (!bytes) return 'Unknown size';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const formatJson = (raw: string): { formatted: string; error?: string } => {
		try {
			const parsed = JSON.parse(raw);
			return { formatted: JSON.stringify(parsed, null, 2) };
		} catch (err) {
			return { formatted: raw, error: err instanceof Error ? err.message : 'Invalid JSON' };
		}
	};

	const parseDelimited = (raw: string, delimiter: ',' | '\t'): string[][] => {
		const rows: string[][] = [];
		let row: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < raw.length; i += 1) {
			const char = raw[i];
			const next = raw[i + 1];

			if (char === '"') {
				if (inQuotes && next === '"') {
					current += '"';
					i += 1;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (!inQuotes && (char === '\n' || char === '\r')) {
				if (char === '\r' && next === '\n') {
					i += 1;
				}
				row.push(current);
				rows.push(row);
				row = [];
				current = '';
				continue;
			}

			if (!inQuotes && char === delimiter) {
				row.push(current);
				current = '';
				continue;
			}

			current += char;
		}

		row.push(current);
		rows.push(row);
		return rows;
	};

	// Load file content when path changes
	useEffect(() => {
		if (!quickLookPath) {
			setContent('');
			setError(null);
			setItemInfo(null);
			setIsTooLarge(false);
			return;
		}

		const load = async () => {
			setLoading(true);
			setError(null);
			setIsTooLarge(false);
			try {
				const info = await finderInfo(quickLookPath);
				setItemInfo(info);

				const isFolder = info.type !== 'file';
				const docType = getDocumentType(quickLookPath);

				if (isFolder || docType === 'image' || docType === 'pdf') {
					setContent('');
					return;
				}

				if (info.size && info.size > MAX_QUICKLOOK_BYTES) {
					setIsTooLarge(true);
					setContent('');
					return;
				}

				const data = await fetchFileContent(quickLookPath);
				setContent(data.content);
			} catch (err) {
				try {
					const data = await fetchFileContent(quickLookPath);
					setItemInfo(null);
					setContent(data.content);
				} catch (fallbackErr) {
					setError(`Failed to load: ${fallbackErr}`);
				}
			} finally {
				setLoading(false);
			}
		};

		load();
	}, [quickLookPath]);

	// Don't render if no file selected
	if (!quickLookPath) {
		return null;
	}

	// Get filename and type info
	const filename = quickLookPath.split('/').pop() || quickLookPath;
	const docType = getDocumentType(quickLookPath);
	const language = getLanguage(quickLookPath);
	const isFolder = itemInfo ? itemInfo.type !== 'file' : !quickLookPath.includes('.') || quickLookPath.endsWith('/');

	// Strip YAML frontmatter for markdown display
	const stripFrontmatter = (text: string): string => {
		const match = text.match(/^---\n[\s\S]*?\n---\n/);
		return match ? text.slice(match[0].length) : text;
	};

	// Get icon for file type
	const getIcon = () => {
		if (isFolder) return <Folder className="w-5 h-5" style={{ color: '#DA7756' }} />;
		switch (docType) {
			case 'image':
				return <Image className="w-5 h-5" style={{ color: 'var(--color-info)' }} />;
			default:
				const { icon: Icon, colorClass } = getFileIconSpec(filename);
				return <Icon className={`w-5 h-5 ${colorClass}`} />;
		}
	};

	// Render content based on type
	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex items-center justify-center h-full">
					<Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
				</div>
			);
		}

		if (isTooLarge) {
			return (
				<div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
					<div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
						File too large for QuickLook
					</div>
					<div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
						{formatBytes(itemInfo?.size)}
					</div>
					<div className="text-xs" style={{ color: 'var(--text-muted)' }}>
						Open the file to view full contents.
					</div>
				</div>
			);
		}

		if (error) {
			return (
				<div className="flex items-center justify-center h-full text-red-400 text-sm">
					{error}
				</div>
			);
		}

		if (isFolder) {
			return (
				<div className="flex items-center justify-center h-full">
					<Folder className="w-24 h-24" style={{ color: 'rgba(218, 119, 86, 0.5)' }} />
				</div>
			);
		}

		switch (docType) {
			case 'markdown':
				return (
					<div 
						className="p-6 prose prose-sm max-w-none"
						style={{ background: 'var(--surface-raised)' }}
					>
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{stripFrontmatter(content)}
						</ReactMarkdown>
					</div>
				);

			case 'image':
				return (
					<div 
						className="flex items-center justify-center h-full p-4"
						style={{ background: 'var(--surface-sunken)' }}
					>
						<img
							src={`${API_BASE}/api/files/raw/${encodeURIComponent(quickLookPath)}`}
							alt={filename}
							className="max-w-full max-h-full object-contain rounded shadow-lg"
						/>
					</div>
				);

			case 'code':
				return (
					<div className="h-full" style={{ background: 'var(--surface-raised)' }}>
						<div 
							className="px-3 py-1.5"
							style={{ 
								background: 'var(--surface-base)', 
								borderBottom: '1px solid var(--border-subtle)' 
							}}
						>
							<span 
								className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded"
								style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
							>
								{language}
							</span>
						</div>
						<pre 
							className="p-4 font-mono text-xs overflow-auto h-[calc(100%-36px)] leading-5"
							style={{ color: 'var(--text-primary)' }}
						>
							{content}
						</pre>
					</div>
				);

			case 'json': {
				const formatted = formatJson(content);
				return (
					<div className="h-full flex flex-col" style={{ background: 'var(--surface-raised)' }}>
						<div
							className="px-3 py-1.5"
							style={{
								background: 'var(--surface-base)',
								borderBottom: '1px solid var(--border-subtle)',
							}}
						>
							<span
								className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded"
								style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
							>
								json
							</span>
						</div>
						{formatted.error && (
							<div
								className="px-3 py-2 text-xs"
								style={{ color: 'var(--color-warning)', borderBottom: '1px solid var(--border-subtle)' }}
							>
								Invalid JSON: {formatted.error}
							</div>
						)}
						<pre
							className="flex-1 p-4 font-mono text-xs overflow-auto leading-5"
							style={{ color: 'var(--text-primary)' }}
						>
							{formatted.formatted}
						</pre>
					</div>
				);
			}

			case 'csv': {
				const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';
				const rows = parseDelimited(content, delimiter).slice(0, 6);
				const header = rows[0] || [];
				const dataRows = rows.slice(1);
				return (
					<div className="h-full flex flex-col" style={{ background: 'var(--surface-raised)' }}>
						<div
							className="px-3 py-1.5"
							style={{
								background: 'var(--surface-base)',
								borderBottom: '1px solid var(--border-subtle)',
							}}
						>
							<span
								className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded"
								style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
							>
								{delimiter === '\t' ? 'tsv' : 'csv'}
							</span>
						</div>
						<div className="flex-1 overflow-auto">
							<table className="min-w-full text-xs">
								<thead>
									<tr style={{ background: 'var(--surface-base)' }}>
										{header.map((cell, idx) => (
											<th
												key={`ql-header-${idx}`}
												className="px-3 py-2 text-left font-semibold border-b"
												style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
											>
												{cell || `Column ${idx + 1}`}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{dataRows.map((row, rowIdx) => (
										<tr key={`ql-row-${rowIdx}`} className="odd:bg-[var(--surface-sunken)]">
											{row.map((cell, cellIdx) => (
												<td
													key={`ql-cell-${rowIdx}-${cellIdx}`}
													className="px-3 py-2 border-b"
													style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
												>
													{cell}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				);
			}

			case 'pdf':
				return (
					<div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
						<div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
							PDF preview is available in the file window
						</div>
						<div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
							Open the file to view.
						</div>
					</div>
				);

			case 'text':
			default:
				return (
					<pre 
						className="p-6 font-mono text-sm whitespace-pre-wrap overflow-auto h-full"
						style={{ color: 'var(--text-primary)' }}
					>
						{content}
					</pre>
				);
		}
	};

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[900]"
				onClick={closeQuickLook}
			/>

			{/* Modal */}
			<div
				className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] max-w-[90vw] h-[500px] max-h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden z-[901]"
				style={{ 
					background: 'var(--surface-raised)', 
					border: '1px solid var(--border-default)' 
				}}
			>
				{/* Header */}
				<div 
					className="flex items-center justify-between px-4 py-3"
					style={{ 
						background: 'var(--surface-base)', 
						borderBottom: '1px solid var(--border-subtle)' 
					}}
				>
					<div className="flex items-center gap-3">
						{getIcon()}
						<span 
							className="text-sm font-medium truncate"
							style={{ color: 'var(--text-primary)' }}
						>
							{filename}
						</span>
					</div>
					<button
						onClick={closeQuickLook}
						className="p-1 rounded transition-colors hover:bg-[var(--surface-muted)]"
					>
						<X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto">
					{renderContent()}
				</div>

				{/* Footer hint */}
				<div 
					className="px-4 py-2 text-center"
					style={{ 
						background: 'var(--surface-base)', 
						borderTop: '1px solid var(--border-subtle)' 
					}}
				>
					<span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
						Press{' '}
						<kbd 
							className="px-1 py-0.5 rounded"
							style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
						>
							Space
						</kbd>{' '}
						or{' '}
						<kbd 
							className="px-1 py-0.5 rounded"
							style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
						>
							Esc
						</kbd>{' '}
						to close · Press{' '}
						<kbd 
							className="px-1 py-0.5 rounded"
							style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
						>
							Enter
						</kbd>{' '}
						to open
					</span>
				</div>
			</div>
		</>
	);
}

export default QuickLook;
