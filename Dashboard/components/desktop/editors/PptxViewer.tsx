'use client';

import { API_BASE } from '@/lib/api';
import { Download, ExternalLink, Presentation } from 'lucide-react';
import { useCallback } from 'react';

interface PptxViewerProps {
	filePath: string;
}

/**
 * PPTX Viewer - displays PowerPoint file info with download options.
 * Full PPTX rendering is complex; this provides a clean download experience.
 */
export function PptxViewer({ filePath }: PptxViewerProps) {
	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const downloadUrl = `${API_BASE}/api/finder/raw/${encodeURIComponent(apiPath)}`;

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = downloadUrl;
		link.download = fileName;
		link.click();
	}, [downloadUrl, fileName]);

	const handleOpenInApp = useCallback(() => {
		window.open(downloadUrl, '_blank');
	}, [downloadUrl]);

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-sunken)' }}>
			{/* Main content */}
			<div className="flex-1 flex items-center justify-center p-8">
				<div className="flex flex-col items-center gap-6 max-w-md text-center">
					{/* Icon */}
					<div
						className="w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg"
						style={{ background: '#D24726' }}
					>
						<Presentation className="w-12 h-12 text-white" />
					</div>

					{/* File info */}
					<div>
						<p className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
							{fileName}
						</p>
						<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
							PowerPoint Presentation
						</p>
					</div>

					{/* Message */}
					<p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
						PowerPoint presentations cannot be previewed in the browser.
						Download the file to view it in PowerPoint or Keynote.
					</p>

					{/* Actions */}
					<div className="flex gap-3">
						<button
							onClick={handleDownload}
							className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
							style={{ background: '#D24726', color: 'white' }}
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

			{/* Footer */}
			<div
				className="px-3 py-1 text-[10px] text-center"
				style={{
					background: 'var(--surface-base)',
					borderTop: '1px solid var(--border-subtle)',
					color: 'var(--text-muted)'
				}}
			>
				{fileName}
			</div>
		</div>
	);
}

export default PptxViewer;
