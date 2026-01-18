'use client';

import { listTrash } from '@/lib/api';
import { useFileEvents } from '@/hooks/useFileEvents';
import { useWindowStore } from '@/store/windowStore';
import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface TrashIconProps {
	onContextMenu?: (e: React.MouseEvent) => void;
}

export function TrashIcon({ onContextMenu }: TrashIconProps) {
	const { isOver, setNodeRef } = useDroppable({
		id: 'trash-drop-zone',
	});

	const [trashCount, setTrashCount] = useState(0);
	const { darkMode, openAppWindow } = useWindowStore();

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

	// Jan 2026: Use SSE file events instead of polling
	// Refresh trash count when files are deleted (moved to trash)
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
		// Open Finder to Trash view (or a trash window)
		openAppWindow('finder');
	}, [openAppWindow]);

	const isEmpty = trashCount === 0;

	return (
		<div
			ref={setNodeRef}
			className={`
				absolute bottom-4 right-4 z-50
				flex flex-col items-center justify-center
				w-[80px] h-[90px] p-2 rounded-lg cursor-pointer
				transition-all duration-200
				${isOver
					? 'bg-red-500/30 ring-2 ring-red-500 scale-110'
					: 'hover:bg-gray-200/30 dark:hover:bg-white/5'
				}
			`}
			onDoubleClick={handleDoubleClick}
			onContextMenu={onContextMenu}
		>
			{/* Trash Icon */}
			<div className={`
				w-14 h-14 flex items-center justify-center
				transition-all duration-200
				${isOver ? 'scale-110' : ''}
			`}>
				<Trash2
					className={`
						w-12 h-12 drop-shadow-lg
						transition-colors duration-200
						${isOver
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
				className={`mt-1.5 text-[11px] text-center leading-tight font-medium ${isOver ? 'text-red-400' : 'text-black'}`}
			>
				Trash{trashCount > 0 ? ` (${trashCount})` : ''}
			</span>
		</div>
	);
}

export default TrashIcon;

