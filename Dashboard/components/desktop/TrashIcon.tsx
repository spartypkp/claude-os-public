'use client';

import { listTrash, moveToTrash } from '@/lib/api';
import { useFileEvents } from '@/hooks/useFileEvents';
import { useWindowStore } from '@/store/windowStore';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface TrashIconProps {
	onContextMenu?: (e: React.MouseEvent) => void;
}

export function TrashIcon({ onContextMenu }: TrashIconProps) {
	const [trashCount, setTrashCount] = useState(0);
	const [isDragOver, setIsDragOver] = useState(false);
	const { openAppWindow } = useWindowStore();

	// Load trash count
	const loadTrashCount = useCallback(async () => {
		try {
			const result = await listTrash();
			setTrashCount(result.count);
		} catch (err) {
			console.error('Failed to load trash count:', err);
		}
	}, []);

	// Initial load
	useEffect(() => {
		loadTrashCount();
	}, [loadTrashCount]);

	// Use SSE file events for trash count refresh
	useFileEvents({
		onDeleted: loadTrashCount,
	});

	// Listen for custom trash updates (e.g., empty trash action)
	useEffect(() => {
		const handleTrashUpdate = () => {
			loadTrashCount();
		};
		window.addEventListener('trash-updated', handleTrashUpdate);
		return () => window.removeEventListener('trash-updated', handleTrashUpdate);
	}, [loadTrashCount]);

	const handleDoubleClick = useCallback(() => {
		openAppWindow('finder');
	}, [openAppWindow]);

	// Native HTML5 drag/drop handlers
	const handleDragOver = useCallback((e: React.DragEvent) => {
		if (
			e.dataTransfer.types.includes('application/claude-file') ||
			e.dataTransfer.types.includes('application/claude-files') ||
			e.dataTransfer.types.includes('text/plain')
		) {
			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = 'move';
			setIsDragOver(true);
		}
	}, []);

	const handleDragLeave = useCallback(() => {
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		// Multi-file trash
		const multiPaths = e.dataTransfer.getData('application/claude-files');
		if (multiPaths) {
			try {
				const paths: string[] = JSON.parse(multiPaths);
				for (const p of paths) {
					await moveToTrash(p);
				}
				window.dispatchEvent(new CustomEvent('trash-updated'));
				toast.success(paths.length === 1 ? 'Moved to Trash' : `Moved ${paths.length} items to Trash`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
			}
			return;
		}

		// Single file trash
		const sourcePath = e.dataTransfer.getData('application/claude-file') || e.dataTransfer.getData('text/plain');
		if (sourcePath) {
			try {
				await moveToTrash(sourcePath);
				window.dispatchEvent(new CustomEvent('trash-updated'));
				toast.success('Moved to Trash');
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to move to trash');
			}
		}
	}, []);

	const isEmpty = trashCount === 0;

	return (
		<div
			className={`
				absolute bottom-4 right-4 z-50
				flex flex-col items-center justify-center
				w-[80px] h-[90px] p-2 rounded-lg cursor-pointer
				transition-all duration-200
				${isDragOver
					? 'bg-red-500/30 ring-2 ring-red-500 scale-110'
					: 'hover:bg-gray-200/30 dark:hover:bg-white/5'
				}
			`}
			onDoubleClick={handleDoubleClick}
			onContextMenu={onContextMenu}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{/* Trash Icon */}
			<div className={`
				w-14 h-14 flex items-center justify-center
				transition-all duration-200
				${isDragOver ? 'scale-110' : ''}
			`}>
				<Trash2
					className={`
						w-12 h-12 drop-shadow-lg
						transition-colors duration-200
						${isDragOver
							? 'text-red-500'
							: isEmpty
								? 'text-gray-400 dark:text-gray-500'
								: 'text-gray-600 dark:text-gray-300'
						}
					`}
					fill={isEmpty ? 'none' : 'currentColor'}
					fillOpacity={isEmpty ? 0 : 0.15}
				/>
			</div>

			{/* Label */}
			<span
				className={`mt-1.5 text-[11px] text-center leading-tight font-medium ${isDragOver ? 'text-red-400' : 'text-black'}`}
			>
				Trash{trashCount > 0 ? ` (${trashCount})` : ''}
			</span>
		</div>
	);
}

export default TrashIcon;
