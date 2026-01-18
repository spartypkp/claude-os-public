/**
 * Attachments Hook
 * 
 * Manages file attachments for the chat input.
 * Handles add, remove, preview, and upload to Inbox.
 */

import { finderCreateFolder, finderInfo, finderRead, finderUpload } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { INBOX_PATH, MAX_PREVIEW_BYTES, MAX_PREVIEW_CHARS } from '../constants';

// =============================================================================
// TYPES
// =============================================================================

export interface AttachmentItem {
	path: string;
	name: string;
	size: number | null;
	previewOpen: boolean;
	previewContent?: string | null;
	imported?: boolean;
	error?: string | null;
}

interface UseAttachmentsOptions {
	sessionId: string | null;
}

interface UseAttachmentsReturn {
	attachedFiles: AttachmentItem[];
	addAttachment: (path: string, imported?: boolean) => Promise<void>;
	removeAttachment: (path: string) => void;
	togglePreview: (path: string) => Promise<void>;
	clearAttachments: () => void;
	uploadAndAttach: (file: File) => Promise<void>;
	formatBytes: (bytes: number | null) => string;
}

// =============================================================================
// HELPERS
// =============================================================================

function normalizePath(path: string): string {
	return path.startsWith('Desktop/') ? path.slice(8) : path;
}

function ensureDesktopPath(path: string): string {
	if (path.startsWith('Desktop/')) return path;
	return `Desktop/${path.replace(/^\/+/, '')}`;
}

// =============================================================================
// HOOK
// =============================================================================

export function useAttachments({ sessionId }: UseAttachmentsOptions): UseAttachmentsReturn {
	const [attachedFiles, setAttachedFiles] = useState<AttachmentItem[]>([]);

	// Clear attachments when session changes
	useEffect(() => {
		if (!sessionId) {
			setAttachedFiles([]);
		}
	}, [sessionId]);

	// Listen for "attach-to-chat" events from context menu
	useEffect(() => {
		const handleAttachToChat = (e: Event) => {
			const customEvent = e as CustomEvent<{ path: string; }>;
			const { path } = customEvent.detail;
			if (path) {
				addAttachment(path);
			}
		};

		window.addEventListener('attach-to-chat', handleAttachToChat);
		return () => window.removeEventListener('attach-to-chat', handleAttachToChat);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Listen for "remove-attachment" events from context menu
	useEffect(() => {
		const handleRemove = (e: Event) => {
			const customEvent = e as CustomEvent<{ path: string; }>;
			removeAttachment(customEvent.detail.path);
		};

		window.addEventListener('remove-attachment', handleRemove);
		return () => window.removeEventListener('remove-attachment', handleRemove);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const formatBytes = useCallback((bytes: number | null): string => {
		if (bytes === null) return 'size unknown';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}, []);

	const addAttachment = useCallback(async (path: string, imported?: boolean) => {
		const normalizedPath = ensureDesktopPath(path);

		setAttachedFiles(prev => {
			if (prev.some(item => item.path === normalizedPath)) return prev;
			const name = normalizedPath.split('/').pop() || normalizedPath;
			return [...prev, {
				path: normalizedPath,
				name,
				size: null,
				previewOpen: false,
				previewContent: null,
				imported,
				error: null,
			}];
		});

		// Fetch file info in background
		try {
			const info = await finderInfo(normalizePath(normalizedPath));
			setAttachedFiles(prev => prev.map(item => (
				item.path === normalizedPath ? { ...item, size: info.size ?? null } : item
			)));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to read file info';
			setAttachedFiles(prev => prev.map(item => (
				item.path === normalizedPath ? { ...item, error: message } : item
			)));
		}
	}, []);

	const removeAttachment = useCallback((path: string) => {
		setAttachedFiles(prev => prev.filter(item => item.path !== path));
	}, []);

	const togglePreview = useCallback(async (path: string) => {
		const attachment = attachedFiles.find(item => item.path === path);
		if (!attachment) return;

		// Toggle off
		if (attachment.previewOpen) {
			setAttachedFiles(prev => prev.map(item => (
				item.path === path ? { ...item, previewOpen: false } : item
			)));
			return;
		}

		// Check size limit
		if (attachment.size !== null && attachment.size > MAX_PREVIEW_BYTES) {
			setAttachedFiles(prev => prev.map(item => (
				item.path === path ? { ...item, error: 'Preview disabled for large files' } : item
			)));
			return;
		}

		// Load preview
		try {
			const fileData = await finderRead(normalizePath(path));
			const preview = fileData.content.slice(0, MAX_PREVIEW_CHARS);
			setAttachedFiles(prev => prev.map(item => (
				item.path === path
					? { ...item, previewOpen: true, previewContent: preview, error: null }
					: item
			)));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load preview';
			setAttachedFiles(prev => prev.map(item => (
				item.path === path ? { ...item, error: message } : item
			)));
		}
	}, [attachedFiles]);

	const clearAttachments = useCallback(() => {
		setAttachedFiles([]);
	}, []);

	// Ensure Inbox folder exists
	const ensureInboxFolder = useCallback(async () => {
		try {
			await finderCreateFolder(INBOX_PATH);
		} catch (err) {
			const message = err instanceof Error ? err.message : '';
			if (!message.toLowerCase().includes('exists')) {
				throw err;
			}
		}
	}, []);

	// Upload with auto-rename on conflict
	const uploadWithRename = useCallback(async (file: File): Promise<{ path: string; } | undefined> => {
		let attempt = 0;
		let currentName = file.name;

		while (attempt < 10) {
			const uploadFile = attempt === 0 ? file : new File([file], currentName, { type: file.type });
			try {
				return await finderUpload(uploadFile, INBOX_PATH);
			} catch (err) {
				const message = err instanceof Error ? err.message : '';
				if (!message.toLowerCase().includes('exists')) {
					throw err;
				}
				attempt += 1;
				const dotIndex = file.name.lastIndexOf('.');
				const base = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
				const ext = dotIndex > 0 ? file.name.slice(dotIndex) : '';
				currentName = `${base} (${attempt})${ext}`;
			}
		}

		throw new Error('Failed to upload after multiple attempts');
	}, []);

	const uploadAndAttach = useCallback(async (file: File) => {
		await ensureInboxFolder();
		const uploaded = await uploadWithRename(file);
		const uploadPath = uploaded?.path || `${INBOX_PATH}/${file.name}`;
		await addAttachment(uploadPath, true);
		toast.success('Imported file to Desktop/Inbox');
	}, [ensureInboxFolder, uploadWithRename, addAttachment]);

	return {
		attachedFiles,
		addAttachment,
		removeAttachment,
		togglePreview,
		clearAttachments,
		uploadAndAttach,
		formatBytes,
	};
}

