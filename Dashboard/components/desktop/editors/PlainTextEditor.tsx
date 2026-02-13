'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { isProtectedFile as isProtectedFileName } from '@/lib/systemFiles';
import { AlertCircle, AlertTriangle, Loader2, RefreshCw, WrapText } from 'lucide-react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface PlainTextEditorProps {
	filePath: string;
}

// Wrapper to check if a file path is protected (extracts filename)
function isProtectedFile(path: string): boolean {
	const fileName = path.split('/').pop() || '';
	return isProtectedFileName(fileName);
}

/**
 * Simple plain text editor for .txt, .log, and unknown file types with real-time sync.
 * Uses CSS custom properties for theming (see globals.css).
 * Claude System Files are read-only.
 */
export function PlainTextEditor({ filePath }: PlainTextEditorProps) {
	const isReadOnly = isProtectedFile(filePath);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState('');
	const [mtime, setMtime] = useState<string>('');
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasConflict, setHasConflict] = useState(false);
	const [wordWrap, setWordWrap] = useState(true);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;

	// Track state in refs for SSE callback (avoid stale closures)
	const hasChangesRef = useRef(hasChanges);
	const isSavingRef = useRef(isSaving);
	hasChangesRef.current = hasChanges;
	isSavingRef.current = isSaving;

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

	// Listen for external file changes via SSE
	// Handle both 'modified' and 'created' — atomic writes (Edit tool) emit 'created'
	const handleExternalChange = useCallback((event: { path: string }) => {
		const normalizeFilePath = (path: string) => path.replace(/^Desktop\//, "");
		const eventPath = normalizeFilePath(event.path);
		const currentPath = normalizeFilePath(filePathRef.current);

		if (eventPath === currentPath) {
			if (hasChangesRef.current || isSavingRef.current) {
				setHasConflict(true);
				toast.error('File was modified externally', { id: 'file-conflict' });
			} else {
				loadContent();
			}
		}
	}, [loadContent]);

	useFileEvents({
		onModified: handleExternalChange,
		onCreated: handleExternalChange,
	});

	useEffect(() => {
		loadContent();
	}, [loadContent]);

	useEffect(() => {
		if (isLargeFile) {
			setWordWrap(false);
		}
	}, [isLargeFile]);

	// Auto-save on content change
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

	// Force save (overwrite external changes)
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

	// Discard local changes and reload
	const discardChanges = useCallback(() => {
		loadContent();
	}, [loadContent]);


	// Cleanup
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

	const lines = content.split('\n');
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
					{/* Word wrap toggle */}
					<button
						onClick={() => setWordWrap(!wordWrap)}
						className="p-1.5 rounded transition-colors flex items-center gap-1.5"
						style={{ 
							color: wordWrap ? '#DA7756' : 'var(--text-tertiary)',
							background: wordWrap ? 'rgba(218, 119, 86, 0.1)' : 'transparent'
						}}
						title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
						disabled={isLargeFile}
					>
						<WrapText className="w-4 h-4" />
						<span className="text-xs">Wrap</span>
					</button>
				</div>

				<div className="flex items-center gap-2">
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

			{/* Content */}
			<div className="flex-1 overflow-auto">
				<textarea
					value={content}
					onChange={(e) => canEdit && handleContentChange(e.target.value)}
					readOnly={!canEdit}
					className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none leading-relaxed"
					style={{ 
						background: 'var(--surface-raised)', 
						color: 'var(--text-primary)',
						whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
						cursor: canEdit ? 'text' : 'default'
					}}
					spellCheck={false}
				/>
			</div>

			{/* Footer */}
			<div 
				className="flex items-center justify-between px-3 py-1 text-[10px]"
				style={{ 
					background: 'var(--surface-base)', 
					borderTop: '1px solid var(--border-subtle)',
					color: 'var(--text-muted)'
				}}
			>
				<span>{lines.length} lines</span>
				<span>{content.length} characters</span>
			</div>
		</div>
	);
}

export default PlainTextEditor;
