'use client';

import { ContextMenuState, MenuActions, TargetInfo } from './types';
import { FileMenu } from './menus/FileMenu';
import { FolderMenu } from './menus/FolderMenu';
import { SystemFileMenu } from './menus/SystemFileMenu';
import { DomainMenu } from './menus/DomainMenu';
import { AppMenu } from './menus/AppMenu';
import { DesktopMenu } from './menus/DesktopMenu';
import { TrashMenu } from './menus/TrashMenu';
import { WidgetMenu } from './menus/WidgetMenu';
import { DockAppMenu, DockSessionMenu, DockMinimizedMenu } from './menus/DockMenus';
import { PanelChiefMenu, PanelSpecialistMenu, PanelAttachmentMenu } from './menus/PanelMenus';

interface MenuRendererProps {
	targetInfo: TargetInfo;
	contextMenu: ContextMenuState;
	actions: MenuActions;
	isWidgetCollapsed: boolean;
}

/** Has a branded header that includes its own padding (no outer py-1.5 wrapper needed) */
const BRANDED_HEADER_TYPES = new Set([
	'system-file', 'life-domain', 'custom-app', 'trash', 'widget',
	'dock-app', 'dock-session', 'panel-chief', 'panel-specialist'
]);

export function MenuRenderer({ targetInfo, contextMenu, actions, isWidgetCollapsed }: MenuRendererProps) {
	const hasBrandedHeader = BRANDED_HEADER_TYPES.has(targetInfo.type);

	const content = (() => {
		switch (targetInfo.type) {
			case 'file':
				return <FileMenu actions={actions} />;
			case 'folder':
				return <FolderMenu actions={actions} />;
			case 'system-file':
				return <SystemFileMenu actions={actions} />;
			case 'life-domain':
				return <DomainMenu actions={actions} />;
			case 'custom-app':
				return <AppMenu actions={actions} />;
			case 'trash':
				return <TrashMenu actions={actions} trashCount={contextMenu.trashCount ?? 0} />;
			case 'widget':
				return <WidgetMenu actions={actions} contextMenu={contextMenu} targetInfo={targetInfo} isCollapsed={isWidgetCollapsed} />;
			case 'dock-app':
				return <DockAppMenu actions={actions} contextMenu={contextMenu} targetInfo={targetInfo} />;
			case 'dock-session':
				return <DockSessionMenu actions={actions} contextMenu={contextMenu} />;
			case 'dock-minimized':
				return <DockMinimizedMenu actions={actions} />;
			case 'panel-chief':
				return <PanelChiefMenu actions={actions} contextMenu={contextMenu} />;
			case 'panel-specialist':
				return <PanelSpecialistMenu actions={actions} contextMenu={contextMenu} targetInfo={targetInfo} />;
			case 'panel-attachment':
				return <PanelAttachmentMenu actions={actions} />;
			case 'desktop':
			default:
				return <DesktopMenu actions={actions} />;
		}
	})();

	return (
		<div className={hasBrandedHeader ? '' : 'py-1.5'}>
			{content}
		</div>
	);
}
