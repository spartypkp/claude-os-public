/**
 * Drag & Drop Hook
 *
 * Handles file drag and drop for the Claude Panel.
 * External files get uploaded to .engine/data/uploads/ (hidden, not on Desktop).
 * Internal paths get attached directly.
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { finderUploadTemp } from '@/lib/api';
import { isDesktopPath } from '@/lib/pathUtils';

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

	// Detect if drag contains files (macOS files, internal paths, or multi-file drags)
	const isPanelFileDrag = useCallback((e: React.DragEvent<HTMLElement>): boolean => {
		if (e.dataTransfer.types.includes('Files')) return true;
		if (e.dataTransfer.types.includes('application/claude-files')) return true;
		if (e.dataTransfer.types.includes('application/claude-file')) return true;
		if (!e.dataTransfer.types.includes('text/plain')) return false;
		const textData = e.dataTransfer.getData('text/plain');
		return textData.startsWith('Desktop/') || textData.startsWith('Inbox/') || isDesktopPath(textData);
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

	const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		e.stopPropagation();
		dragDepthRef.current = 0;
		setIsDragOver(false);

		// Handle external macOS files (only if no claude-file marker, which means it's a real OS file)
		const droppedFiles = Array.from(e.dataTransfer.files || []);
		if (droppedFiles.length > 0 && !e.dataTransfer.types.includes('application/claude-file')) {
			try {
				for (const file of droppedFiles) {
					const uploaded = await finderUploadTemp(file);
					await onAttach(uploaded.path, true);
				}
			} catch (err) {
				onError(err instanceof Error ? err.message : 'Failed to attach files');
			}
			return;
		}

		// Normalize internal paths — ensure Desktop/ prefix for attachment storage
		const normalizePath = (p: string) => {
			if (p.startsWith('Desktop/') || p.startsWith('Inbox/')) return p;
			// Absolute Desktop paths — keep as-is (backend handles both formats)
			if (isDesktopPath(p) && p.startsWith('/')) return p;
			return `Desktop/${p}`;
		};

		// Handle multi-file internal drags (from Desktop icon multi-select)
		const multiPaths = e.dataTransfer.getData('application/claude-files');
		if (multiPaths) {
			try {
				const paths: string[] = JSON.parse(multiPaths);
				for (const path of paths) {
					await onAttach(normalizePath(path));
				}
				if (paths.length > 1) {
					toast.success(`Attached ${paths.length} files`);
				}
			} catch {
				// Fall through to single-path handling
			}
			return;
		}

		// Handle single internal file path (from Finder windows or Desktop icons)
		const internalPath = e.dataTransfer.getData('application/claude-file') || e.dataTransfer.getData('text/plain');
		if (internalPath) {
			onAttach(normalizePath(internalPath));
		}
	}, [onAttach, onError]);

	// Handle file picker input (paperclip button)
	const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length === 0) return;

		try {
			for (const file of files) {
				const uploaded = await finderUploadTemp(file);
				await onAttach(uploaded.path, true);
			}
		} catch (err) {
			onError(err instanceof Error ? err.message : 'Failed to attach files');
		} finally {
			e.target.value = '';
		}
	}, [onAttach, onError]);

	return {
		isDragOver,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handleFilePick,
	};
}
