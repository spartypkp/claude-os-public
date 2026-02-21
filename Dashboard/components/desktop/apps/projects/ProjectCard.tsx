'use client';

import { memo } from 'react';
import { GitBranch, Clock, FileWarning, GitCommit, ChevronRight } from 'lucide-react';

// =============================================================================
// TYPES — match the new tree API response
// =============================================================================

export interface GitRepo {
	name: string;
	last_commit_ago: string;
	last_commit_msg: string;
	last_commit_unix: number;
	branch: string | null;
	uncommitted_count: number;
}

export interface ProjectData {
	name: string;
	status: string;
	category: string;
	tech: string[];
	description: string | null;
	has_history: boolean;
	last_history_date: string | null;
	git: GitRepo[];
	path: string;
	// Detail endpoint only:
	project_md?: string;
	history_md?: string;
}

export interface TreeNode {
	slug: string;
	type: 'project' | 'group';
	project?: ProjectData;
	children?: TreeNode[];
}

// =============================================================================
// STYLES
// =============================================================================

export const STATUS_STYLES: Record<string, { label: string; dot: string }> = {
	active: { label: 'Active', dot: 'bg-emerald-400' },
	complete: { label: 'Complete', dot: 'bg-blue-400' },
	paused: { label: 'Paused', dot: 'bg-amber-400' },
	archived: { label: 'Archived', dot: 'bg-gray-500' },
};

export const CATEGORY_COLORS: Record<string, { accent: string; border: string }> = {
	flagship: { accent: 'text-cyan-400', border: 'border-l-cyan-400' },
	active: { accent: 'text-emerald-400', border: 'border-l-emerald-400' },
	client: { accent: 'text-violet-400', border: 'border-l-violet-400' },
	startup: { accent: 'text-orange-400', border: 'border-l-orange-400' },
	hackathon: { accent: 'text-pink-400', border: 'border-l-pink-400' },
	'side-project': { accent: 'text-blue-400', border: 'border-l-blue-400' },
	swyx: { accent: 'text-indigo-400', border: 'border-l-indigo-400' },
	learning: { accent: 'text-gray-400', border: 'border-l-gray-400' },
	abandoned: { accent: 'text-gray-600', border: 'border-l-gray-600' },
	deprecated: { accent: 'text-gray-600', border: 'border-l-gray-600' },
	other: { accent: 'text-gray-500', border: 'border-l-gray-500' },
};

// =============================================================================
// TREE ITEM — sidebar node
// =============================================================================

interface TreeItemProps {
	node: TreeNode;
	depth: number;
	selectedSlug: string | null;
	expandedGroups: Set<string>;
	onSelect: (slug: string) => void;
	onToggleGroup: (slug: string) => void;
}

export const TreeItem = memo(function TreeItem({
	node,
	depth,
	selectedSlug,
	expandedGroups,
	onSelect,
	onToggleGroup,
}: TreeItemProps) {
	const isGroup = node.type === 'group';
	const isExpanded = isGroup && expandedGroups.has(node.slug);
	const isSelected = selectedSlug === node.slug;

	// For projects, get latest git timestamp for the right-side label
	const p = node.project;
	const latestGit = p?.git?.length
		? p.git.reduce((a, b) => (a.last_commit_unix > b.last_commit_unix ? a : b))
		: null;

	const displayName = p?.name || node.slug;

	const handleClick = () => {
		if (isGroup) {
			onToggleGroup(node.slug);
			// Also select to show group detail
			onSelect(node.slug);
		} else {
			onSelect(node.slug);
		}
	};

	return (
		<div>
			<button
				onClick={handleClick}
				className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-colors border-b border-b-[var(--border-default)]/50 ${
					isSelected
						? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
						: 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
				}`}
				style={{ paddingLeft: `${12 + depth * 16}px` }}
			>
				{/* Chevron — only for groups (things with navigable children) */}
				{isGroup ? (
					<ChevronRight className={`w-3 h-3 shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
				) : (
					<span className="w-3 shrink-0" />
				)}

				<span className="truncate flex-1 text-left">{displayName}</span>

				{/* Right side: git time for projects, child count for groups */}
				{isGroup ? (
					<span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
						{node.children?.length || 0}
					</span>
				) : latestGit ? (
					<span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
						{latestGit.last_commit_ago.replace(' ago', '')}
					</span>
				) : null}
			</button>

			{/* Children (groups only) */}
			{isExpanded && node.children && (
				<div>
					{node.children.map((child) => (
						<TreeItem
							key={child.slug}
							node={child}
							depth={depth + 1}
							selectedSlug={selectedSlug}
							expandedGroups={expandedGroups}
							onSelect={onSelect}
							onToggleGroup={onToggleGroup}
						/>
					))}
				</div>
			)}
		</div>
	);
});

// =============================================================================
// GIT SECTION — for detail panel
// =============================================================================

export function GitSection({ repos }: { repos: GitRepo[] }) {
	if (repos.length === 0) return null;

	return (
		<div className="space-y-3">
			{repos.map((repo) => (
				<div key={repo.name} className="rounded-lg bg-[var(--surface-sunken)] p-3">
					<div className="flex items-center justify-between mb-1.5">
						<span className="text-xs font-mono font-medium text-[var(--text-primary)]">{repo.name}</span>
						{repo.uncommitted_count > 0 && (
							<span className="flex items-center gap-1 text-[10px] text-amber-400">
								<FileWarning className="w-3 h-3" />
								{repo.uncommitted_count} uncommitted
							</span>
						)}
					</div>
					<div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
						{repo.branch && (
							<span className="flex items-center gap-1">
								<GitBranch className="w-3 h-3" />
								<span className="truncate max-w-[120px]">{repo.branch}</span>
							</span>
						)}
						<span className="flex items-center gap-1">
							<Clock className="w-3 h-3" />
							{repo.last_commit_ago}
						</span>
					</div>
					{repo.last_commit_msg && (
						<div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[var(--text-secondary)]">
							<GitCommit className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
							<span className="truncate">{repo.last_commit_msg}</span>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
