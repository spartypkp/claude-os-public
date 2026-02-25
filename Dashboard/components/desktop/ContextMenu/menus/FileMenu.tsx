'use client';

import {
	ClipboardCopy, ExternalLink, FolderInput, FolderOpen,
	Info, MessageSquarePlus, Pencil, Trash2
} from 'lucide-react';
import { MenuItem, Separator } from '../components';
import { MenuActions } from '../types';

interface FileMenuProps {
	actions: MenuActions;
}

export function FileMenu({ actions }: FileMenuProps) {
	return (
		<>
			<MenuItem icon={<MessageSquarePlus className="w-4 h-4" />} label="Attach to Chat" onClick={actions.handleAttachToChat} />
			<Separator />
			<MenuItem icon={<FolderOpen className="w-4 h-4" />} label="Open" shortcut="↵" onClick={actions.handleOpen} />
			<MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Show in Finder" onClick={actions.handleShowInFinder} />
			<Separator />
			<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfo} />
			<MenuItem icon={<ClipboardCopy className="w-4 h-4" />} label="Copy Path" onClick={actions.handleCopyPath} />
			<MenuItem icon={<FolderInput className="w-4 h-4" />} label="Move to..." onClick={actions.handleMoveTo} />
			<MenuItem icon={<Pencil className="w-4 h-4" />} label="Rename" onClick={actions.handleRename} />
			<MenuItem icon={<Trash2 className="w-4 h-4" />} label="Move to Trash" shortcut="⌘⌫" onClick={actions.handleMoveToTrash} destructive />
		</>
	);
}
