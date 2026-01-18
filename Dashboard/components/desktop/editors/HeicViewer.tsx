'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, Loader2, Maximize2, Minimize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface HeicViewerProps {
	filePath: string;
}

/**
 * HEIC Viewer - converts HEIC/HEIF images to displayable format.
 * Uses heic2any to convert Apple's HEIC format to JPEG for browser display.
 */
export function HeicViewer({ filePath }: HeicViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [fitMode, setFitMode] = useState<'contain' | 'actual'>('contain');

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const downloadUrl = `${API_BASE}/api/finder/raw/${encodeURIComponent(apiPath)}`;

	const loadFile = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			// Fetch file as blob
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch file: ${response.statusText}`);
			}

			const blob = await response.blob();

			// Dynamically import heic2any
			const heic2any = (await import('heic2any')).default;

			// Convert HEIC to JPEG
			const result = await heic2any({
				blob,
				toType: 'image/jpeg',
				quality: 0.9,
			});

			// heic2any returns a single blob or array of blobs
			const outputBlob = Array.isArray(result) ? result[0] : result;
			const url = URL.createObjectURL(outputBlob);
			setImageUrl(url);
		} catch (err) {
			console.error('Failed to convert HEIC:', err);
			setError(err instanceof Error ? err.message : 'Failed to convert image');
		} finally {
			setLoading(false);
		}
	}, [downloadUrl]);

	useEffect(() => {
		loadFile();

		// Cleanup object URL on unmount
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		};
	}, [loadFile]);

	// Cleanup old URL when creating new one
	useEffect(() => {
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		};
	}, [imageUrl]);

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
		link.href = downloadUrl;
		link.download = fileName;
		link.click();
	}, [downloadUrl, fileName]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: 'var(--surface-raised)' }}>
				<Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
				<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Converting HEIC image...</p>
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
						Try downloading the file and opening it in Preview or Photos.
					</p>
					<button
						onClick={handleDownload}
						className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors mt-4"
						style={{ background: 'var(--surface-accent)', color: 'var(--text-primary)' }}
					>
						<Download className="w-4 h-4" />
						Download Original
					</button>
				</div>
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
					<span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
						HEIC
					</span>
					{/* Download */}
					<button
						onClick={handleDownload}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
						style={{ color: 'var(--text-tertiary)' }}
						title="Download original"
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
				{imageUrl && (
					<img
						src={imageUrl}
						alt={fileName}
						className="transition-transform duration-200 rounded shadow-lg"
						style={{
							transform: `scale(${zoom}) rotate(${rotation}deg)`,
							maxWidth: fitMode === 'contain' ? '100%' : 'none',
							maxHeight: fitMode === 'contain' ? '100%' : 'none',
							objectFit: fitMode === 'contain' ? 'contain' : 'none',
						}}
					/>
				)}
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
				{fileName} · Converted to JPEG for display
			</div>
		</div>
	);
}

export default HeicViewer;
