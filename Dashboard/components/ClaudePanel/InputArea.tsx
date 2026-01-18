'use client';

/**
 * Input Area
 * 
 * Chat input with file attachment pills and previews.
 */

import { useWindowStore } from '@/store/windowStore';
import { FileText, X } from 'lucide-react';
import { RefObject } from 'react';
import { ChatInput, ChatInputHandle } from './ChatInput';
import type { AttachmentItem } from './hooks/useAttachments';

// =============================================================================
// TYPES
// =============================================================================

interface InputAreaProps {
	sessionId: string;
	roleName: string;
	attachedFiles: AttachmentItem[];
	chatInputRef: RefObject<ChatInputHandle | null>;
	formatBytes: (bytes: number | null) => string;
	onSend: (message: string) => Promise<void>;
	onInterrupt: () => Promise<void>;
	onRemoveAttachment: (path: string) => void;
	onTogglePreview: (path: string) => Promise<void>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InputArea({
	sessionId,
	roleName,
	attachedFiles,
	chatInputRef,
	formatBytes,
	onSend,
	onInterrupt,
	onRemoveAttachment,
	onTogglePreview,
}: InputAreaProps) {
	const { openContextMenu } = useWindowStore();

	// Handle attachment context menu
	const handleAttachmentContextMenu = (file: AttachmentItem, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, 'panel-attachment', undefined, {
			attachmentPath: file.path,
			attachmentName: file.name,
		});
	};

	return (
		<div className="border-t border-gray-200 dark:border-[#3a3a3a] p-2.5 bg-gray-50 dark:bg-[#2d2d2d]">
			{/* Attached files pills */}
			{attachedFiles.length > 0 && (
				<div className="flex flex-col gap-1.5 mb-2">
					{attachedFiles.map((file) => (
						<div key={file.path} className="flex flex-col gap-1">
							<div
								onContextMenu={(e) => handleAttachmentContextMenu(file, e)}
								className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-[#ddd] text-[10px] font-medium cursor-default"
							>
								<FileText className="w-3 h-3" />
								<span className="max-w-[160px] truncate">{file.name}</span>
								<span className="text-[9px] text-gray-500 dark:text-[#999]">
									{formatBytes(file.size)}
								</span>
								{file.imported && (
									<span className="px-1 py-0.5 rounded-full text-[9px] font-medium bg-amber-200 text-amber-700 dark:bg-amber-500/30 dark:text-amber-200">
										Imported
									</span>
								)}
								<button
									onClick={() => onRemoveAttachment(file.path)}
									className="ml-0.5 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#444] transition-colors"
									title="Remove attachment"
								>
									<X className="w-2.5 h-2.5" />
								</button>
							</div>
							<div className="flex flex-wrap gap-1.5 pl-1">
								<button
									onClick={() => onTogglePreview(file.path)}
									className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-white text-gray-700 border border-gray-200 dark:border-[#444] dark:bg-[#1f1f1f] dark:text-[#ddd] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
									title="Preview file contents"
								>
									{file.previewOpen ? 'Hide preview' : 'Preview'}
								</button>
							</div>
							{file.error && (
								<div className="pl-2 text-[9px] text-red-600 dark:text-red-300">
									{file.error}
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{/* File previews */}
			{attachedFiles.some(file => file.previewOpen) && (
				<div className="mb-2 space-y-2">
					{attachedFiles.filter(file => file.previewOpen).map((file) => (
						<div
							key={`${file.path}-preview`}
							className="rounded-lg border border-gray-200 dark:border-[#444] bg-white dark:bg-[#1f1f1f] px-2 py-1.5 text-[10px] text-gray-700 dark:text-[#ccc]"
						>
							<div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-[#777]">
								Preview: {file.name}
							</div>
							<pre className="mt-1 whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
								{file.previewContent || 'Loading preview...'}
							</pre>
						</div>
					))}
				</div>
			)}

			{/* Chat input */}
			<ChatInput
				ref={chatInputRef}
				sessionId={sessionId}
				placeholder={`Message ${roleName}...`}
				onSend={onSend}
				onInterrupt={onInterrupt}
			/>

			{/* Help text */}
			<div className="mt-1 text-[9px] text-gray-400 dark:text-[#777]">
				Enter to send · Esc to stop · Shift+Enter for newline
				{attachedFiles.length > 0 && ` · ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''} attached`}
			</div>
		</div>
	);
}

