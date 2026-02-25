import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GridFlow = 'row' | 'column';
export type IconSize = 'small' | 'medium' | 'large';
export type SortOrder = 'category' | 'name' | 'kind';
export type GridAlignment = 'left' | 'right';

export interface IconSizeConfig {
	cellWidth: number;
	cellHeight: number;
	iconSize: string; // Tailwind class like 'w-14 h-14'
	iconContainer: string; // Tailwind class like 'w-16 h-16'
	fontSize: number;
	lineClamp: number;
	label: string;
}

export const ICON_SIZES: Record<IconSize, IconSizeConfig> = {
	small: {
		cellWidth: 80,
		cellHeight: 104,
		iconSize: 'w-10 h-10',
		iconContainer: 'w-12 h-12',
		fontSize: 10,
		lineClamp: 2,
		label: 'Small',
	},
	medium: {
		cellWidth: 96,
		cellHeight: 128,
		iconSize: 'w-14 h-14',
		iconContainer: 'w-16 h-16',
		fontSize: 12,
		lineClamp: 3,
		label: 'Medium',
	},
	large: {
		cellWidth: 112,
		cellHeight: 144,
		iconSize: 'w-18 h-18',
		iconContainer: 'w-20 h-20',
		fontSize: 13,
		lineClamp: 3,
		label: 'Large',
	},
};

interface DesktopSettingsState {
	gridFlow: GridFlow;
	iconSize: IconSize;
	sortOrder: SortOrder;
	gridAlignment: GridAlignment;
	showExtensions: boolean;

	setGridFlow: (flow: GridFlow) => void;
	setIconSize: (size: IconSize) => void;
	setSortOrder: (order: SortOrder) => void;
	setGridAlignment: (alignment: GridAlignment) => void;
	setShowExtensions: (show: boolean) => void;
}

export const useDesktopSettings = create<DesktopSettingsState>()(
	persist(
		(set) => ({
			gridFlow: 'row',
			iconSize: 'medium',
			sortOrder: 'category',
			gridAlignment: 'left',
			showExtensions: false,

			setGridFlow: (gridFlow) => set({ gridFlow }),
			setIconSize: (iconSize) => set({ iconSize }),
			setSortOrder: (sortOrder) => set({ sortOrder }),
			setGridAlignment: (gridAlignment) => set({ gridAlignment }),
			setShowExtensions: (showExtensions) => set({ showExtensions }),
		}),
		{
			name: 'claude-os-desktop-settings',
		}
	)
);
