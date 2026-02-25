'use client';

import { Calendar, ChevronDown, ChevronUp, LayoutGrid, Target, X } from 'lucide-react';
import { MenuItem, Separator } from '../components';
import { MenuActions, ContextMenuState, TargetInfo } from '../types';

interface WidgetMenuProps {
	actions: MenuActions;
	contextMenu: ContextMenuState;
	targetInfo: TargetInfo;
	isCollapsed: boolean;
}

function getWidgetIcon(widgetType?: string) {
	switch (widgetType) {
		case 'priorities': return <Target className="w-4 h-4" />;
		case 'calendar': return <Calendar className="w-4 h-4" />;
		default: return <LayoutGrid className="w-4 h-4" />;
	}
}

export function WidgetMenu({ actions, contextMenu, targetInfo, isCollapsed }: WidgetMenuProps) {
	return (
		<>
			<div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20">
				<div className="flex items-center gap-2">
					{getWidgetIcon(contextMenu.widgetType)}
					<span className="text-[13px] font-medium text-blue-900 dark:text-blue-200">
						{targetInfo.fileName}
					</span>
				</div>
				<span className="text-[11px] text-blue-600 dark:text-blue-300 ml-6">Desktop Widget</span>
			</div>
			<div className="py-1.5">
				<MenuItem
					icon={isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
					label={isCollapsed ? 'Expand' : 'Collapse'}
					onClick={actions.handleCollapseWidget}
				/>
				<Separator />
				<MenuItem icon={<X className="w-4 h-4" />} label="Remove Widget" onClick={actions.handleRemoveWidget} destructive />
			</div>
		</>
	);
}
