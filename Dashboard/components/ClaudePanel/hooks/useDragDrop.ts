/**
 * Drag & Drop Hook
 * 
 * Handles file drag and drop for the Claude Panel.
 * External files get uploaded to Inbox, internal paths get attached directly.
 */

import { finderCreateFolder, finderUpload } from '@/lib/api';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { INBOX_PATH } from '../constants';

// =============================================================================
// TYPES
// =============================================================================

interface UseDragDropOptions {
	onAttach: (path: string, imported?: boolean) => Promise<void>;
	onError: (message: string) => void;
}

interface UseDragDropReturn {
	isDragOver: boolean;
	handleDragEnter: (e: React.DragEvent<HTMLElement>) => void;
	handleDragOver: (e: React.DragEvent<HTMLElement>) => void;
	handleDragLeave: () => void;
	handleDrop: (e: React.DragEvent<HTMLElement>) => Promise<void>;
	handleFilePick: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

// =============================================================================
// HOOK
// =============================================================================

export function useDragDrop({ onAttach, onError }: UseDragDropOptions): UseDragDropReturn {
	const [isDragOver, setIsDragOver] = useState(false);
	const dragDepthRef = useRef(0);

	// Detect if drag contains files
	const isPanelFileDrag = useCallback((e: React.DragEvent<HTMLElement>): boolean => {
		if (e.dataTransfer.types.includes('Files')) return true;
		if (!e.dataTransfer.types.includes('text/plain')) return false;
		const textData = e.dataTransfer.getData('text/plain');
		return textData.startsWith('Desktop/') || textData.startsWith('Inbox/');
	}, []);

	const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
		if (isPanelFileDrag(e)) {
			dragDepthRef.current += 1;
			setIsDragOver(true);
		}
	}, [isPanelFileDrag]);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
		if (isPanelFileDrag(e)) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		}
	}, [isPanelFileDrag]);

	const handleDragLeave = useCallback(() => {
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) {
			setIsDragOver(false);
		}
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

	const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		e.stopPropagation();
		dragDepthRef.current = 0;
		setIsDragOver(false);

		// Handle external files
		const droppedFiles = Array.from(e.dataTransfer.files || []);
		if (droppedFiles.length > 0) {
			try {
				await ensureInboxFolder();
				let importedCount = 0;
				for (const file of droppedFiles) {
					const uploaded = await uploadWithRename(file);
					const uploadPath = uploaded?.path || `${INBOX_PATH}/${file.name}`;
					await onAttach(uploadPath, true);
					importedCount += 1;
				}
				if (importedCount > 0) {
					toast.success(
						importedCount === 1
							? 'Imported file to Desktop/Inbox'
							: `Imported ${importedCount} files to Desktop/Inbox`
					);
				}
			} catch (err) {
				onError(err instanceof Error ? err.message : 'Failed to upload files');
			}
			return;
		}

		// Handle internal file paths
		const internalPath = e.dataTransfer.getData('text/plain');
		if (internalPath && (internalPath.startsWith('Desktop/') || internalPath.startsWith('Inbox/'))) {
			onAttach(internalPath);
		}
	}, [ensureInboxFolder, uploadWithRename, onAttach, onError]);

	// Handle file picker input
	const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length === 0) return;

		try {
			await ensureInboxFolder();
			let importedCount = 0;
			for (const file of files) {
				const uploaded = await uploadWithRename(file);
				const uploadPath = uploaded?.path || `${INBOX_PATH}/${file.name}`;
				await onAttach(uploadPath, true);
				importedCount += 1;
			}
			if (importedCount > 0) {
				toast.success(
					importedCount === 1
						? 'Imported file to Desktop/Inbox'
						: `Imported ${importedCount} files to Desktop/Inbox`
				);
			}
		} catch (err) {
			onError(err instanceof Error ? err.message : 'Failed to import files');
		} finally {
			e.target.value = '';
		}
	}, [ensureInboxFolder, uploadWithRename, onAttach, onError]);

	return {
		isDragOver,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handleFilePick,
	};
}

