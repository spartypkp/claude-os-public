'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, Loader2, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoViewerProps {
	filePath: string;
}

/**
 * Video viewer with playback controls.
 */
export function VideoViewer({ filePath }: VideoViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);

	const videoRef = useRef<HTMLVideoElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const videoUrl = `${API_BASE}/api/files/raw/${encodeURIComponent(apiPath)}`;

	useEffect(() => {
		setLoading(true);
		setError(null);
		setIsPlaying(false);
		setProgress(0);
	}, [filePath]);

	const handleLoad = useCallback(() => {
		setLoading(false);
		if (videoRef.current) {
			setDuration(videoRef.current.duration);
		}
	}, []);

	const handleError = useCallback(() => {
		setLoading(false);
		setError('Failed to load video');
	}, []);

	const handlePlayPause = useCallback(() => {
		if (videoRef.current) {
			if (isPlaying) {
				videoRef.current.pause();
			} else {
				videoRef.current.play();
			}
			setIsPlaying(!isPlaying);
		}
	}, [isPlaying]);

	const handleMuteToggle = useCallback(() => {
		if (videoRef.current) {
			videoRef.current.muted = !isMuted;
			setIsMuted(!isMuted);
		}
	}, [isMuted]);

	const handleTimeUpdate = useCallback(() => {
		if (videoRef.current) {
			setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
		}
	}, []);

	const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		if (videoRef.current) {
			const time = (parseFloat(e.target.value) / 100) * videoRef.current.duration;
			videoRef.current.currentTime = time;
			setProgress(parseFloat(e.target.value));
		}
	}, []);

	const handleFullscreen = useCallback(() => {
		if (containerRef.current) {
			if (!isFullscreen) {
				containerRef.current.requestFullscreen?.();
			} else {
				document.exitFullscreen?.();
			}
			setIsFullscreen(!isFullscreen);
		}
	}, [isFullscreen]);

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = videoUrl;
		link.download = fileName;
		link.click();
	}, [videoUrl, fileName]);

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

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
		<div ref={containerRef} className="flex flex-col h-full" style={{ background: '#000' }}>
			{/* Video container */}
			<div className="flex-1 relative flex items-center justify-center">
				{loading && (
					<div className="absolute inset-0 flex items-center justify-center">
						<Loader2 className="w-8 h-8 animate-spin text-white" />
					</div>
				)}
				<video
					ref={videoRef}
					src={videoUrl}
					onLoadedMetadata={handleLoad}
					onError={handleError}
					onTimeUpdate={handleTimeUpdate}
					onPlay={() => setIsPlaying(true)}
					onPause={() => setIsPlaying(false)}
					className={`max-w-full max-h-full ${loading ? 'opacity-0' : 'opacity-100'}`}
					playsInline
				/>
			</div>

			{/* Controls */}
			<div
				className="px-4 py-3 flex flex-col gap-2"
				style={{ background: 'rgba(0,0,0,0.8)' }}
			>
				{/* Progress bar */}
				<input
					type="range"
					min="0"
					max="100"
					value={progress}
					onChange={handleSeek}
					className="w-full h-1 bg-gray-600 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
				/>

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						{/* Play/Pause */}
						<button
							onClick={handlePlayPause}
							className="p-1.5 rounded transition-colors hover:bg-white/10 text-white"
						>
							{isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
						</button>

						{/* Mute */}
						<button
							onClick={handleMuteToggle}
							className="p-1.5 rounded transition-colors hover:bg-white/10 text-white"
						>
							{isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
						</button>

						{/* Time */}
						<span className="text-xs text-white/70">
							{formatTime((progress / 100) * duration)} / {formatTime(duration)}
						</span>
					</div>

					<div className="flex items-center gap-2">
						{/* Fullscreen */}
						<button
							onClick={handleFullscreen}
							className="p-1.5 rounded transition-colors hover:bg-white/10 text-white"
						>
							{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
						</button>

						{/* Download */}
						<button
							onClick={handleDownload}
							className="p-1.5 rounded transition-colors hover:bg-white/10 text-white"
						>
							<Download className="w-4 h-4" />
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

export default VideoViewer;
