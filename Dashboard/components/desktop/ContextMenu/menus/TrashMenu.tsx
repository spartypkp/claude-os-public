'use client';

import { FolderOpen, Trash2 } from 'lucide-react';
import { MenuItem, Separator } from '../components';
import { MenuActions } from '../types';

interface TrashMenuProps {
	actions: MenuActions;
	trashCount: number;
}

export function TrashMenu({ actions, trashCount }: TrashMenuProps) {
	const isEmpty = trashCount === 0;

	return (
		<>
			<div className="px-3 py-2" style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
				<div className="flex items-center gap-2">
					<Trash2 className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
					<span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Trash</span>
				</div>
				<span className="text-[11px] ml-6" style={{ color: 'var(--text-muted)' }}>
					{isEmpty ? 'Empty' : `${trashCount} item${trashCount === 1 ? '' : 's'}`}
				</span>
			</div>
			<div className="py-1.5">
				<MenuItem icon={<FolderOpen className="w-4 h-4" />} label="Open Trash" shortcut="↵" onClick={actions.handleOpenTrash} />
				<Separator />
				<MenuItem icon={<Trash2 className="w-4 h-4" />} label="Empty Trash" onClick={actions.handleEmptyTrash} destructive disabled={isEmpty} />
			</div>
		</>
	);
}
