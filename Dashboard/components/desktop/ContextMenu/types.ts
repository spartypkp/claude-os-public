import { ContextMenuState } from '@/store/windowStore';

// Determine target type from path and metadata
// Note: 'finder-empty' maps to same behavior as 'desktop' but creates files in currentDirectory
export type TargetType = 'file' | 'folder' | 'system-file' | 'life-domain' | 'custom-app' | 'desktop' | 'trash' | 'widget' | 'dock-app' | 'dock-session' | 'dock-minimized' | 'panel-chief' | 'panel-specialist' | 'panel-attachment';

export interface MenuItemProps {
	icon: React.ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
	disabled?: boolean;
	destructive?: boolean;
	hasSubmenu?: boolean;
}

export interface TargetInfo {
	type: TargetType;
	fileName: string;
	isDir: boolean;
}

/** All action handlers passed down to menu components */
export interface MenuActions {
	handleOpen: () => void;
	handleOpenInNewWindow: () => void;
	handleGetInfo: () => void;
	handleRename: () => void;
	handleMoveToTrash: () => void;
	handleCopyPath: () => void;
	handleShowInFinder: () => void;
	handleMoveTo: () => void;
	handleOpenWith: (app: string) => void;
	handleExport: () => void;
	handleOpenInMacOS: () => void;
	handleAttachToChat: () => void;
	handleExplainThis: () => void;
	handleWhyProtected: () => void;
	handleNewFileInside: () => void;
	handleNewFolderInside: () => void;
	handleOpenLifeSpec: () => void;
	handleLaunchApp: () => void;
	handleOpenAppSpec: () => void;
	handleUninstallApp: () => void;
	handleRequestFeature: () => void;
	handleOpenTrash: () => void;
	handleEmptyTrash: () => void;
	handleCollapseWidget: () => void;
	handleRemoveWidget: () => void;
	handleOpenDockApp: () => void;
	handleQuitDockApp: () => void;
	handleFocusSession: () => void;
	handleEndSession: () => void;
	handleGetInfoDockSession: () => void;
	handleGetInfoPanelSession: () => void;
	handleRestoreWindow: () => void;
	handleCloseMinimizedWindow: () => void;
	handleFocusChiefTmux: () => void;
	handleForceResetChief: () => void;
	handleResetChief: () => void;
	handleAttachContextToChief: () => void;
	handleFocusSpecialistTmux: () => void;
	handleForceResetSpecialist: () => void;
	handleEndSpecialistSession: () => void;
	handleOpenAttachment: () => void;
	handleShowAttachmentInFinder: () => void;
	handleRevealAttachmentOnDesktop: () => void;
	handleCopyAttachmentPath: () => void;
	handleRemoveAttachment: () => void;
	handleGetInfoAttachment: () => void;
	handleNewFolder: () => void;
	handleNewFile: () => void;
	handleImportClick: () => void;
	handleCleanUp: () => void;
	handleSortBy: (type: string) => void;
	handleRefresh: () => void;
	handleCloseAllWindows: () => void;
}

export type { ContextMenuState };
