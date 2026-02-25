'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useFileEvents } from '@/hooks/useFileEvents';
import { useTheme } from '@/hooks/useTheme';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { toDesktopRelative } from '@/lib/pathUtils';
import { isProtectedFile as isProtectedFileName } from '@/lib/systemFiles';
import { AlertCircle, AlertTriangle, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getLanguage } from './index';
import { defineClaudeThemes } from './monacoThemes';
import { useEditorContext } from './EditorContext';


// Wrapper to check if a file path is protected (extracts filename)
function isProtectedFile(path: string): boolean {
	const fileName = path.split('/').pop() || '';
	return isProtectedFileName(fileName);
}

interface CodeEditorProps {
	filePath: string;
}

/**
 * Code editor with syntax highlighting, edit mode, and real-time sync.
 * Uses Monaco (VS Code) for a heavier, more polished editing experience.
 * Claude System Files are read-only.
 */
export function CodeEditor({ filePath }: CodeEditorProps) {
	const isReadOnly = isProtectedFile(filePath);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState('');
	const [mtime, setMtime] = useState<string>('');
	const [isEditingLocal, setIsEditingLocal] = useState(false);
	const [hasChangesLocal, setHasChangesLocal] = useState(false);
	const [isSavingLocal, setIsSavingLocal] = useState(false);
	const [hasConflictLocal, setHasConflictLocal] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const { resolvedTheme } = useTheme();
	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoRef = useRef<typeof Monaco | null>(null);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;
	const editorCtx = useEditorContext();

	// Sync to EditorContext for PathBar
	const isEditing = editorCtx?.isEditing ?? isEditingLocal;
	const setIsEditing = useCallback((v: boolean) => {
		setIsEditingLocal(v);
		editorCtx?.setIsEditing(v);
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

	// Track state in refs for SSE callback (avoid stale closures)
	const hasChangesRef = useRef(hasChanges);
	const isSavingRef = useRef(isSaving);
	hasChangesRef.current = hasChanges;
	isSavingRef.current = isSaving;

	const language = getLanguage(filePath);

	// Push static state to context
	useEffect(() => {
		editorCtx?.setEditorType('code');
		editorCtx?.setIsReadOnly(isReadOnly);
		editorCtx?.setLanguage(language);
		return () => editorCtx?.resetState();
	}, [isReadOnly, language, editorCtx]);

	useEffect(() => {
		editorCtx?.setIsLargeFile(isLargeFile);
	}, [isLargeFile, editorCtx]);
	const themeName = resolvedTheme === 'dark' ? 'claude-dark' : 'claude-light';

	const monacoLanguage = useMemo(() => {
		switch (language) {
			case 'typescript':
			case 'javascript':
			case 'python':
			case 'json':
			case 'markdown':
			case 'html':
			case 'css':
			case 'xml':
			case 'sql':
				return language;
			case 'yaml':
			case 'toml':
			case 'graphql':
			case 'gql':
				return 'plaintext';
			default:
				return 'plaintext';
		}
	}, [language]);

	const handleBeforeMount = useCallback(defineClaudeThemes, []);

	const handleEditorMount: OnMount = useCallback(
		(editor, monaco) => {
			editorRef.current = editor;
			monacoRef.current = monaco;
			monaco.editor.setTheme(themeName);
		},
		[themeName]
	);

	useEffect(() => {
		if (monacoRef.current) {
			monacoRef.current.editor.setTheme(themeName);
		}
	}, [themeName]);

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
			setIsEditing(false);
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

	// Copy to clipboard
	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error('Failed to copy');
		}
	}, [content]);

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

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				<Editor
					value={content}
					language={monacoLanguage}
					theme={themeName}
					beforeMount={handleBeforeMount}
					onMount={handleEditorMount}
					onChange={(value) => {
						if (typeof value === 'string') {
							handleContentChange(value);
						}
					}}
					options={{
						readOnly: !canEdit || !isEditing,
						minimap: { enabled: true },
						fontFamily: 'JetBrains Mono, SF Mono, ui-monospace, Menlo, Consolas, monospace',
						fontSize: 13,
						lineHeight: 20,
						smoothScrolling: true,
						cursorBlinking: 'smooth',
						renderWhitespace: 'selection',
						scrollBeyondLastLine: false,
						wordWrap: 'off',
						padding: { top: 14, bottom: 14 },
						bracketPairColorization: { enabled: true },
						guides: { indentation: true },
						overviewRulerBorder: false,
						lineNumbersMinChars: 4,
						automaticLayout: true,
						scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
					}}
				/>
			</div>

			{/* Footer */}
			<div
				className="flex items-center justify-between px-3 py-1 text-[10px]"
				style={{
					background: 'var(--surface-base)',
					borderTop: '1px solid var(--border-subtle)',
					color: 'var(--text-muted)',
				}}
			>
				<span>{content.split('\n').length} lines</span>
				<span>{content.length} characters</span>
			</div>
		</div>
	);
}

export default CodeEditor;
