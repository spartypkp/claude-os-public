/**
 * Panel Resize Hook
 * 
 * Handles panel width resizing with mouse drag and localStorage persistence.
 */

import { useCallback, useEffect, useState } from 'react';
import {
	DEFAULT_PANEL_WIDTH,
	MAX_PANEL_WIDTH,
	MIN_PANEL_WIDTH,
	PANEL_WIDTH_KEY,
} from '../constants';

interface UsePanelResizeReturn {
	panelWidth: number;
	isResizing: boolean;
	startResize: () => void;
}

export function usePanelResize(): UsePanelResizeReturn {
	const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
	const [isResizing, setIsResizing] = useState(false);

	// Initialize from localStorage after hydration
	useEffect(() => {
		const storedWidth = localStorage.getItem(PANEL_WIDTH_KEY);
		if (storedWidth) {
			const parsed = parseInt(storedWidth, 10);
			if (!isNaN(parsed) && parsed >= MIN_PANEL_WIDTH && parsed <= MAX_PANEL_WIDTH) {
				setPanelWidth(parsed);
			}
		}
	}, []);

	// Handle resize with mouse drag
	useEffect(() => {
		if (!isResizing) return;

		let finalWidth = panelWidth;

		const handleMouseMove = (e: MouseEvent) => {
			const viewportWidth = window.innerWidth;
			const newWidth = viewportWidth - e.clientX;
			const clampedWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, newWidth));
			finalWidth = clampedWidth;
			setPanelWidth(clampedWidth);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			// Persist width to localStorage on resize end
			localStorage.setItem(PANEL_WIDTH_KEY, String(finalWidth));
		};

		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		};
	}, [isResizing, panelWidth]);

	const startResize = useCallback(() => {
		setIsResizing(true);
	}, []);

	return {
		panelWidth,
		isResizing,
		startResize,
	};
}

