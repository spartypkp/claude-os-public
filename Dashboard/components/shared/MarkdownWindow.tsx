'use client';

import { fetchFileContent, updateFileContent } from '@/lib/api';
import { useConflictActions } from '@/store/desktopStore';
import { AlertCircle, Edit3, Eye, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface MarkdownWindowProps {
	filePath: string;
}

/**
 * Window content for markdown files.
 * Supports viewing and editing with auto-save.
 */
export function MarkdownWindow({ filePath }: MarkdownWindowProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState('');
	const [mtime, setMtime] = useState<string>('');
	const [isEditing, setIsEditing] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Store integration for conflict handling
	const { handleExternalChange } = useConflictActions();

	// Load file content
	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const data = await fetchFileContent(filePath);
				setContent(data.content);
				setMtime(data.mtime || '');
			} catch (err) {
				setError(`Failed to load file: ${err}`);
			} finally {
				setLoading(false);
			}
		};
		load();
	}, [filePath]);

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
						if (result.mtime) {
							setMtime(result.mtime);
						}
					} else if (result.error === 'conflict') {
						// File changed externally
						handleExternalChange(filePath, result.mtime || '');
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
		[filePath, mtime, handleExternalChange]
	);

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
			<div className="flex items-center justify-center h-full">
				<Loader2 className="w-6 h-6 animate-spin text-[#808080]" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 p-4">
				<AlertCircle className="w-8 h-8 text-red-400" />
				<p className="text-sm text-red-400 text-center">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Toolbar */}
			<div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3a3a3a] bg-[#252525]">
				<div className="flex items-center gap-2">
					{/* View/Edit Toggle */}
					<button
						onClick={() => setIsEditing(false)}
						className={`
              p-1 rounded transition-colors
              ${!isEditing
								? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
								: 'text-[#808080] hover:text-white hover:bg-white/5'
							}
            `}
						title="View"
					>
						<Eye className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => setIsEditing(true)}
						className={`
              p-1 rounded transition-colors
              ${isEditing
								? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
								: 'text-[#808080] hover:text-white hover:bg-white/5'
							}
            `}
						title="Edit"
					>
						<Edit3 className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* Save status */}
				<div className="flex items-center gap-2 text-[10px] text-[#808080]">
					{isSaving && (
						<>
							<Loader2 className="w-3 h-3 animate-spin" />
							<span>Saving...</span>
						</>
					)}
					{!isSaving && hasChanges && <span>Unsaved</span>}
					{!isSaving && !hasChanges && <span>Saved</span>}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto">
				{isEditing ? (
					<textarea
						value={content}
						onChange={(e) => handleContentChange(e.target.value)}
						className="
              w-full h-full p-4 font-mono text-sm
              bg-transparent text-[#d4d4d4]
              resize-none focus:outline-none
              leading-relaxed
            "
						spellCheck={false}
					/>
				) : (
					<div className="p-4 prose prose-sm prose-invert max-w-none">
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{stripFrontmatter(content)}
						</ReactMarkdown>
					</div>
				)}
			</div>
		</div>
	);
}

export default MarkdownWindow;
