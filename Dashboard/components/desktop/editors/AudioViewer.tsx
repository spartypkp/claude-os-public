'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, Loader2, Music, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioViewerProps {
	filePath: string;
}

/**
 * Audio player with playback controls.
 */
export function AudioViewer({ filePath }: AudioViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);

	const audioRef = useRef<HTMLAudioElement>(null);

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const audioUrl = `${API_BASE}/api/finder/raw/${encodeURIComponent(apiPath)}`;

	useEffect(() => {
		setLoading(true);
		setError(null);
		setIsPlaying(false);
		setProgress(0);
	}, [filePath]);

	const handleLoad = useCallback(() => {
		setLoading(false);
		if (audioRef.current) {
			setDuration(audioRef.current.duration);
		}
	}, []);

	const handleError = useCallback(() => {
		setLoading(false);
		setError('Failed to load audio');
	}, []);

	const handlePlayPause = useCallback(() => {
		if (audioRef.current) {
			if (isPlaying) {
				audioRef.current.pause();
			} else {
				audioRef.current.play();
			}
			setIsPlaying(!isPlaying);
		}
	}, [isPlaying]);

	const handleMuteToggle = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.muted = !isMuted;
			setIsMuted(!isMuted);
		}
	}, [isMuted]);

	const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const newVolume = parseFloat(e.target.value);
		setVolume(newVolume);
		if (audioRef.current) {
			audioRef.current.volume = newVolume;
		}
	}, []);

	const handleTimeUpdate = useCallback(() => {
		if (audioRef.current) {
			setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
		}
	}, []);

	const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		if (audioRef.current) {
			const time = (parseFloat(e.target.value) / 100) * audioRef.current.duration;
			audioRef.current.currentTime = time;
			setProgress(parseFloat(e.target.value));
		}
	}, []);

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = audioUrl;
		link.download = fileName;
		link.click();
	}, [audioUrl, fileName]);

	const formatTime = (seconds: number) => {
		if (!isFinite(seconds)) return '0:00';
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
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-sunken)' }}>
			{/* Hidden audio element */}
			<audio
				ref={audioRef}
				src={audioUrl}
				onLoadedMetadata={handleLoad}
				onError={handleError}
				onTimeUpdate={handleTimeUpdate}
				onPlay={() => setIsPlaying(true)}
				onPause={() => setIsPlaying(false)}
				onEnded={() => setIsPlaying(false)}
			/>

			{/* Visual display */}
			<div className="flex-1 flex items-center justify-center p-8">
				{loading ? (
					<Loader2 className="w-16 h-16 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
				) : (
					<div className="flex flex-col items-center gap-6">
						{/* Album art placeholder */}
						<div
							className="w-32 h-32 rounded-xl flex items-center justify-center"
							style={{ background: 'linear-gradient(135deg, #DA7756 0%, #c66a4d 100%)' }}
						>
							<Music className="w-16 h-16 text-white/80" />
						</div>

						{/* File name */}
						<div className="text-center">
							<p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
								{fileName.replace(/\.[^/.]+$/, '')}
							</p>
							<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
								{fileName.split('.').pop()?.toUpperCase()} Audio
							</p>
						</div>
					</div>
				)}
			</div>

			{/* Controls */}
			<div
				className="px-6 py-4 space-y-3"
				style={{
					background: 'var(--surface-base)',
					borderTop: '1px solid var(--border-subtle)'
				}}
			>
				{/* Progress bar */}
				<div className="flex items-center gap-3">
					<span className="text-xs min-w-[3rem] text-right" style={{ color: 'var(--text-tertiary)' }}>
						{formatTime((progress / 100) * duration)}
					</span>
					<input
						type="range"
						min="0"
						max="100"
						value={progress}
						onChange={handleSeek}
						className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#DA7756]"
					/>
					<span className="text-xs min-w-[3rem]" style={{ color: 'var(--text-tertiary)' }}>
						{formatTime(duration)}
					</span>
				</div>

				{/* Playback controls */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						{/* Play/Pause */}
						<button
							onClick={handlePlayPause}
							className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
							style={{ background: '#DA7756' }}
						>
							{isPlaying ? (
								<Pause className="w-6 h-6 text-white" />
							) : (
								<Play className="w-6 h-6 text-white ml-1" />
							)}
						</button>
					</div>

					<div className="flex items-center gap-3">
						{/* Volume */}
						<button
							onClick={handleMuteToggle}
							className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
							style={{ color: 'var(--text-tertiary)' }}
						>
							{isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
						</button>
						<input
							type="range"
							min="0"
							max="1"
							step="0.1"
							value={isMuted ? 0 : volume}
							onChange={handleVolumeChange}
							className="w-20 h-1 bg-gray-300 dark:bg-gray-600 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#DA7756]"
						/>

						{/* Download */}
						<button
							onClick={handleDownload}
							className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
							style={{ color: 'var(--text-tertiary)' }}
						>
							<Download className="w-5 h-5" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default AudioViewer;
