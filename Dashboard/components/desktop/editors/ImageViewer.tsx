'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, Loader2, Maximize2, Minimize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ImageViewerProps {
	filePath: string;
}

/**
 * Image viewer with zoom, rotate, and download controls.
 * Uses CSS custom properties for theming (see globals.css).
 */
export function ImageViewer({ filePath }: ImageViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [fitMode, setFitMode] = useState<'contain' | 'actual'>('contain');

	const fileName = filePath.split('/').pop() || filePath;
	// Strip "Desktop/" prefix if present (API expects paths relative to Desktop/)
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const imageUrl = `${API_BASE}/api/finder/raw/${encodeURIComponent(apiPath)}`;

	// Reset state when file changes
	useEffect(() => {
		setLoading(true);
		setError(null);
		setZoom(1);
		setRotation(0);
		setFitMode('contain');
	}, [filePath]);

	const handleLoad = useCallback(() => {
		setLoading(false);
	}, []);

	const handleError = useCallback(() => {
		setLoading(false);
		setError('Failed to load image');
	}, []);

	const handleZoomIn = useCallback(() => {
		setZoom(z => Math.min(z + 0.25, 4));
		setFitMode('actual');
	}, []);

	const handleZoomOut = useCallback(() => {
		setZoom(z => Math.max(z - 0.25, 0.25));
		setFitMode('actual');
	}, []);

	const handleRotate = useCallback(() => {
		setRotation(r => (r + 90) % 360);
	}, []);

	const handleFitToggle = useCallback(() => {
		if (fitMode === 'contain') {
			setFitMode('actual');
			setZoom(1);
		} else {
			setFitMode('contain');
			setZoom(1);
		}
	}, [fitMode]);

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = imageUrl;
		link.download = fileName;
		link.click();
	}, [imageUrl, fileName]);

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
			{/* Toolbar */}
			<div 
				className="flex items-center justify-between px-3 py-1.5"
				style={{ 
					background: 'var(--surface-base)', 
					borderBottom: '1px solid var(--border-subtle)' 
				}}
			>
				<div className="flex items-center gap-2">
					{/* Zoom controls */}
					<button
						onClick={handleZoomOut}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
						style={{ color: 'var(--text-tertiary)' }}
						title="Zoom out"
					>
						<ZoomOut className="w-4 h-4" />
					</button>
					<span 
						className="text-xs min-w-[3rem] text-center"
						style={{ color: 'var(--text-tertiary)' }}
					>
						{Math.round(zoom * 100)}%
					</span>
					<button
						onClick={handleZoomIn}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
						style={{ color: 'var(--text-tertiary)' }}
						title="Zoom in"
					>
						<ZoomIn className="w-4 h-4" />
					</button>

					<div 
						className="w-px h-4 mx-2"
						style={{ background: 'var(--border-default)' }}
					/>

					{/* Fit toggle */}
					<button
						onClick={handleFitToggle}
						className="p-1.5 rounded transition-colors"
						style={{ 
							color: fitMode === 'contain' ? '#DA7756' : 'var(--text-tertiary)',
							background: fitMode === 'contain' ? 'rgba(218, 119, 86, 0.1)' : 'transparent'
						}}
						title={fitMode === 'contain' ? 'Fit to window' : 'Actual size'}
					>
						{fitMode === 'contain' ? (
							<Minimize2 className="w-4 h-4" />
						) : (
							<Maximize2 className="w-4 h-4" />
						)}
					</button>

					{/* Rotate */}
					<button
						onClick={handleRotate}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
						style={{ color: 'var(--text-tertiary)' }}
						title="Rotate 90°"
					>
						<RotateCw className="w-4 h-4" />
					</button>
				</div>

				<div className="flex items-center gap-2">
					{/* Download */}
					<button
						onClick={handleDownload}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
						style={{ color: 'var(--text-tertiary)' }}
						title="Download"
					>
						<Download className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Image container */}
			<div 
				className="flex-1 overflow-auto flex items-center justify-center p-4"
				style={{ background: 'var(--surface-sunken)' }}
			>
				{loading && (
					<div className="absolute inset-0 flex items-center justify-center">
						<Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
					</div>
				)}
				<img
					src={imageUrl}
					alt={fileName}
					onLoad={handleLoad}
					onError={handleError}
					className={`
						transition-transform duration-200 rounded shadow-lg
						${loading ? 'opacity-0' : 'opacity-100'}
					`}
					style={{
						transform: `scale(${zoom}) rotate(${rotation}deg)`,
						maxWidth: fitMode === 'contain' ? '100%' : 'none',
						maxHeight: fitMode === 'contain' ? '100%' : 'none',
						objectFit: fitMode === 'contain' ? 'contain' : 'none',
					}}
				/>
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

export default ImageViewer;
