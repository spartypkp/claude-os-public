'use client';

/**
 * Input Area
 *
 * Unified chat input container: rounded box with attachment chips at top,
 * seamless textarea below, action button inside. @ mention file picker.
 */

import { useWindowStore } from '@/store/windowStore';
import { getFileIconSpec } from '@/lib/fileTypes';
import { X, Paperclip } from 'lucide-react';
import { ChangeEvent, RefObject, useRef } from 'react';
import { ChatInput, ChatInputHandle } from './ChatInput';
import { FileMentionMenu } from './FileMentionMenu';
import { useFileMention } from './hooks/useFileMention';
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
	onSend: (message: string) => Promise<boolean>;
	onInterrupt: () => Promise<void>;
	onRemoveAttachment: (path: string) => void;
	onTogglePreview: (path: string) => Promise<void>;
	onFilePick: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
	onAddAttachment: (path: string) => Promise<void>;
	hasPendingQuestion?: boolean;
	isProcessing?: boolean;
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
	onFilePick,
	onAddAttachment,
	hasPendingQuestion,
	isProcessing,
}: InputAreaProps) {
	const { openWindow, openContextMenu } = useWindowStore();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	// File mention hook — uses a ref that we'll connect after ChatInput mounts
	const mention = useFileMention({
		textareaRef,
		onSelect: (path) => onAddAttachment(path),
	});

	// Sync the textarea ref from ChatInput
	const handleChatInputRef = (handle: ChatInputHandle | null) => {
		// Forward to parent ref
		if (typeof chatInputRef === 'function') {
			(chatInputRef as (instance: ChatInputHandle | null) => void)(handle);
		} else if (chatInputRef) {
			(chatInputRef as React.MutableRefObject<ChatInputHandle | null>).current = handle;
		}
		// Capture textarea element for mention positioning
		textareaRef.current = handle?.getTextarea() ?? null;
	};

	// Handle attachment context menu
	const handleAttachmentContextMenu = (file: AttachmentItem, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, 'panel-attachment', undefined, {
			attachmentPath: file.path,
			attachmentName: file.name,
		});
	};

	// Open file in desktop window
	const handleOpenFile = (file: AttachmentItem) => {
		const name = file.path.split('/').pop() || file.name;
		openWindow(file.path, name);
	};

	return (
		<div className="p-2.5 bg-[var(--surface-claude-raised)]">
			{/* File mention dropdown */}
			{mention.isOpen && <FileMentionMenu {...mention.menuProps} />}

			{/* Unified input container */}
			<div className="rounded-xl bg-[var(--surface-base)] border border-[var(--border-default)] overflow-hidden focus-within:border-[var(--color-claude)]/40 transition-colors">
				{/* Attachment chips inside the container */}
				{attachedFiles.length > 0 && (
					<div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
						{attachedFiles.map((file) => {
							const ext = file.name.split('.').pop()?.toLowerCase() || '';
							const iconSpec = getFileIconSpec(file.name, {});
							const FileIcon = iconSpec.icon;

							return (
								<div
									key={file.path}
									onContextMenu={(e) => handleAttachmentContextMenu(file, e)}
									onClick={() => handleOpenFile(file)}
									className={`
										group/chip flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg
										bg-[var(--surface-sunken)] border border-[var(--border-subtle)]
										hover:border-[var(--color-claude)]/40
										transition-colors cursor-pointer
										${file.error ? 'border-red-400/50' : ''}
									`}
								>
									<FileIcon className={`w-3.5 h-3.5 flex-shrink-0 ${iconSpec.colorClass}`} />
									<span className="text-[11px] font-medium text-[var(--text-primary)] max-w-[140px] truncate">
										{file.name.replace(/\.[^.]+$/, '')}
									</span>
									<span className="text-[10px] text-[var(--text-muted)] uppercase">
										{ext}
									</span>
									{file.size !== null && (
										<span className="text-[10px] text-[var(--text-muted)]">
											{formatBytes(file.size)}
										</span>
									)}
									<button
										onClick={(e) => {
											e.stopPropagation();
											onRemoveAttachment(file.path);
										}}
										className="ml-0.5 p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors opacity-0 group-hover/chip:opacity-100"
										title="Remove"
									>
										<X className="w-3 h-3 text-[var(--text-muted)]" />
									</button>
								</div>
							);
						})}
					</div>
				)}

				{/* Chat input — seamless inside container */}
				<ChatInput
					ref={handleChatInputRef}
					sessionId={sessionId}
					placeholder={hasPendingQuestion ? 'Respond above to continue' : `Message ${roleName}...`}
					onSend={onSend}
					onInterrupt={onInterrupt}
					disabled={hasPendingQuestion}
					isProcessing={isProcessing}
					onMentionChange={mention.handleChange}
					onMentionKeyDown={mention.handleKeyDown}
				/>
			</div>

			{/* Footer — attach button left, keyboard hints right */}
			<div className="mt-1.5 flex items-center justify-between px-1 text-[9px] text-[var(--text-muted)]">
				<button
					onClick={() => fileInputRef.current?.click()}
					className="flex items-center gap-1 hover:text-[var(--text-secondary)] transition-colors"
				>
					<Paperclip className="w-2.5 h-2.5" />
					<span>Attach</span>
					{attachedFiles.length > 0 && (
						<span className="text-[var(--color-claude)]">({attachedFiles.length})</span>
					)}
				</button>
				<div className="flex items-center gap-1.5">
					{hasPendingQuestion
						? <span>Respond above to continue</span>
						: <>
							<span className="opacity-60">@</span>
							<span>to attach</span>
							<span className="opacity-40">·</span>
							<span>Enter to send</span>
							<span className="opacity-40">·</span>
							<span>Shift+Enter newline</span>
						</>
					}
				</div>
			</div>

			{/* Hidden file input for attach button */}
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={onFilePick}
			/>
		</div>
	);
}
