'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { isProtectedFile as isProtectedFileName } from '@/lib/systemFiles';
import { AlertCircle, AlertTriangle, Edit3, FileJson, GitBranch, Loader2, RefreshCw } from 'lucide-react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface JsonEditorProps {
	filePath: string;
}

type JsonViewMode = 'formatted' | 'tree';

// Wrapper to check if a file path is protected (extracts filename)
function isProtectedFile(path: string): boolean {
	const fileName = path.split('/').pop() || '';
	return isProtectedFileName(fileName);
}

function formatJson(raw: string): { formatted: string; error?: string } {
	try {
		const parsed = JSON.parse(raw);
		return { formatted: JSON.stringify(parsed, null, 2) };
	} catch (err) {
		return { formatted: raw, error: err instanceof Error ? err.message : 'Invalid JSON' };
	}
}

/**
 * JSON editor with view/edit toggle and auto-save.
 * Uses CSS custom properties for theming (see globals.css).
 */
export function JsonEditor({ filePath }: JsonEditorProps) {
	const isReadOnly = isProtectedFile(filePath);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState('');
	const [mtime, setMtime] = useState<string>('');
	const [isEditing, setIsEditing] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasConflict, setHasConflict] = useState(false);
	const [formatError, setFormatError] = useState<string | null>(null);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const [viewMode, setViewMode] = useState<JsonViewMode>('formatted');
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;

	const loadContent = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await fetchFileContent(filePath);
			setContent(data.content);
			setMtime(data.mtime || '');
			setHasChanges(false);
			setHasConflict(false);
			setIsLargeFile(isLargeContent(data.content));
			const formatted = formatJson(data.content);
			setFormatError(formatted.error || null);
		} catch (err) {
			setError(`Failed to load file: ${err}`);
		} finally {
			setLoading(false);
		}
	}, [filePath]);

	// Handle both 'modified' and 'created' — atomic writes (Edit tool) emit 'created'
	const handleExternalChange = useCallback((event: { path: string }) => {
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
	}, [loadContent, hasChanges, isSaving]);

	useFileEvents({
		onModified: handleExternalChange,
		onCreated: handleExternalChange,
	});

	useEffect(() => {
		loadContent();
	}, [loadContent]);

	useEffect(() => {
		if (isLargeFile) {
			setIsEditing(false);
		}
	}, [isLargeFile]);

	useEffect(() => {
		if (isEditing) {
			setViewMode('formatted');
		}
	}, [isEditing]);

	const handleContentChange = useCallback(
		(newContent: string) => {
			setContent(newContent);
			setHasChanges(true);

			const formatted = formatJson(newContent);
			setFormatError(formatted.error || null);

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


	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	if (loading) {
		return (
			<div
				className="flex items-center justify-center h-full"
				style={{ background: 'var(--surface-raised)' }}
			>
				<Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
			</div>
		);
	}

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

	const formattedView = formatJson(content);
	const canEdit = !isReadOnly && !isLargeFile;
	const parsedJson = formatError ? null : (() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	})();

	const JsonNode = ({ data, depth }: { data: unknown; depth: number }) => {
		const [collapsed, setCollapsed] = useState(false);
		const isObject = typeof data === 'object' && data !== null;
		const isArray = Array.isArray(data);

		if (!isObject) {
			return (
				<span className="text-xs" style={{ color: 'var(--text-primary)' }}>
					{JSON.stringify(data)}
				</span>
			);
		}

		const entries = isArray ? data.map((value, index) => [String(index), value]) : Object.entries(data);
		return (
			<div style={{ marginLeft: depth * 12 }}>
				<button
					onClick={() => setCollapsed(!collapsed)}
					className="text-xs"
					style={{ color: 'var(--text-tertiary)' }}
				>
					{collapsed ? '▶' : '▼'} {isArray ? `Array(${entries.length})` : `Object(${entries.length})`}
				</button>
				{!collapsed && (
					<div className="mt-1 space-y-1">
						{entries.map(([key, value]) => (
							<div key={key} className="flex items-start gap-2">
								<span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
									{key}
								</span>
								<span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
									:
								</span>
								<JsonNode data={value} depth={depth + 1} />
							</div>
						))}
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-raised)' }}>
			{isLargeFile && (
				<div
					className="px-3 py-2 text-xs"
					style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
				>
					Large file detected. Editing is disabled for performance.
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
						onClick={() => {
							setIsEditing(false);
							setViewMode('formatted');
						}}
						className="p-1.5 rounded transition-colors"
						style={{
							color: !isEditing ? '#DA7756' : 'var(--text-tertiary)',
							background: !isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
						}}
						title="View (formatted)"
					>
						<FileJson className="w-4 h-4" />
					</button>
					<button
						onClick={() => {
							setIsEditing(false);
							setViewMode('tree');
						}}
						className="p-1.5 rounded transition-colors"
						style={{
							color: viewMode === 'tree' && !isEditing ? '#DA7756' : 'var(--text-tertiary)',
							background: viewMode === 'tree' && !isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
						}}
						title="Tree view"
					>
						<GitBranch className="w-4 h-4" />
					</button>
					{canEdit && (
						<button
							onClick={() => setIsEditing(true)}
							className="p-1.5 rounded transition-colors"
							style={{
								color: isEditing ? '#DA7756' : 'var(--text-tertiary)',
								background: isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
							}}
							title="Edit (raw)"
						>
							<Edit3 className="w-4 h-4" />
						</button>
					)}
				</div>

				<div className="flex items-center gap-2">
					<div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
					{formatError && (
						<span style={{ color: 'var(--color-warning)' }}>Invalid JSON</span>
					)}
					{isLargeFile ? (
						<span className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}>
							Large file
						</span>
					) : isReadOnly ? (
						<span className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: 'rgba(218, 119, 86, 0.1)', color: '#DA7756' }}>
							<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0 1 10 0v4" />
							</svg>
							Claude System File
						</span>
					) : (
						<>
							{isSaving && (
								<>
									<Loader2 className="w-3 h-3 animate-spin" />
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
						</>
					)}
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				{isEditing && canEdit ? (
					<textarea
						value={content}
						onChange={(e) => handleContentChange(e.target.value)}
						className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none leading-relaxed"
						style={{
							background: 'var(--surface-sunken)',
							color: 'var(--text-primary)',
						}}
						spellCheck={false}
					/>
				) : viewMode === 'tree' ? (
					<div className="p-4">
						{parsedJson ? (
							<JsonNode data={parsedJson} depth={0} />
						) : (
							<div className="text-xs" style={{ color: 'var(--color-warning)' }}>
								Invalid JSON. Switch to formatted view or edit to fix.
							</div>
						)}
					</div>
				) : (
					<pre className="p-4 font-mono text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
						{formattedView.formatted}
					</pre>
				)}
			</div>
		</div>
	);
}

export default JsonEditor;
