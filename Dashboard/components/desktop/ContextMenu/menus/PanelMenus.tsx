'use client';

import {
	ClipboardCopy, Code2, Crown, ExternalLink, FolderOpen, Info,
	LayoutGrid, MessageSquarePlus, RotateCcw, Terminal, Trash2, X, XCircle
} from 'lucide-react';
import { getRoleConfig } from '@/lib/sessionUtils';
import { MenuItem, Separator } from '../components';
import { MenuActions, ContextMenuState, TargetInfo } from '../types';

// === Panel Chief Menu ===

interface PanelChiefMenuProps {
	actions: MenuActions;
	contextMenu: ContextMenuState;
}

export function PanelChiefMenu({ actions, contextMenu }: PanelChiefMenuProps) {
	return (
		<>
			<div className="px-3 py-2 bg-[var(--color-claude)]/10 border-b border-[var(--color-claude)]/20">
				<div className="flex items-center gap-2">
					<Crown className="w-4 h-4 text-[var(--color-claude)]" />
					<span className="text-[13px] font-medium text-[var(--color-claude)]">Chief</span>
				</div>
				<span className="text-[11px] text-[var(--color-claude)]/70 ml-6">
					{contextMenu.panelSessionStatus || 'Leading the team'}
				</span>
			</div>
			<div className="py-1.5">
				<MenuItem icon={<Terminal className="w-4 h-4" />} label="Focus in tmux" onClick={actions.handleFocusChiefTmux} />
				<Separator />
				<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfoPanelSession} />
				<Separator />
				<MenuItem icon={<RotateCcw className="w-4 h-4 text-amber-500" />} label="Force Reset" onClick={actions.handleForceResetChief} />
				<MenuItem icon={<XCircle className="w-4 h-4" />} label="Reset Chief" onClick={actions.handleResetChief} destructive />
			</div>
		</>
	);
}

// === Panel Specialist Menu ===

interface PanelSpecialistMenuProps {
	actions: MenuActions;
	contextMenu: ContextMenuState;
	targetInfo: TargetInfo;
}

function getSpecialistIcon(roleSlug?: string) {
	if (!roleSlug) return <Code2 className="w-4 h-4" />;
	const config = getRoleConfig(roleSlug);
	if (config.isLogo) return null;
	const Icon = config.icon;
	return <Icon className="w-4 h-4" />;
}

export function PanelSpecialistMenu({ actions, contextMenu, targetInfo }: PanelSpecialistMenuProps) {
	return (
		<>
			<div className="px-3 py-2 bg-[var(--color-claude)]/10 border-b border-[var(--color-claude)]/20">
				<div className="flex items-center gap-2">
					<span className="text-[var(--color-claude)]">{getSpecialistIcon(contextMenu.panelSessionRole)}</span>
					<span className="text-[13px] font-medium text-[var(--color-claude)]">
						{targetInfo.fileName}
					</span>
				</div>
				<span className="text-[11px] text-[var(--color-claude)]/70 ml-6">
					{contextMenu.panelSessionStatus || 'Working...'}
				</span>
			</div>
			<div className="py-1.5">
				<MenuItem icon={<MessageSquarePlus className="w-4 h-4 text-[var(--color-claude)]" />} label="Attach Context to Chief" onClick={actions.handleAttachContextToChief} />
				<Separator />
				<MenuItem icon={<Terminal className="w-4 h-4" />} label="Focus in tmux" onClick={actions.handleFocusSpecialistTmux} />
				<Separator />
				<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfoPanelSession} />
				<Separator />
				<MenuItem icon={<RotateCcw className="w-4 h-4 text-amber-500" />} label="Force Reset" onClick={actions.handleForceResetSpecialist} />
				<MenuItem icon={<XCircle className="w-4 h-4" />} label="End Session" onClick={actions.handleEndSpecialistSession} destructive />
			</div>
		</>
	);
}

// === Panel Attachment Menu ===

interface PanelAttachmentMenuProps {
	actions: MenuActions;
}

export function PanelAttachmentMenu({ actions }: PanelAttachmentMenuProps) {
	return (
		<div className="py-1.5">
			<MenuItem icon={<FolderOpen className="w-4 h-4" />} label="Open File" shortcut="↵" onClick={actions.handleOpenAttachment} />
			<MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Show in Finder" onClick={actions.handleShowAttachmentInFinder} />
			<MenuItem icon={<LayoutGrid className="w-4 h-4" />} label="Reveal on Desktop" onClick={actions.handleRevealAttachmentOnDesktop} />
			<Separator />
			<MenuItem icon={<Info className="w-4 h-4" />} label="Get Info" shortcut="⌘I" onClick={actions.handleGetInfoAttachment} />
			<Separator />
			<MenuItem icon={<ClipboardCopy className="w-4 h-4" />} label="Copy Path" onClick={actions.handleCopyAttachmentPath} />
			<MenuItem icon={<Trash2 className="w-4 h-4" />} label="Remove" onClick={actions.handleRemoveAttachment} destructive />
		</div>
	);
}
