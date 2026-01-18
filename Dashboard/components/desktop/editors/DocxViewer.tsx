'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

// Dynamically import mammoth to avoid SSR issues
const mammothModule = () => import('mammoth');

interface DocxViewerProps {
	filePath: string;
}

/**
 * DOCX Viewer - converts Word documents to HTML for display.
 * Uses mammoth.js to parse .docx files client-side.
 */
export function DocxViewer({ filePath }: DocxViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [htmlContent, setHtmlContent] = useState<string>('');
	const [warnings, setWarnings] = useState<string[]>([]);

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const downloadUrl = `${API_BASE}/api/finder/raw/${encodeURIComponent(apiPath)}`;

	const loadFile = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			// Fetch file as binary
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch file: ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();

			// Load mammoth dynamically
			const mammoth = await mammothModule();

			// Convert DOCX to HTML
			const result = await mammoth.convertToHtml({ arrayBuffer });

			setHtmlContent(result.value);
			setWarnings(result.messages.map(m => m.message));
		} catch (err) {
			console.error('Failed to load docx:', err);
			setError(err instanceof Error ? err.message : 'Failed to load file');
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

	const handleOpenInApp = useCallback(() => {
		window.open(downloadUrl, '_blank');
	}, [downloadUrl]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: 'var(--surface-raised)' }}>
				<Loader2 className="w-8 h-8 animate-spin" style={{ color: '#2B579A' }} />
				<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading document...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: 'var(--surface-sunken)' }}>
				<div className="flex flex-col items-center gap-3 max-w-md text-center">
					<AlertCircle className="w-10 h-10 text-red-400" />
					<p className="text-sm text-red-400">{error}</p>
					<p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
						Try downloading the file and opening it in Word or Pages.
					</p>
					<div className="flex gap-3 mt-4">
						<button
							onClick={handleDownload}
							className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
							style={{ background: '#2B579A', color: 'white' }}
						>
							<Download className="w-4 h-4" />
							Download
						</button>
						<button
							onClick={handleOpenInApp}
							className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors border"
							style={{
								borderColor: 'var(--border-default)',
								color: 'var(--text-secondary)',
								background: 'var(--surface-base)'
							}}
						>
							<ExternalLink className="w-4 h-4" />
							Open in App
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-raised)' }}>
			{/* Toolbar */}
			<div
				className="flex items-center justify-between px-3 py-1.5 shrink-0"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
				<div className="flex items-center gap-2">
					<FileText className="w-4 h-4" style={{ color: '#2B579A' }} />
					<span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
						Word Document
					</span>
					{warnings.length > 0 && (
						<span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' }}>
							{warnings.length} warning{warnings.length > 1 ? 's' : ''}
						</span>
					)}
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
					<button
						onClick={handleOpenInApp}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-accent)]"
						title="Open in App"
						style={{ color: 'var(--text-tertiary)' }}
					>
						<ExternalLink className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Document content */}
			<div className="flex-1 overflow-auto p-6" style={{ background: 'var(--surface-sunken)' }}>
				<div
					className="max-w-3xl mx-auto p-8 rounded-lg shadow-sm"
					style={{
						background: 'var(--surface-raised)',
						minHeight: '100%'
					}}
				>
					<style>{`
						.docx-content {
							font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
							font-size: 14px;
							line-height: 1.6;
							color: var(--text-primary);
						}
						.docx-content h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
						.docx-content h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0; }
						.docx-content h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0; }
						.docx-content h4 { font-weight: bold; margin: 1.33em 0; }
						.docx-content p { margin: 1em 0; }
						.docx-content ul, .docx-content ol { margin: 1em 0; padding-left: 2em; }
						.docx-content li { margin: 0.5em 0; }
						.docx-content table { border-collapse: collapse; margin: 1em 0; width: 100%; }
						.docx-content th, .docx-content td {
							border: 1px solid var(--border-default);
							padding: 0.5em;
							text-align: left;
						}
						.docx-content th { background: var(--surface-base); font-weight: 600; }
						.docx-content img { max-width: 100%; height: auto; }
						.docx-content a { color: #2B579A; text-decoration: underline; }
						.docx-content blockquote {
							border-left: 4px solid var(--border-default);
							margin: 1em 0;
							padding-left: 1em;
							color: var(--text-secondary);
						}
						.docx-content pre, .docx-content code {
							font-family: 'SF Mono', Monaco, Consolas, monospace;
							background: var(--surface-base);
							padding: 0.2em 0.4em;
							border-radius: 4px;
							font-size: 0.9em;
						}
						.docx-content pre { padding: 1em; overflow-x: auto; }
					`}</style>
					<div
						className="docx-content"
						dangerouslySetInnerHTML={{ __html: htmlContent }}
					/>
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
				{fileName}
			</div>
		</div>
	);
}

export default DocxViewer;
