'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Archive, ChevronDown, ChevronRight, Download, File, Folder, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ZipViewerProps {
	filePath: string;
}

interface FileEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	compressedSize: number;
}

interface TreeNode {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	compressedSize: number;
	children: TreeNode[];
	expanded?: boolean;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function buildTree(entries: FileEntry[]): TreeNode[] {
	const root: TreeNode[] = [];
	const map = new Map<string, TreeNode>();

	// Sort entries so directories come first, then by name
	const sorted = [...entries].sort((a, b) => {
		if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	for (const entry of sorted) {
		const parts = entry.path.split('/').filter(Boolean);
		let current = root;
		let currentPath = '';

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const isLast = i === parts.length - 1;

			let node = map.get(currentPath);
			if (!node) {
				node = {
					name: part,
					path: currentPath,
					isDirectory: isLast ? entry.isDirectory : true,
					size: isLast ? entry.size : 0,
					compressedSize: isLast ? entry.compressedSize : 0,
					children: [],
					expanded: i < 2, // Expand first two levels by default
				};
				map.set(currentPath, node);
				current.push(node);
			}
			current = node.children;
		}
	}

	return root;
}

interface TreeItemProps {
	node: TreeNode;
	depth: number;
	onToggle: (path: string) => void;
}

function TreeItem({ node, depth, onToggle }: TreeItemProps) {
	const paddingLeft = depth * 16 + 8;

	return (
		<>
			<div
				className="flex items-center gap-2 py-1 px-2 hover:bg-[var(--surface-accent)] cursor-pointer text-sm"
				style={{ paddingLeft }}
				onClick={() => node.isDirectory && onToggle(node.path)}
			>
				{node.isDirectory ? (
					<>
						{node.expanded ? (
							<ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
						) : (
							<ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
						)}
						<Folder className="w-4 h-4 shrink-0" style={{ color: '#f59e0b' }} />
					</>
				) : (
					<>
						<span className="w-4" />
						<File className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
					</>
				)}
				<span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>
					{node.name}
				</span>
				{!node.isDirectory && (
					<span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
						{formatBytes(node.size)}
					</span>
				)}
			</div>
			{node.isDirectory && node.expanded && node.children.map((child) => (
				<TreeItem key={child.path} node={child} depth={depth + 1} onToggle={onToggle} />
			))}
		</>
	);
}

/**
 * ZIP Viewer - displays archive contents as a file tree.
 * Uses JSZip to parse .zip files client-side.
 */
export function ZipViewer({ filePath }: ZipViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [stats, setStats] = useState({ files: 0, folders: 0, totalSize: 0, compressedSize: 0 });

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const downloadUrl = `${API_BASE}/api/files/raw/${encodeURIComponent(apiPath)}`;

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

			// Dynamically import JSZip
			const JSZip = (await import('jszip')).default;

			// Parse ZIP
			const zip = await JSZip.loadAsync(arrayBuffer);

			// Extract file entries
			const entries: FileEntry[] = [];
			let files = 0;
			let folders = 0;
			let totalSize = 0;
			let compressedSize = 0;

			zip.forEach((relativePath, zipEntry) => {
				const isDirectory = zipEntry.dir;
				if (isDirectory) {
					folders++;
				} else {
					files++;
					// @ts-ignore - _data exists on ZipObject
					const size = zipEntry._data?.uncompressedSize || 0;
					// @ts-ignore
					const compressed = zipEntry._data?.compressedSize || 0;
					totalSize += size;
					compressedSize += compressed;

					entries.push({
						name: relativePath.split('/').pop() || relativePath,
						path: relativePath,
						isDirectory: false,
						size,
						compressedSize: compressed,
					});
				}

				// Add directory entries
				if (isDirectory) {
					entries.push({
						name: relativePath.split('/').filter(Boolean).pop() || relativePath,
						path: relativePath.replace(/\/$/, ''),
						isDirectory: true,
						size: 0,
						compressedSize: 0,
					});
				}
			});

			setTree(buildTree(entries));
			setStats({ files, folders, totalSize, compressedSize });
		} catch (err) {
			console.error('Failed to load zip:', err);
			setError(err instanceof Error ? err.message : 'Failed to load archive');
		} finally {
			setLoading(false);
		}
	}, [downloadUrl]);

	useEffect(() => {
		loadFile();
	}, [loadFile]);

	const handleToggle = useCallback((path: string) => {
		setTree(prevTree => {
			const toggleNode = (nodes: TreeNode[]): TreeNode[] => {
				return nodes.map(node => {
					if (node.path === path) {
						return { ...node, expanded: !node.expanded };
					}
					if (node.children.length > 0) {
						return { ...node, children: toggleNode(node.children) };
					}
					return node;
				});
			};
			return toggleNode(prevTree);
		});
	}, []);

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
				<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading archive...</p>
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
						Try downloading the file and extracting it locally.
					</p>
					<button
						onClick={handleDownload}
						className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors mt-4"
						style={{ background: 'var(--surface-accent)', color: 'var(--text-primary)' }}
					>
						<Download className="w-4 h-4" />
						Download Archive
					</button>
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
					<Archive className="w-4 h-4" style={{ color: '#f59e0b' }} />
					<span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
						ZIP Archive
					</span>
					<span className="text-xs" style={{ color: 'var(--text-muted)' }}>
						{stats.files} files, {stats.folders} folders
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-xs" style={{ color: 'var(--text-muted)' }}>
						{formatBytes(stats.totalSize)} ({formatBytes(stats.compressedSize)} compressed)
					</span>
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

			{/* File tree */}
			<div className="flex-1 overflow-auto" style={{ background: 'var(--surface-raised)' }}>
				{tree.length === 0 ? (
					<div className="flex items-center justify-center h-full">
						<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
							This archive is empty
						</p>
					</div>
				) : (
					<div className="py-1">
						{tree.map((node) => (
							<TreeItem key={node.path} node={node} depth={0} onToggle={handleToggle} />
						))}
					</div>
				)}
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

export default ZipViewer;
