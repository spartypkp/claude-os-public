'use client';

import { memo } from 'react';
import { GitBranch, Clock, FileWarning, GitCommit } from 'lucide-react';

// =============================================================================
// TYPES
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
	interview_value: string | null;
	interview_summary: string | null;
	// Detail endpoint only:
	project_md?: string;
	history_md?: string;
}

export interface GroupData {
	name: string;
	description: string | null;
	has_group_md: boolean;
	path: string;
	// Detail endpoint only:
	group_md?: string;
}

export interface TreeNode {
	slug: string;
	type: 'project' | 'group';
	project?: ProjectData;
	group?: GroupData;
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
	deprecated: { label: 'Deprecated', dot: 'bg-gray-500' },
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

const IV_STYLES: Record<string, { bg: string; text: string }> = {
	HIGH: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
	'MEDIUM-HIGH': { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
};

// =============================================================================
// PROJECT CARD — grid card for the command center
// =============================================================================

interface ProjectCardProps {
	project: ProjectData;
	slug: string;
	isSelected: boolean;
	onClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
}

export const ProjectCard = memo(function ProjectCard({
	project: p,
	slug,
	isSelected,
	onClick,
	onContextMenu,
}: ProjectCardProps) {
	const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.archived;
	const catColor = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other;
	const latestGit = p.git.length > 0
		? p.git.reduce((a, b) => (a.last_commit_unix > b.last_commit_unix ? a : b))
		: null;
	const ivStyle = p.interview_value ? IV_STYLES[p.interview_value] : null;

	return (
		<button
			onClick={onClick}
			onContextMenu={onContextMenu}
			className={`w-full text-left rounded-lg border-l-[3px] ${catColor.border} transition-all duration-150 ${
				isSelected
					? 'bg-[var(--surface-muted)] ring-1 ring-[var(--border-active)]'
					: 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-muted)] hover:shadow-md hover:-translate-y-[1px]'
			}`}
		>
			<div className="p-3">
				{/* Row 1: Name + status dot */}
				<div className="flex items-center gap-2 mb-1">
					<span className={`w-2 h-2 rounded-full shrink-0 ${statusStyle.dot}`} />
					<span className="text-[13px] font-medium text-[var(--text-primary)] truncate flex-1">
						{p.name}
					</span>
					{latestGit && (
						<span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
							{latestGit.last_commit_ago.replace(' ago', '')}
						</span>
					)}
				</div>

				{/* Row 2: Description */}
				{p.description && (
					<p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-2 ml-4">
						{p.description}
					</p>
				)}

				{/* Row 3: Tech pills + interview value */}
				<div className="flex items-center gap-1.5 ml-4 flex-wrap">
					{p.tech.slice(0, 3).map((t) => (
						<span
							key={t}
							className="px-1.5 py-0.5 text-[9px] rounded bg-[var(--surface-raised)] text-[var(--text-muted)]"
						>
							{t}
						</span>
					))}
					{p.tech.length > 3 && (
						<span className="text-[9px] text-[var(--text-muted)]">
							+{p.tech.length - 3}
						</span>
					)}
					<span className="flex-1" />
					{ivStyle && (
						<span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${ivStyle.bg} ${ivStyle.text}`}>
							{p.interview_value}
						</span>
					)}
				</div>
			</div>
		</button>
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
