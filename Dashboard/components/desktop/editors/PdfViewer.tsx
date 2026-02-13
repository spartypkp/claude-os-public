'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface PdfViewerProps {
	filePath: string;
}

/**
 * PDF viewer using the browser's native PDF renderer.
 */
export function PdfViewer({ filePath }: PdfViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fileName = filePath.split('/').pop() || filePath;
	// Strip "Desktop/" prefix if present (API expects paths relative to Desktop/)
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const pdfUrl = `${API_BASE}/api/files/raw/${encodeURIComponent(apiPath)}`;

	useEffect(() => {
		setLoading(true);
		setError(null);
	}, [filePath]);

	const handleLoad = useCallback(() => {
		setLoading(false);
	}, []);

	const handleError = useCallback(() => {
		setLoading(false);
		setError('Failed to load PDF');
	}, []);

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = pdfUrl;
		link.download = fileName;
		link.click();
	}, [pdfUrl, fileName]);

	if (error) {
		return (
			<div
				className="flex flex-col items-center justify-center h-full gap-3 p-4"
				style={{ background: 'var(--surface-raised)' }}
			>
				<AlertCircle className="w-8 h-8 text-red-400" />
				<p className="text-sm text-red-400 text-center">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-sunken)' }}>
			<div
				className="flex items-center justify-between px-3 py-1.5"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
				<span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
					PDF
				</span>
				<button
					onClick={handleDownload}
					className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
					style={{ color: 'var(--text-tertiary)' }}
					title="Download"
				>
					<Download className="w-4 h-4" />
				</button>
			</div>

			<div className="flex-1 relative">
				{loading && (
					<div className="absolute inset-0 flex items-center justify-center">
						<Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
					</div>
				)}
				<iframe
					src={pdfUrl}
					title={fileName}
					className="w-full h-full"
					onLoad={handleLoad}
					onError={handleError}
				/>
			</div>
		</div>
	);
}

export default PdfViewer;
