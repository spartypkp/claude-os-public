'use client';

import {
	ClipboardCopy, ExternalLink, FileText, FolderInput, Info, Lightbulb,
	MessageSquarePlus, Pencil, Play, Rocket, Trash2
} from 'lucide-react';
import { MenuItem, Separator, BrandedHeader } from '../components';
import { MenuActions } from '../types';

interface AppMenuProps {
	actions: MenuActions;
}

export function AppMenu({ actions }: AppMenuProps) {
	return (
		<>
			<BrandedHeader
				icon={<Rocket className="w-5 h-5 text-purple-500" />}
				title="Custom Application"
				subtitle="Built by Claude"
				color="bg-purple-500/10 text-purple-600 dark:text-purple-400"
			/>
			<div className="py-1">
				<MenuItem icon={<MessageSquarePlus className="w-4 h-4" />} label="Attach to Chat" onClick={actions.handleAttachToChat} />
				<MenuItem icon={<Lightbulb className="w-4 h-4 text-amber-500" />} label="Request Feature" onClick={actions.handleRequestFeature} />
				<Separator />
				<MenuItem icon={<Play className="w-4 h-4 text-green-500" />} label="Launch App" shortcut="↵" onClick={actions.handleLaunchApp} />
				<MenuItem icon={<FolderInput className="w-4 h-4" />} label="Open in New Window" onClick={actions.handleOpenInNewWindow} />
				<MenuItem icon={<FileText className="w-4 h-4 text-purple-500" />} label="Open APP-SPEC.md" onClick={actions.handleOpenAppSpec} />
				<MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Show in Finder" onClick={actions.handleShowInFinder} />
				<Separator />
				<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfo} />
				<MenuItem icon={<ClipboardCopy className="w-4 h-4" />} label="Copy Path" onClick={actions.handleCopyPath} />
				<MenuItem icon={<FolderInput className="w-4 h-4" />} label="Move to..." onClick={actions.handleMoveTo} />
				<MenuItem icon={<Pencil className="w-4 h-4" />} label="Rename App" onClick={actions.handleRename} />
				<MenuItem icon={<Trash2 className="w-4 h-4" />} label="Uninstall App" onClick={actions.handleUninstallApp} destructive />
			</div>
		</>
	);
}
