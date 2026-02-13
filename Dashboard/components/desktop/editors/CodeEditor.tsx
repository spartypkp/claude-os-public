'use client';

import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useFileEvents } from '@/hooks/useFileEvents';
import { useTheme } from '@/hooks/useTheme';
import { fetchFileContent, updateFileContent } from '@/lib/api';
import { isLargeContent } from '@/lib/editorLimits';
import { isProtectedFile as isProtectedFileName } from '@/lib/systemFiles';
import { AlertCircle, AlertTriangle, Check, Copy, Edit3, Eye, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getLanguage } from './index';


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
	const [isEditing, setIsEditing] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasConflict, setHasConflict] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const { resolvedTheme } = useTheme();
	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoRef = useRef<typeof Monaco | null>(null);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;

	// Track state in refs for SSE callback (avoid stale closures)
	const hasChangesRef = useRef(hasChanges);
	const isSavingRef = useRef(isSaving);
	hasChangesRef.current = hasChanges;
	isSavingRef.current = isSaving;

	const language = getLanguage(filePath);
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

	const handleBeforeMount: BeforeMount = useCallback((monaco) => {
		monaco.editor.defineTheme('claude-light', {
			base: 'vs',
			inherit: true,
			colors: {
				'editor.background': '#FFFFFF',
				'editor.foreground': '#1A1A18',
				'editorLineNumber.foreground': '#C3B9AB',
				'editorLineNumber.activeForeground': '#8E8173',
				'editor.selectionBackground': '#EBC7B8',
				'editor.inactiveSelectionBackground': '#F1DED6',
				'editor.lineHighlightBackground': '#F7F1EE',
				'editorCursor.foreground': '#C15F3C',
				'editorIndentGuide.background': '#E6DFD7',
				'editorIndentGuide.activeBackground': '#D8CFC5',
				'editorBracketMatch.background': '#EBD9D1',
				'editorBracketMatch.border': '#C15F3C',
				'editorGutter.background': '#F4F3EE',
			},
			rules: [
				{ token: 'comment', foreground: '9C8E84', fontStyle: 'italic' },
				{ token: 'keyword', foreground: 'C15F3C' },
				{ token: 'string', foreground: '2D6A4F' },
				{ token: 'number', foreground: '4C78A8' },
				{ token: 'type', foreground: '7A5EA8' },
				{ token: 'identifier', foreground: '1A1A18' },
			],
		});

		monaco.editor.defineTheme('claude-dark', {
			base: 'vs-dark',
			inherit: true,
			colors: {
				'editor.background': '#151517',
				'editor.foreground': '#FAFAFA',
				'editorLineNumber.foreground': '#5C5C66',
				'editorLineNumber.activeForeground': '#B7B7C0',
				'editor.selectionBackground': '#3A2B25',
				'editor.inactiveSelectionBackground': '#2A2624',
				'editor.lineHighlightBackground': '#1D1D22',
				'editorCursor.foreground': '#DA7756',
				'editorIndentGuide.background': '#2A2A30',
				'editorIndentGuide.activeBackground': '#3A3A44',
				'editorBracketMatch.background': '#3A2B25',
				'editorBracketMatch.border': '#DA7756',
				'editorGutter.background': '#09090B',
			},
			rules: [
				{ token: 'comment', foreground: '8C8C97', fontStyle: 'italic' },
				{ token: 'keyword', foreground: 'F08E6B' },
				{ token: 'string', foreground: '63D19A' },
				{ token: 'number', foreground: '86B3F2' },
				{ token: 'type', foreground: 'C29CEB' },
				{ token: 'identifier', foreground: 'FAFAFA' },
			],
		});
	}, []);

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

			{/* Toolbar */}
			<div
				className="flex items-center justify-between px-3 py-1.5"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
				<div className="flex items-center gap-3">
					{/* View/Edit Toggle */}
					<div className="flex items-center gap-1">
						<button
							onClick={() => setIsEditing(false)}
							className="p-1.5 rounded transition-colors"
							style={{
								color: !isEditing ? '#DA7756' : 'var(--text-tertiary)',
								background: !isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
							}}
							title="View"
						>
							<Eye className="w-4 h-4" />
						</button>
						{canEdit && (
							<button
								onClick={() => setIsEditing(true)}
								className="p-1.5 rounded transition-colors"
								style={{
									color: isEditing ? '#DA7756' : 'var(--text-tertiary)',
									background: isEditing ? 'rgba(218, 119, 86, 0.1)' : 'transparent',
								}}
								title="Edit"
							>
								<Edit3 className="w-4 h-4" />
							</button>
						)}
					</div>

					{/* Language badge */}
					<span
						className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded"
						style={{ background: 'var(--surface-accent)', color: 'var(--text-tertiary)' }}
					>
						{language}
					</span>
					<span
						className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded"
						style={{ background: 'var(--color-primary-dim)', color: 'var(--color-primary)' }}
					>
						Claude VS Code
					</span>
				</div>

				<div className="flex items-center gap-3">
					{/* Copy button */}
					<button
						onClick={handleCopy}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-muted)]"
						style={{ color: 'var(--text-tertiary)' }}
						title="Copy to clipboard"
					>
						{copied ? (
							<Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
						) : (
							<Copy className="w-4 h-4" />
						)}
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
									<span style={{ color: 'var(--color-warning)' }}>Unsaved</span>
								)}
								{!isSaving && !hasConflict && !hasChanges && isEditing && (
									<span style={{ color: 'var(--color-success)' }}>Saved</span>
								)}
							</>
						)}
					</div>
				</div>
			</div>

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
