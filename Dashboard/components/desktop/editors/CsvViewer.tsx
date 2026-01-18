'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { AlertCircle, AlertTriangle, RefreshCw, Table2, TextCursorInput, FolderOpen } from 'lucide-react';
import { useWindowStore } from '@/store/windowStore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface CsvViewerProps {
	filePath: string;
}


type ViewMode = 'table' | 'raw';

const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 50;

function parseDelimited(content: string, delimiter: ',' | '\t'): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < content.length; i += 1) {
		const char = content[i];
		const next = content[i + 1];

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
}

export function CsvViewer({ filePath }: CsvViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState('');
	const [mtime, setMtime] = useState<string>('');
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasConflict, setHasConflict] = useState(false);
	const [viewMode, setViewMode] = useState<ViewMode>('table');
	const [isLargeFile, setIsLargeFile] = useState(false);
	const { openAppWindow } = useWindowStore();
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;

	const extension = (filePath.split('.').pop() || '').toLowerCase();
	const delimiter = extension === 'tsv' ? '\t' : ',';

	useFileEvents({
		onModified: (event) => {
			// Normalize paths for comparison (remove Desktop/ prefix if present)
			const normalizeFilePath = (path: string) => path.replace(/^Desktop\//, "");
			const eventPath = normalizeFilePath(event.path);
			const currentPath = normalizeFilePath(filePathRef.current);

			if (eventPath === currentPath) {
				if (hasChanges || isSaving) {
					setHasConflict(true);
					toast.error('File was modified externally', { id: 'file-conflict' });
				} else {
					loadContent();
				}
			}
		},
	});

	const loadContent = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await fetchFileContent(filePath);
			setContent(data.content);
			setMtime(data.mtime || '');
			setHasChanges(false);
			setHasConflict(false);
			const large = isLargeContent(data.content);
			setIsLargeFile(large);
			if (large) {
				setViewMode('raw');
			}
		} catch (err) {
			setError(`Failed to load file: ${err}`);
		} finally {
			setLoading(false);
		}
	}, [filePath]);

	useEffect(() => {
		loadContent();
	}, [loadContent]);

	const handleContentChange = useCallback(
		(newContent: string) => {
			setContent(newContent);
			setHasChanges(true);

			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}

			saveTimeoutRef.current = setTimeout(async () => {
				setIsSaving(true);
				try {
					const result = await updateFileContent(filePath, newContent, mtime);
					if (result.success) {
						setHasChanges(false);
						setHasConflict(false);
						if (result.mtime) {
							setMtime(result.mtime);
						}
					} else if (result.error === 'conflict') {
						setHasConflict(true);
						toast.error('File was modified externally');
					} else {
						toast.error(result.error || 'Failed to save');
					}
				} catch (err) {
					toast.error(`Save failed: ${err}`);
				} finally {
					setIsSaving(false);
				}
			}, 2000);
		},
		[filePath, mtime]
	);

	const forceSave = useCallback(async () => {
		setIsSaving(true);
		try {
			const result = await updateFileContent(filePath, content);
			if (result.success) {
				setHasChanges(false);
				setHasConflict(false);
				if (result.mtime) {
					setMtime(result.mtime);
				}
				toast.success('File saved');
			} else {
				toast.error(result.error || 'Failed to save');
			}
		} catch (err) {
			toast.error(`Save failed: ${err}`);
		} finally {
			setIsSaving(false);
		}
	}, [filePath, content]);

	const discardChanges = useCallback(() => {
		loadContent();
	}, [loadContent]);

	// Show in Finder handler
	const showInFinder = useCallback(() => {
		const normalizedPath = filePath.replace(/^Desktop\//, "");
		const lastSlash = normalizedPath.lastIndexOf("/");
		const parentPath = lastSlash > 0 ? normalizedPath.substring(0, lastSlash) : "";
		openAppWindow("finder", parentPath);
	}, [filePath, openAppWindow]);

	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full" style={{ background: 'var(--surface-raised)' }}>
				<div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 p-4" style={{ background: 'var(--surface-raised)' }}>
				<AlertCircle className="w-8 h-8 text-red-400" />
				<p className="text-sm text-red-400 text-center">{error}</p>
			</div>
		);
	}

	const rows = viewMode === 'table' ? parseDelimited(content, delimiter) : [];
	const header = rows[0] || [];
	const dataRows = rows.slice(1, MAX_TABLE_ROWS + 1);
	const isTruncated = rows.length > MAX_TABLE_ROWS + 1 || header.length > MAX_TABLE_COLS;

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-raised)' }}>
			{isLargeFile && (
				<div
					className="px-3 py-2 text-xs"
					style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
				>
					Large file detected. Table preview disabled.
				</div>
			)}
			{hasConflict && (
				<div
					className="flex items-center justify-between px-3 py-2"
					style={{
						background: 'var(--color-warning-dim)',
						borderBottom: '1px solid var(--border-default)',
					}}
				>
					<div className="flex items-center gap-2" style={{ color: 'var(--color-warning)' }}>
						<AlertTriangle className="w-4 h-4" />
						<span className="text-sm font-medium">File modified externally</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={discardChanges}
							className="px-2 py-1 text-xs rounded transition-colors"
							style={{
								background: 'var(--surface-base)',
								border: '1px solid var(--border-default)',
								color: 'var(--text-primary)',
							}}
						>
							<RefreshCw className="w-3 h-3 inline mr-1" />
							Reload
						</button>
						<button
							onClick={forceSave}
							className="px-2 py-1 text-xs rounded transition-colors"
							style={{ background: 'var(--color-warning)', color: 'white' }}
						>
							Keep Mine
						</button>
					</div>
				</div>
			)}

			<div
				className="flex items-center justify-between px-3 py-1.5"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setViewMode('table')}
						className="p-1.5 rounded transition-colors"
						style={{
							color: viewMode === 'table' ? '#DA7756' : 'var(--text-tertiary)',
							background: viewMode === 'table' ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
						}}
						title="Table view"
						disabled={isLargeFile}
					>
						<Table2 className="w-4 h-4" />
					</button>
					<button
						onClick={() => setViewMode('raw')}
						className="p-1.5 rounded transition-colors"
						style={{
							color: viewMode === 'raw' ? '#DA7756' : 'var(--text-tertiary)',
							background: viewMode === 'raw' ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
						}}
						title="Raw view"
					>
						<TextCursorInput className="w-4 h-4" />
					</button>
				</div>

				<div className="flex items-center gap-2">
					{/* Show in Finder */}
					<button
						onClick={showInFinder}
						className="p-1.5 rounded transition-colors"
						style={{ color: 'var(--text-tertiary)' }}
						title="Show in Finder"
					>
						<FolderOpen className="w-4 h-4" />
					</button>

					<div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
					{isLargeFile && (
						<span className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}>
							Large file
						</span>
					)}
					{isSaving && (
						<>
							<span>Saving...</span>
						</>
					)}
					{!isSaving && hasConflict && (
						<span style={{ color: 'var(--color-warning)' }}>Conflict</span>
					)}
					{!isSaving && !hasConflict && hasChanges && (
						<span style={{ color: 'var(--color-warning)' }}>Unsaved</span>
					)}
					{!isSaving && !hasConflict && !hasChanges && (
						<span style={{ color: 'var(--color-success)' }}>Saved</span>
					)}
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				{viewMode === 'raw' || isLargeFile ? (
					<textarea
						value={content}
						onChange={(e) => handleContentChange(e.target.value)}
						className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none leading-relaxed"
						style={{
							background: 'var(--surface-raised)',
							color: 'var(--text-primary)',
						}}
						spellCheck={false}
						readOnly={isLargeFile}
					/>
				) : (
					<div className="min-w-full overflow-auto">
						<table className="min-w-full text-xs">
							<thead>
								<tr style={{ background: 'var(--surface-base)' }}>
									{header.slice(0, MAX_TABLE_COLS).map((cell, idx) => (
										<th
											key={`header-${idx}`}
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
									<tr key={`row-${rowIdx}`} className="odd:bg-[var(--surface-sunken)]">
										{row.slice(0, MAX_TABLE_COLS).map((cell, cellIdx) => (
											<td
												key={`cell-${rowIdx}-${cellIdx}`}
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
						{isTruncated && (
							<div className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
								Table preview truncated. Switch to raw view for full content.
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export default CsvViewer;
