'use client';

import { useFileEvents } from '@/hooks/useFileEvents';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { toDesktopRelative } from '@/lib/pathUtils';
import { isProtectedFile as isProtectedFileName } from '@/lib/systemFiles';
import { AlertCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useEditorContext } from './EditorContext';

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
	const [hasChangesLocal, setHasChangesLocal] = useState(false);
	const [isSavingLocal, setIsSavingLocal] = useState(false);
	const [hasConflictLocal, setHasConflictLocal] = useState(false);
	const [wordWrapLocal, setWordWrapLocal] = useState(true);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;
	const editorCtx = useEditorContext();

	// Sync to EditorContext for PathBar
	const wordWrap = editorCtx?.wordWrap ?? wordWrapLocal;
	const setWordWrap = useCallback((v: boolean) => {
		setWordWrapLocal(v);
		editorCtx?.setWordWrap(v);
	}, [editorCtx]);
	const hasChanges = hasChangesLocal;
	const setHasChanges = useCallback((v: boolean) => {
		setHasChangesLocal(v);
		editorCtx?.setHasChanges(v);
	}, [editorCtx]);
	const isSaving = isSavingLocal;
	const setIsSaving = useCallback((v: boolean) => {
		setIsSavingLocal(v);
		editorCtx?.setIsSaving(v);
	}, [editorCtx]);
	const hasConflict = hasConflictLocal;
	const setHasConflict = useCallback((v: boolean) => {
		setHasConflictLocal(v);
		editorCtx?.setHasConflict(v);
	}, [editorCtx]);

	// Push static state to context
	useEffect(() => {
		editorCtx?.setEditorType('plaintext');
		editorCtx?.setIsReadOnly(isReadOnly);
		editorCtx?.setLanguage(null);
		return () => editorCtx?.resetState();
	}, [isReadOnly, editorCtx]);

	useEffect(() => {
		editorCtx?.setIsLargeFile(isLargeFile);
	}, [isLargeFile, editorCtx]);

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
		const normalizeFilePath = (path: string) => toDesktopRelative(path);
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

			{/* Content with line numbers */}
			<div className="flex-1 overflow-auto" style={{ display: 'grid', gridTemplateColumns: '40px 1fr' }}>
				{/* Line numbers gutter */}
				<div
					className="select-none text-right pr-2 pt-3 pb-3 font-mono"
					style={{
						background: 'var(--surface-base)',
						color: 'var(--text-muted)',
						fontSize: '13px',
						lineHeight: '20px',
						borderRight: '1px solid var(--border-subtle)',
					}}
				>
					{lines.map((_, i) => (
						<div key={i}>{i + 1}</div>
					))}
				</div>
				{/* Editor */}
				<textarea
					value={content}
					onChange={(e) => canEdit && handleContentChange(e.target.value)}
					readOnly={!canEdit}
					className="w-full h-full py-3 px-3 resize-none focus:outline-none"
					style={{
						background: 'var(--surface-raised)',
						color: 'var(--text-primary)',
						whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
						cursor: canEdit ? 'text' : 'default',
						fontSize: '13px',
						lineHeight: '20px',
						fontFamily: 'JetBrains Mono, SF Mono, ui-monospace, Menlo, Consolas, monospace',
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
