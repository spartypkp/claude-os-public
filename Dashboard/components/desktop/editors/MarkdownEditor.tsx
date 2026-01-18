'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { isProtectedFile as isProtectedFileName } from '@/lib/systemFiles';
import { AlertCircle, AlertTriangle, Edit3, Eye, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useWindowStore } from '@/store/windowStore';

interface MarkdownEditorProps {
	filePath: string;
}

// Wrapper to check if a file path is protected (extracts filename)
function isProtectedFile(path: string): boolean {
	const fileName = path.split('/').pop() || '';
	return isProtectedFileName(fileName);
}

/**
 * Markdown editor with view/edit toggle, auto-save, and real-time sync.
 * Uses CSS custom properties for theming (see globals.css).
 * Claude System Files are read-only.
 */
export function MarkdownEditor({ filePath }: MarkdownEditorProps) {
	const isReadOnly = isProtectedFile(filePath);
	const { openAppWindow } = useWindowStore();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState('');
	const [mtime, setMtime] = useState<string>('');
	const [isEditing, setIsEditing] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasConflict, setHasConflict] = useState(false);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;

	// Track state in refs for SSE callback (avoid stale closures)
	const hasChangesRef = useRef(hasChanges);
	const isSavingRef = useRef(isSaving);
	hasChangesRef.current = hasChanges;
	isSavingRef.current = isSaving;

	// Listen for external file changes via SSE
	useFileEvents({
		onModified: (event) => {
			// Normalize paths for comparison (remove Desktop/ prefix if present)
			const normalizeFilePath = (path: string) => path.replace(/^Desktop\//, '');
			const eventPath = normalizeFilePath(event.path);
			const currentPath = normalizeFilePath(filePathRef.current);

			// Check if this event is for our file
			if (eventPath === currentPath) {
				// Use refs to avoid stale closure
				if (hasChangesRef.current || isSavingRef.current) {
					setHasConflict(true);
					toast.error('File was modified externally', { id: 'file-conflict' });
				} else {
					// Auto-reload if no local changes
					loadContent();
				}
			}
		},
	});

	// Load file content
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
		} catch (err) {
			setError(`Failed to load file: ${err}`);
		} finally {
			setLoading(false);
		}
	}, [filePath]);

	// Load file content on mount and when filePath changes
	useEffect(() => {
		loadContent();
	}, [loadContent]);

	useEffect(() => {
		if (isLargeFile) {
			setIsEditing(false);
		}
	}, [isLargeFile]);

	// Auto-save on content change
	const handleContentChange = useCallback(
		(newContent: string) => {
			setContent(newContent);
			setHasChanges(true);

			// Debounce save
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
						// File changed externally - show conflict UI
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

	// Force save (overwrite external changes)
	const forceSave = useCallback(async () => {
		setIsSaving(true);
		try {
			// Save without mtime check to force overwrite
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

	// Discard local changes and reload
	const discardChanges = useCallback(() => {
		loadContent();
	}, [loadContent]);

	// Show in Finder handler
	const showInFinder = useCallback(() => {
		// Extract parent directory from filePath
		// filePath might be "EDIT-TEST.md" or "career/resume.md"
		const normalizedPath = filePath.replace(/^Desktop\//, '');
		const lastSlash = normalizedPath.lastIndexOf('/');
		const parentPath = lastSlash > 0 ? normalizedPath.substring(0, lastSlash) : '';

		// Open Finder window at parent directory
		openAppWindow('finder', parentPath);
	}, [filePath, openAppWindow]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	// Strip YAML frontmatter for display
	const stripFrontmatter = (text: string): string => {
		const match = text.match(/^---\n[\s\S]*?\n---\n/);
		return match ? text.slice(match[0].length) : text;
	};

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

		const canEdit = !isReadOnly && !isLargeFile;

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
				{/* Conflict Banner */}
				{hasConflict && (
				<div 
					className="flex items-center justify-between px-3 py-2"
					style={{ 
						background: 'var(--color-warning-dim)', 
						borderBottom: '1px solid var(--border-default)' 
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
								color: 'var(--text-primary)'
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

			{/* Toolbar */}
			<div 
				className="flex items-center justify-between px-3 py-1.5"
				style={{ 
					background: 'var(--surface-base)', 
					borderBottom: '1px solid var(--border-subtle)' 
				}}
			>
				<div className="flex items-center gap-2">
					{/* View/Edit Toggle */}
					<button
						onClick={() => setIsEditing(false)}
						className="p-1.5 rounded transition-colors"
						style={{ 
							color: !isEditing ? '#DA7756' : 'var(--text-tertiary)',
							background: !isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent'
						}}
						title="View (rendered)"
					>
						<Eye className="w-4 h-4" />
					</button>
					{canEdit && (
						<button
							onClick={() => setIsEditing(true)}
							className="p-1.5 rounded transition-colors"
							style={{ 
								color: isEditing ? '#DA7756' : 'var(--text-tertiary)',
								background: isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent'
							}}
							title="Edit (source)"
						>
							<Edit3 className="w-4 h-4" />
						</button>
					)}
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

					{/* Status */}
					<div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
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
								<span style={{ color: 'var(--color-warning)' }}>Unsaved changes</span>
							)}
							{!isSaving && !hasConflict && !hasChanges && (
								<span style={{ color: 'var(--color-success)' }}>Saved</span>
							)}
						</>
					)}
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto">
				{isEditing && canEdit ? (
					<textarea
						value={content}
						onChange={(e) => handleContentChange(e.target.value)}
						className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none leading-relaxed"
						style={{ 
							background: 'var(--surface-sunken)', 
							color: 'var(--text-primary)' 
						}}
						spellCheck={false}
					/>
				) : (
					<div 
						className="p-6 prose prose-sm max-w-none"
						style={{ background: 'var(--surface-raised)' }}
					>
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{stripFrontmatter(content)}
						</ReactMarkdown>
					</div>
				)}
			</div>
		</div>
	);
}

export default MarkdownEditor;
