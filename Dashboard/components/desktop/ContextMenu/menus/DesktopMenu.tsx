'use client';

import {
	ArrowDownAZ, Calendar, FilePlus, Folders, FolderPlus,
	Grid3X3, Import, RefreshCw, XSquare
} from 'lucide-react';
import { MenuItem, Separator, Submenu } from '../components';
import { MenuActions } from '../types';

interface DesktopMenuProps {
	actions: MenuActions;
}

export function DesktopMenu({ actions }: DesktopMenuProps) {
	return (
		<>
			<MenuItem icon={<FolderPlus className="w-4 h-4" />} label="New Folder" shortcut="⇧⌘N" onClick={actions.handleNewFolder} />
			<MenuItem icon={<FilePlus className="w-4 h-4" />} label="New File..." onClick={actions.handleNewFile} />
			<MenuItem icon={<Import className="w-4 h-4" />} label="Import Files..." onClick={actions.handleImportClick} />
			<Separator />
			<MenuItem icon={<Grid3X3 className="w-4 h-4" />} label="Clean Up" onClick={actions.handleCleanUp} />
			<Submenu
				icon={<Grid3X3 className="w-4 h-4" />}
				label="Clean Up By"
				onSelect={actions.handleSortBy}
			>
				{[
					{ label: 'Name', value: 'cleanup-name', icon: <ArrowDownAZ className="w-4 h-4" /> },
					{ label: 'Kind', value: 'cleanup-kind', icon: <Folders className="w-4 h-4" /> },
					{ label: 'Date', value: 'cleanup-date', icon: <Calendar className="w-4 h-4" /> },
				]}
			</Submenu>
			<Separator />
			<MenuItem icon={<XSquare className="w-4 h-4" />} label="Close All Windows" onClick={actions.handleCloseAllWindows} />
			<MenuItem icon={<RefreshCw className="w-4 h-4" />} label="Refresh" shortcut="⌘R" onClick={actions.handleRefresh} />
		</>
	);
}
