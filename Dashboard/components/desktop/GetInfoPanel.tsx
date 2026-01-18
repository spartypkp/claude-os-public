'use client';

import { finderInfo, FinderItem } from '@/lib/api';
import { useWindowStore } from '@/store/windowStore';
import {
	Calendar,
	File,
	FileCode,
	FileJson,
	FileText,
	Folder,
	HardDrive,
	Loader2,
	X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	folder: Folder,
	file: File,
	markdown: FileText,
	code: FileCode,
	json: FileJson,
	text: FileText,
};

// Format bytes to human-readable size
function formatBytes(bytes: number | null): string {
	if (bytes === null || bytes === undefined) return '—';
	if (bytes === 0) return '0 B';
	
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);
	
	return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// Format date nicely
function formatDate(isoString: string | undefined): string {
	if (!isoString) return '—';
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

// Get file extension
function getExtension(name: string): string {
	const dotIndex = name.lastIndexOf('.');
	if (dotIndex === -1 || dotIndex === name.length - 1) return '';
	return name.slice(dotIndex + 1).toUpperCase();
}

// Get kind description
function getKindDescription(item: FinderItem): string {
	if (item.type === 'folder') return 'Folder';
	if (item.type === 'domain') return 'Life Domain';
	if (item.type === 'app') return 'Application';
	
	const ext = getExtension(item.name);
	const kinds: Record<string, string> = {
		MD: 'Markdown Document',
		TXT: 'Plain Text Document',
		JSON: 'JSON Document',
		YAML: 'YAML Configuration',
		YML: 'YAML Configuration',
		JS: 'JavaScript File',
		TS: 'TypeScript File',
		TSX: 'TypeScript React File',
		JSX: 'JavaScript React File',
		PY: 'Python Script',
		SH: 'Shell Script',
		CSS: 'Stylesheet',
		HTML: 'HTML Document',
		PNG: 'PNG Image',
		JPG: 'JPEG Image',
		JPEG: 'JPEG Image',
		GIF: 'GIF Image',
		SVG: 'SVG Image',
		PDF: 'PDF Document',
	};
	
	return kinds[ext] || (ext ? `${ext} File` : 'Document');
}

interface InfoRowProps {
	label: string;
	value: React.ReactNode;
	mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
	return (
		<div className="flex gap-4 py-2 border-b border-white/5 last:border-0">
			<span className="w-24 shrink-0 text-[11px] text-[#808080] font-medium uppercase tracking-wide">
				{label}
			</span>
			<span className={`flex-1 text-[13px] text-[#e0e0e0] break-all ${mono ? 'font-mono text-[12px]' : ''}`}>
				{value}
			</span>
		</div>
	);
}

interface GetInfoPanelProps {
	path: string;
	onClose: () => void;
}

// Normalize path to be relative to Desktop/ (strip prefix if present)
function normalizePath(path: string): string {
	if (path.startsWith('Desktop/')) {
		return path.slice('Desktop/'.length);
	}
	if (path.startsWith('/Desktop/')) {
		return path.slice('/Desktop/'.length);
	}
	if (path.startsWith('/')) {
		return path.slice(1);
	}
	return path;
}

export function GetInfoPanel({ path, onClose }: GetInfoPanelProps) {
	const [info, setInfo] = useState<FinderItem | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	
	// Normalize the path (strip Desktop/ prefix if present)
	const normalizedPath = normalizePath(path);
	
	// Fetch file info
	useEffect(() => {
		let cancelled = false;
		
		async function fetchInfo() {
			setLoading(true);
			setError(null);
			try {
				const data = await finderInfo(normalizedPath);
				if (!cancelled) {
					setInfo(data);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Failed to get info');
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		
		fetchInfo();
		return () => { cancelled = true; };
	}, [normalizedPath]);
	
	// Handle escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);
	
	// Get icon component
	const IconComponent = info ? (ICON_MAP[info.icon] || File) : File;
	
	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
				onClick={onClose}
			/>
			
			{/* Panel */}
			<div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] z-[9999] animate-scale-in">
				<div className="bg-[#1e1e1e]/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden">
					{/* Header with close button */}
					<div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
						<h2 className="text-[13px] font-semibold text-[#e0e0e0]">
							{info?.name || 'Get Info'}
						</h2>
						<button
							onClick={onClose}
							className="p-1 rounded-md hover:bg-white/10 transition-colors"
						>
							<X className="w-4 h-4 text-[#808080]" />
						</button>
					</div>
					
					{/* Content */}
					<div className="p-4">
						{loading ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
							</div>
						) : error ? (
							<div className="text-center py-8">
								<p className="text-red-400 text-sm">{error}</p>
							</div>
						) : info ? (
							<>
								{/* Icon and name header */}
								<div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
									<div className="w-16 h-16 rounded-xl bg-[#2a2a2a] flex items-center justify-center">
										<IconComponent className="w-8 h-8 text-[#DA7756]" />
									</div>
									<div className="flex-1 min-w-0">
										<h3 className="text-lg font-semibold text-[#e0e0e0] truncate">
											{info.name}
										</h3>
										<p className="text-[12px] text-[#808080]">
											{getKindDescription(info)}
										</p>
									</div>
								</div>
								
								{/* Info rows */}
								<div className="space-y-0">
									<InfoRow label="Kind" value={getKindDescription(info)} />
									<InfoRow label="Size" value={
										<span className="flex items-center gap-2">
											<HardDrive className="w-3 h-3 text-[#808080]" />
											{formatBytes(info.size)}
										</span>
									} />
									<InfoRow label="Path" value={info.path} mono />
									<InfoRow label="Modified" value={
										<span className="flex items-center gap-2">
											<Calendar className="w-3 h-3 text-[#808080]" />
											{formatDate(info.modified)}
										</span>
									} />
									{info.created && (
										<InfoRow label="Created" value={
											<span className="flex items-center gap-2">
												<Calendar className="w-3 h-3 text-[#808080]" />
												{formatDate(info.created)}
											</span>
										} />
									)}
									{info.type !== 'file' && info.child_count !== undefined && (
										<InfoRow label="Contains" value={`${info.child_count} items`} />
									)}
									{info.has_app_spec && (
										<InfoRow label="Type" value={
											<span className="px-2 py-0.5 bg-[#DA7756]/20 text-[#DA7756] rounded text-[11px] font-medium">
												Custom App
											</span>
										} />
									)}
									{info.has_life_spec && (
										<InfoRow label="Type" value={
											<span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[11px] font-medium">
												Life Domain
											</span>
										} />
									)}
								</div>
							</>
						) : null}
					</div>
				</div>
			</div>
		</>
	);
}

// Hook to manage Get Info panel state globally
export function useGetInfoPanel() {
	const [infoPath, setInfoPath] = useState<string | null>(null);
	
	const showGetInfo = useCallback((path: string) => {
		setInfoPath(path);
	}, []);
	
	const closeGetInfo = useCallback(() => {
		setInfoPath(null);
	}, []);
	
	return {
		infoPath,
		showGetInfo,
		closeGetInfo,
		isOpen: infoPath !== null,
	};
}

export default GetInfoPanel;

