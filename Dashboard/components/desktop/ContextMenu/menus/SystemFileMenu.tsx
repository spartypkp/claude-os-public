'use client';

import { ClipboardCopy, ExternalLink, FolderOpen, HelpCircle, Info, Lock, MessageSquarePlus } from 'lucide-react';
import { MenuItem, Separator, BrandedHeader } from '../components';
import { MenuActions } from '../types';

interface SystemFileMenuProps {
	actions: MenuActions;
}

export function SystemFileMenu({ actions }: SystemFileMenuProps) {
	return (
		<>
			<BrandedHeader
				icon={<Lock className="w-5 h-5 text-[var(--color-claude)]" />}
				title="Claude System File"
				subtitle="Managed by Claude"
				color="bg-[var(--color-claude)]/10 text-[var(--color-claude)]"
			/>
			<div className="py-1">
				<MenuItem icon={<MessageSquarePlus className="w-4 h-4" />} label="Attach to Chat" onClick={actions.handleAttachToChat} />
				<MenuItem icon={<HelpCircle className="w-4 h-4" />} label="Why is this protected?" onClick={actions.handleWhyProtected} />
				<Separator />
				<MenuItem icon={<FolderOpen className="w-4 h-4" />} label="Open" shortcut="↵" onClick={actions.handleOpen} />
				<MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Show in Finder" onClick={actions.handleShowInFinder} />
				<Separator />
				<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfo} />
				<MenuItem icon={<ClipboardCopy className="w-4 h-4" />} label="Copy Path" onClick={actions.handleCopyPath} />
			</div>
		</>
	);
}
