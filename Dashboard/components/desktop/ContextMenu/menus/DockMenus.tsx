'use client';

import {
	Calendar, ChevronUp, FolderOpen, Info, LayoutGrid,
	MessageSquarePlus, Play, Target, Terminal, X
} from 'lucide-react';
import { getRoleConfig } from '@/lib/sessionUtils';
import { MenuItem, Separator } from '../components';
import { MenuActions, ContextMenuState, TargetInfo } from '../types';

// === Dock App Menu ===

interface DockAppMenuProps {
	actions: MenuActions;
	contextMenu: ContextMenuState;
	targetInfo: TargetInfo;
}

function getDockAppIcon(appType?: string) {
	switch (appType) {
		case 'finder': return <FolderOpen className="w-4 h-4" />;
		case 'calendar': return <Calendar className="w-4 h-4" />;
		default: return <Info className="w-4 h-4" />;
	}
}

export function DockAppMenu({ actions, contextMenu, targetInfo }: DockAppMenuProps) {
	const isRunning = contextMenu.dockAppIsRunning ?? false;

	return (
		<>
			<div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20">
				<div className="flex items-center gap-2">
					{getDockAppIcon(contextMenu.dockAppType)}
					<span className="text-[13px] font-medium text-blue-900 dark:text-blue-200">
						{targetInfo.fileName}
					</span>
				</div>
				<span className="text-[11px] text-blue-600 dark:text-blue-300 ml-6">
					{isRunning ? 'Running' : 'Core App'}
				</span>
			</div>
			<div className="py-1.5">
				<MenuItem icon={<Play className="w-4 h-4" />} label={isRunning ? 'Show Window' : 'Open'} shortcut="↵" onClick={actions.handleOpenDockApp} />
				{isRunning && (
					<>
						<Separator />
						<MenuItem icon={<X className="w-4 h-4" />} label="Quit" shortcut="⌘Q" onClick={actions.handleQuitDockApp} destructive />
					</>
				)}
			</div>
		</>
	);
}

// === Dock Session Menu ===

interface DockSessionMenuProps {
	actions: MenuActions;
	contextMenu: ContextMenuState;
}

export function DockSessionMenu({ actions, contextMenu }: DockSessionMenuProps) {
	const roleName = contextMenu.dockSessionRole || 'Session';
	const roleDisplayName = roleName.charAt(0).toUpperCase() + roleName.slice(1);

	return (
		<>
			<div className="px-3 py-2 bg-[var(--color-claude)]/10 border-b border-[var(--color-claude)]/20">
				<div className="flex items-center gap-2">
					<div className="w-4 h-4 text-[var(--color-claude)]">
						<svg viewBox="0 0 16 16" fill="currentColor">
							<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
						</svg>
					</div>
					<span className="text-[13px] font-medium text-[var(--color-claude)]">
						{roleDisplayName}
					</span>
				</div>
				<span className="text-[11px] text-[var(--color-claude)]/70 ml-6">Active Claude Session</span>
			</div>
			<div className="py-1.5">
				<MenuItem icon={<Target className="w-4 h-4" />} label="Focus Session" shortcut="↵" onClick={actions.handleFocusSession} />
				<Separator />
				<MenuItem icon={<MessageSquarePlus className="w-4 h-4 text-[var(--color-claude)]" />} label="Attach to Chat" onClick={actions.handleAttachToChat} />
				<Separator />
				<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfoDockSession} />
				<Separator />
				<MenuItem icon={<X className="w-4 h-4" />} label="End Session" onClick={actions.handleEndSession} destructive />
			</div>
		</>
	);
}

// === Dock Minimized Window Menu ===

interface DockMinimizedMenuProps {
	actions: MenuActions;
}

export function DockMinimizedMenu({ actions }: DockMinimizedMenuProps) {
	return (
		<div className="py-1.5">
			<MenuItem icon={<ChevronUp className="w-4 h-4" />} label="Restore" shortcut="↵" onClick={actions.handleRestoreWindow} />
			<Separator />
			<MenuItem icon={<X className="w-4 h-4" />} label="Close" onClick={actions.handleCloseMinimizedWindow} destructive />
		</div>
	);
}
