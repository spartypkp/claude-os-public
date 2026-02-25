'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
	Loader2,
	FolderGit2,
	RefreshCw,
	Search,
	ChevronDown,
	ChevronRight,
	X,
	FolderOpen,
	Terminal,
	FolderInput,
	Pin,
	Plus,
	Pencil,
	Trash2,
	FileText,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import {
	ProjectCard,
	GitSection,
	STATUS_STYLES,
	CATEGORY_COLORS,
	type TreeNode,
	type ProjectData,
	type GroupData,
} from './ProjectCard';
import { ChatButton } from '@/components/shared/ChatButton';

// =============================================================================
// HELPERS
// =============================================================================

function latestCommitUnix(p: ProjectData): number {
	if (p.git.length === 0) return 0;
	return Math.max(...p.git.map((g) => g.last_commit_unix));
}

function sortByActivity(projects: { slug: string; project: ProjectData }[]) {
	return [...projects].sort((a, b) => latestCommitUnix(b.project) - latestCommitUnix(a.project));
}

interface FlatProject { slug: string; project: ProjectData; group: string }

function flattenProjects(nodes: TreeNode[]): FlatProject[] {
	const result: FlatProject[] = [];
	for (const node of nodes) {
		if (node.type === 'project' && node.project) {
			result.push({ slug: node.slug, project: node.project, group: '_root' });
		}
		if (node.type === 'group' && node.children) {
			for (const child of node.children) {
				if (child.type === 'project' && child.project) {
					result.push({ slug: child.slug, project: child.project, group: node.slug });
				}
				if (child.type === 'group' && child.children) {
					for (const grandchild of child.children) {
						if (grandchild.type === 'project' && grandchild.project) {
							result.push({ slug: grandchild.slug, project: grandchild.project, group: `${node.slug}/${child.slug}` });
						}
					}
				}
			}
		}
	}
	return result;
}

/** Extract group metadata map from tree nodes */
function extractGroupMeta(nodes: TreeNode[]): Map<string, GroupData> {
	const map = new Map<string, GroupData>();
	for (const node of nodes) {
		if (node.type === 'group' && node.group) {
			map.set(node.slug, node.group);
		}
	}
	return map;
}

type FilterPreset = 'all' | 'active' | 'interview';

// =============================================================================
// FILTER BAR
// =============================================================================

function FilterBar({
	preset,
	setPreset,
	search,
	setSearch,
	statusFilter,
	setStatusFilter,
	categoryFilter,
	setCategoryFilter,
	allCategories,
	allStatuses,
	totalCount,
	filteredCount,
}: {
	preset: FilterPreset;
	setPreset: (p: FilterPreset) => void;
	search: string;
	setSearch: (s: string) => void;
	statusFilter: string[];
	setStatusFilter: (s: string[]) => void;
	categoryFilter: string[];
	setCategoryFilter: (c: string[]) => void;
	allCategories: string[];
	allStatuses: string[];
	totalCount: number;
	filteredCount: number;
}) {
	const [showStatusDrop, setShowStatusDrop] = useState(false);
	const [showCatDrop, setShowCatDrop] = useState(false);
	const statusRef = useRef<HTMLDivElement>(null);
	const catRef = useRef<HTMLDivElement>(null);

	// Close dropdowns on outside click
	useEffect(() => {
		if (!showStatusDrop && !showCatDrop) return;
		const handler = (e: MouseEvent) => {
			if (showStatusDrop && statusRef.current && !statusRef.current.contains(e.target as Node)) {
				setShowStatusDrop(false);
			}
			if (showCatDrop && catRef.current && !catRef.current.contains(e.target as Node)) {
				setShowCatDrop(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [showStatusDrop, showCatDrop]);

	const presets: { key: FilterPreset; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'active', label: 'Active' },
		{ key: 'interview', label: 'Interview Ready' },
	];

	const hasFilters = preset !== 'all' || search || statusFilter.length > 0 || categoryFilter.length > 0;

	return (
		<div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center gap-2 flex-wrap">
			{/* Preset toggles */}
			<div className="flex items-center bg-[var(--surface-sunken)] rounded-md p-0.5">
				{presets.map((p) => (
					<button
						key={p.key}
						onClick={() => {
							setPreset(p.key);
							setStatusFilter([]);
							setCategoryFilter([]);
						}}
						className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
							preset === p.key
								? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
								: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
						}`}
					>
						{p.label}
					</button>
				))}
			</div>

			{/* Status dropdown */}
			<div className="relative" ref={statusRef}>
				<button
					onClick={() => { setShowStatusDrop(!showStatusDrop); setShowCatDrop(false); }}
					className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors ${
						statusFilter.length > 0
							? 'border-[var(--border-active)] text-[var(--text-primary)] bg-[var(--surface-muted)]'
							: 'border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
					}`}
				>
					Status{statusFilter.length > 0 && ` (${statusFilter.length})`}
					<ChevronDown className="w-3 h-3" />
				</button>
				{showStatusDrop && (
					<div className="absolute top-full left-0 mt-1 z-50 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg shadow-xl py-1.5 min-w-[150px]">
						{allStatuses.map((s) => (
							<button
								key={s}
								onClick={() => {
									setPreset('all');
									setStatusFilter(
										statusFilter.includes(s)
											? statusFilter.filter((x) => x !== s)
											: [...statusFilter, s]
									);
								}}
								className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
							>
								<span className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center transition-colors ${
									statusFilter.includes(s)
										? 'bg-cyan-500 border-cyan-500 text-white'
										: 'border-[var(--text-muted)]/30'
								}`}>
									{statusFilter.includes(s) && (
										<svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
									)}
								</span>
								<span className="capitalize">{s}</span>
							</button>
						))}
						<div className="border-t border-[var(--border-default)] mt-1 pt-1 px-3 py-1">
							<button
								onClick={() => { setShowStatusDrop(false); setStatusFilter([]); }}
								className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
							>
								Clear
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Category dropdown */}
			<div className="relative" ref={catRef}>
				<button
					onClick={() => { setShowCatDrop(!showCatDrop); setShowStatusDrop(false); }}
					className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors ${
						categoryFilter.length > 0
							? 'border-[var(--border-active)] text-[var(--text-primary)] bg-[var(--surface-muted)]'
							: 'border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
					}`}
				>
					Category{categoryFilter.length > 0 && ` (${categoryFilter.length})`}
					<ChevronDown className="w-3 h-3" />
				</button>
				{showCatDrop && (
					<div className="absolute top-full left-0 mt-1 z-50 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg shadow-xl py-1.5 min-w-[160px]">
						{allCategories.map((c) => (
							<button
								key={c}
								onClick={() => {
									setPreset('all');
									setCategoryFilter(
										categoryFilter.includes(c)
											? categoryFilter.filter((x) => x !== c)
											: [...categoryFilter, c]
									);
								}}
								className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
							>
								<span className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center transition-colors ${
									categoryFilter.includes(c)
										? 'bg-cyan-500 border-cyan-500 text-white'
										: 'border-[var(--text-muted)]/30'
								}`}>
									{categoryFilter.includes(c) && (
										<svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
									)}
								</span>
								<span className="capitalize">{c}</span>
							</button>
						))}
						<div className="border-t border-[var(--border-default)] mt-1 pt-1 px-3 py-1">
							<button
								onClick={() => { setShowCatDrop(false); setCategoryFilter([]); }}
								className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
							>
								Clear
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Clear all filters */}
			{hasFilters && (
				<button
					onClick={() => {
						setPreset('all');
						setSearch('');
						setStatusFilter([]);
						setCategoryFilter([]);
					}}
					className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
				>
					<X className="w-3 h-3" />
					Clear all
				</button>
			)}

			<span className="flex-1" />

			{/* Search */}
			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
				<input
					type="text"
					placeholder="Search..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-44 pl-7 pr-3 py-1 text-[11px] rounded-md bg-[var(--surface-sunken)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
				/>
			</div>

			{/* Count */}
			<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
				{hasFilters ? `${filteredCount} of ${totalCount}` : totalCount}
			</span>
		</div>
	);
}

// =============================================================================
// CONTEXT MENU
// =============================================================================

function ProjectContextMenu({
	x,
	y,
	project,
	slug,
	groups,
	onClose,
	onMove,
	onPin,
}: {
	x: number;
	y: number;
	project: ProjectData;
	slug: string;
	groups: { slug: string; name: string }[];
	onClose: () => void;
	onMove: (slug: string, targetGroup: string) => void;
	onPin: (slug: string) => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [onClose]);

	const items = [
		{
			label: 'Open in Finder',
			icon: FolderOpen,
			action: () => {
				// Copy the path so user can use it
				navigator.clipboard.writeText(project.path);
				onClose();
			},
		},
		{
			label: 'Copy Path',
			icon: Terminal,
			action: () => {
				navigator.clipboard.writeText(`cd ${project.path}`);
				onClose();
			},
		},
		{ separator: true },
		{
			label: 'Pin to Top',
			icon: Pin,
			action: () => {
				onPin(slug);
				onClose();
			},
		},
		{ separator: true },
	];

	return (
		<div
			ref={menuRef}
			className="fixed z-[9999] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg shadow-xl py-1 min-w-[180px]"
			style={{ left: x, top: y }}
		>
			{items.map((item, i) =>
				'separator' in item ? (
					<div key={i} className="border-t border-[var(--border-default)] my-1" />
				) : (
					<button
						key={i}
						onClick={item.action}
						className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
					>
						{item.icon && <item.icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
						{item.label}
					</button>
				)
			)}

			{/* Move to submenu */}
			<div
				className="relative"
				onMouseEnter={() => setShowMoveSubmenu(true)}
				onMouseLeave={() => setShowMoveSubmenu(false)}
			>
				<button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
					<FolderInput className="w-3.5 h-3.5 text-[var(--text-muted)]" />
					Move to...
					<ChevronRight className="w-3 h-3 ml-auto" />
				</button>
				{showMoveSubmenu && (
					<div className="absolute left-full top-0 ml-1 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg shadow-xl py-1 min-w-[140px]">
						<button
							onClick={() => { onMove(slug, '_root'); onClose(); }}
							className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
						>
							Top level
						</button>
						{groups.map((g) => (
							<button
								key={g.slug}
								onClick={() => { onMove(slug, g.slug); onClose(); }}
								className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
							>
								{g.name}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// =============================================================================
// GROUP CONTEXT MENU
// =============================================================================

function GroupContextMenu({
	x,
	y,
	groupSlug,
	groupName,
	groupPath,
	projectCount,
	onClose,
	onEditGroup,
	onDeleteGroup,
}: {
	x: number;
	y: number;
	groupSlug: string;
	groupName: string;
	groupPath: string;
	projectCount: number;
	onClose: () => void;
	onEditGroup: (slug: string) => void;
	onDeleteGroup: (slug: string) => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [onClose]);

	return (
		<div
			ref={menuRef}
			className="fixed z-[9999] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg shadow-xl py-1 min-w-[180px]"
			style={{ left: x, top: y }}
		>
			<button
				onClick={() => { onEditGroup(groupSlug); onClose(); }}
				className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
			>
				<FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				Edit GROUP.md
			</button>
			<button
				onClick={() => { navigator.clipboard.writeText(groupPath || groupSlug); onClose(); }}
				className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
			>
				<Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				Copy Path
			</button>
			<div className="border-t border-[var(--border-default)] my-1" />
			<button
				onClick={() => { onDeleteGroup(groupSlug); onClose(); }}
				disabled={projectCount > 0}
				className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] ${
					projectCount > 0
						? 'text-[var(--text-muted)] cursor-not-allowed'
						: 'text-red-400 hover:bg-red-500/10'
				}`}
			>
				<Trash2 className="w-3.5 h-3.5" />
				{projectCount > 0 ? `Delete (${projectCount} projects)` : 'Delete Group'}
			</button>
		</div>
	);
}

// =============================================================================
// NEW GROUP MODAL
// =============================================================================

function NewGroupModal({
	onClose,
	onCreate,
}: {
	onClose: () => void;
	onCreate: (name: string, description: string) => void;
}) {
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => { inputRef.current?.focus(); }, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (name.trim()) {
			onCreate(name.trim(), description.trim());
		}
	};

	return (
		<div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30" onClick={onClose}>
			<form
				onSubmit={handleSubmit}
				onClick={(e) => e.stopPropagation()}
				className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl shadow-2xl p-5 w-[360px]"
			>
				<h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">New Project Group</h3>
				<input
					ref={inputRef}
					type="text"
					placeholder="Group name..."
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 mb-2"
				/>
				<textarea
					placeholder="Description (optional)..."
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					rows={2}
					className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 mb-3 resize-none"
				/>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!name.trim()}
						className="px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Create
					</button>
				</div>
			</form>
		</div>
	);
}

// =============================================================================
// DETAIL PANEL (Slide-over)
// =============================================================================

function DetailPanel({
	slug,
	detailType = 'project',
	onClose,
}: {
	slug: string;
	detailType?: 'project' | 'group';
	onClose: () => void;
}) {
	const [data, setData] = useState<{ project: ProjectData } | null>(null);
	const [groupData, setGroupData] = useState<GroupData | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		setData(null);
		setGroupData(null);
		const url = detailType === 'group'
			? `${API_BASE}/api/projects/groups/${slug}`
			: `${API_BASE}/api/projects/${slug}`;
		fetch(url)
			.then((r) => r.json())
			.then((d) => {
				if (detailType === 'group') setGroupData(d);
				else setData(d);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, [slug, detailType]);

	const p = data?.project ?? null;

	const bodyContent = useMemo(() => {
		if (!p?.project_md) return '';
		let text = p.project_md;
		if (text.startsWith('---')) {
			const end = text.indexOf('---', 3);
			if (end !== -1) text = text.slice(end + 3).trim();
		}
		const lines = text.split('\n');
		const titleIdx = lines.findIndex((l) => l.startsWith('# '));
		if (titleIdx !== -1) lines.splice(titleIdx, 1);
		return lines.join('\n').trim();
	}, [p?.project_md]);

	const historyContent = useMemo(() => {
		if (!p?.history_md) return '';
		return p.history_md.replace(/^# History\s*\n?/, '').trim();
	}, [p?.history_md]);

	// Extract sections from body
	const sections = useMemo(() => {
		if (!bodyContent) return [];
		const parts = bodyContent.split(/(?=^## )/m).filter(Boolean);
		return parts.map((part) => {
			const lines = part.trim().split('\n');
			const heading = lines[0]?.replace('## ', '') || '';
			const content = lines.slice(1).join('\n').trim();
			return { heading, content };
		});
	}, [bodyContent]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	// Group detail view
	if (detailType === 'group') {
		if (!groupData) {
			return (
				<div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
					Group not found
				</div>
			);
		}
		const groupBody = groupData.group_md || '';
		// Strip frontmatter and title
		let cleanBody = groupBody;
		if (cleanBody.startsWith('---')) {
			const end = cleanBody.indexOf('---', 3);
			if (end !== -1) cleanBody = cleanBody.slice(end + 3).trim();
		}
		const bodyLines = cleanBody.split('\n');
		const titleIdx = bodyLines.findIndex((l) => l.startsWith('# '));
		if (titleIdx !== -1) bodyLines.splice(titleIdx, 1);
		cleanBody = bodyLines.join('\n').trim();

		return (
			<div className="flex flex-col h-full">
				<div className="px-5 pt-4 pb-3 border-b border-[var(--border-default)] shrink-0">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 mb-1.5">
								<FolderGit2 className="w-4 h-4 text-cyan-400 shrink-0" />
								<h1 className="text-base font-semibold text-[var(--text-primary)] leading-tight truncate">{groupData.name}</h1>
							</div>
							<span className="text-[10px] text-[var(--text-muted)]">Project Group</span>
						</div>
						<button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-muted)]">
							<X className="w-4 h-4" />
						</button>
					</div>
					{groupData.description && (
						<p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">{groupData.description}</p>
					)}
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-4">
					{cleanBody ? (
						<div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-1.5">
							{cleanBody.split('\n').filter(Boolean).map((line, i) => {
								if (line.startsWith('## ')) {
									return <h3 key={i} className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mt-3 mb-1">{line.replace('## ', '')}</h3>;
								}
								if (line.startsWith('- ')) {
									return (
										<p key={i} className="relative pl-3 before:content-['\u00B7'] before:absolute before:left-0 before:text-[var(--text-muted)]">
											{line.replace(/^- /, '').replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')}
										</p>
									);
								}
								return <p key={i}>{line.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')}</p>;
							})}
						</div>
					) : (
						<div className="text-center py-8">
							<FileText className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-20" />
							<p className="text-xs text-[var(--text-muted)]">No GROUP.md yet</p>
							<p className="text-[10px] text-[var(--text-muted)] mt-1">Right-click the group header to create one</p>
						</div>
					)}
				</div>
				<div className="px-5 py-3 border-t border-[var(--border-default)] shrink-0 flex items-center gap-2">
					<button
						onClick={() => navigator.clipboard.writeText(groupData.path)}
						className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
					>
						<Terminal className="w-3.5 h-3.5" />
						Copy Path
					</button>
				</div>
			</div>
		);
	}

	if (!p) {
		return (
			<div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
				Project not found
			</div>
		);
	}

	const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.archived;
	const catColors = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other;
	const chatMessage = `[Project] ${p.name}${p.description ? ` -- ${p.description.slice(0, 120)}` : ''}`;

	// Find interview value section
	const ivSection = sections.find((s) => s.heading === 'Interview Value');

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="px-5 pt-4 pb-3 border-b border-[var(--border-default)] shrink-0">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-1.5">
							<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusStyle.dot}`} />
							<h1 className="text-base font-semibold text-[var(--text-primary)] leading-tight truncate">{p.name}</h1>
						</div>
						<div className="flex items-center gap-1.5 mb-2">
							<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] ${catColors.accent}`}>
								{p.category}
							</span>
							<span className="text-[10px] text-[var(--text-muted)]">{statusStyle.label}</span>
						</div>
						{p.description && (
							<p className="text-xs text-[var(--text-secondary)] leading-relaxed">{p.description}</p>
						)}
					</div>
					<button
						onClick={onClose}
						className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-muted)]"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
				{/* Tech stack */}
				{p.tech.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-2">
						{p.tech.map((t) => (
							<span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
								{t}
							</span>
						))}
					</div>
				)}
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto">
				{/* Interview Value callout */}
				{ivSection && (
					<div className="mx-5 mt-4 p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
						<div className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider mb-1">
							Interview Value: {p.interview_value}
						</div>
						<div className="text-xs text-[var(--text-secondary)] leading-relaxed">
							{ivSection.content.split('\n').filter(Boolean).slice(0, 4).map((line, i) => (
								<p key={i} className="mb-1">{line.replace(/^\*{1,2}([^*]+)\*{1,2}/, '$1').replace(/^- /, '')}</p>
							))}
						</div>
					</div>
				)}

				{/* Other sections */}
				<div className="px-5 py-4 space-y-4">
					{sections
						.filter((s) => s.heading !== 'Interview Value' && s.heading !== 'Media')
						.map((section, i) => (
							<div key={i}>
								<h3 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
									{section.heading}
								</h3>
								<div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-1.5">
									{section.content.split('\n').filter(Boolean).map((line, j) => {
										if (line.startsWith('- ')) {
											return (
												<p key={j} className="relative pl-3 before:content-['\u00B7'] before:absolute before:left-0 before:text-[var(--text-muted)]">
													{line.replace(/^- /, '').replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')}
												</p>
											);
										}
										return <p key={j}>{line.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')}</p>;
									})}
								</div>
							</div>
						))}

					{/* Git repos */}
					{p.git.length > 0 && (
						<div>
							<h3 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
								{p.git.length === 1 ? 'Repository' : `Repositories (${p.git.length})`}
							</h3>
							<GitSection repos={p.git} />
						</div>
					)}

					{/* History */}
					{historyContent && (
						<div>
							<h3 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
								History
							</h3>
							<div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-2.5">
								{historyContent.split(/(?=^## )/m).filter(Boolean).slice(0, 5).map((entry, i) => {
									const lines = entry.trim().split('\n');
									const dateMatch = lines[0]?.match(/^## (\d{4}-\d{2}-\d{2})/);
									return (
										<div key={i} className="pl-3 border-l-2 border-[var(--border-default)]">
											{dateMatch && (
												<div className="text-[10px] font-mono text-[var(--text-muted)] mb-0.5">
													{dateMatch[1]}
												</div>
											)}
											{lines.slice(dateMatch ? 1 : 0).filter(Boolean).slice(0, 3).map((line, j) => (
												<p key={j} className="mb-0.5">{line}</p>
											))}
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Actions bar */}
			<div className="px-5 py-3 border-t border-[var(--border-default)] shrink-0 flex items-center gap-2">
				<button
					onClick={() => navigator.clipboard.writeText(p.path)}
					className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
				>
					<Terminal className="w-3.5 h-3.5" />
					Copy Path
				</button>
				<span className="flex-1" />
				<ChatButton message={chatMessage} app="Project" size="md" />
			</div>
		</div>
	);
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProjectsWindowContent() {
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [groupsList, setGroupsList] = useState<{ slug: string; name: string; project_count: number }[]>([]);

	// Filters
	const [preset, setPreset] = useState<FilterPreset>('all');
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<string[]>([]);
	const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

	// Selection & panels
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
	const [selectedType, setSelectedType] = useState<'project' | 'group'>('project');
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['deprecated']));
	const [pinnedSlugs, setPinnedSlugs] = useState<Set<string>>(() => {
		try {
			const stored = localStorage.getItem('projects-pinned');
			return stored ? new Set(JSON.parse(stored)) : new Set();
		} catch { return new Set(); }
	});

	// Context menus
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slug: string; project: ProjectData } | null>(null);
	const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; slug: string; name: string; projectCount: number; path: string } | null>(null);
	const [showNewGroupModal, setShowNewGroupModal] = useState(false);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const [treeRes, groupsRes] = await Promise.all([
				fetch(`${API_BASE}/api/projects/`),
				fetch(`${API_BASE}/api/projects/groups`),
			]);
			if (!treeRes.ok) throw new Error('Failed to load projects');
			const treeData = await treeRes.json();
			setTree(treeData);
			if (groupsRes.ok) {
				setGroupsList(await groupsRes.json());
			}
			setError(null);
		} catch (err) {
			console.error('Error loading projects:', err);
			setError('Failed to load projects');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { loadData(); }, [loadData]);

	// Save pinned state
	useEffect(() => {
		localStorage.setItem('projects-pinned', JSON.stringify([...pinnedSlugs]));
	}, [pinnedSlugs]);

	// Flatten all projects and extract group metadata
	const allProjects = useMemo(() => flattenProjects(tree), [tree]);
	const groupMeta = useMemo(() => extractGroupMeta(tree), [tree]);

	// Collect unique categories and statuses
	const allCategories = useMemo(() => [...new Set(allProjects.map((p) => p.project.category))].sort(), [allProjects]);
	const allStatuses = useMemo(() => [...new Set(allProjects.map((p) => p.project.status))].sort(), [allProjects]);

	// Apply filters
	const filtered = useMemo(() => {
		let result = allProjects;

		// Preset filters
		if (preset === 'active') {
			result = result.filter((p) => p.project.status === 'active');
		} else if (preset === 'interview') {
			result = result.filter((p) =>
				p.project.interview_value === 'HIGH' || p.project.interview_value === 'MEDIUM-HIGH'
			);
		}

		// Dropdown filters
		if (statusFilter.length > 0) {
			result = result.filter((p) => statusFilter.includes(p.project.status));
		}
		if (categoryFilter.length > 0) {
			result = result.filter((p) => categoryFilter.includes(p.project.category));
		}

		// Text search
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter((p) =>
				p.project.name.toLowerCase().includes(q) ||
				(p.project.description || '').toLowerCase().includes(q) ||
				p.project.tech.some((t) => t.toLowerCase().includes(q)) ||
				p.project.category.toLowerCase().includes(q)
			);
		}

		return result;
	}, [allProjects, preset, statusFilter, categoryFilter, search]);

	// Group filtered projects by their group, sorted by activity
	const groupedProjects = useMemo(() => {
		const groupMap = new Map<string, FlatProject[]>();

		for (const p of filtered) {
			const group = p.group;
			if (!groupMap.has(group)) groupMap.set(group, []);
			groupMap.get(group)!.push(p);
		}

		// Include empty groups from tree (so they show up for management)
		if (preset === 'all' && !search.trim() && statusFilter.length === 0 && categoryFilter.length === 0) {
			for (const node of tree) {
				if (node.type === 'group' && !groupMap.has(node.slug)) {
					groupMap.set(node.slug, []);
				}
			}
		}

		// Sort projects within each group: pinned first, then by activity
		for (const [, projects] of groupMap) {
			projects.sort((a, b) => {
				const aPinned = pinnedSlugs.has(a.slug);
				const bPinned = pinnedSlugs.has(b.slug);
				if (aPinned !== bPinned) return aPinned ? -1 : 1;
				return latestCommitUnix(b.project) - latestCommitUnix(a.project);
			});
		}

		// Sort groups: groups with most recent activity first, _root first
		const entries = [...groupMap.entries()].sort((a, b) => {
			if (a[0] === '_root') return -1;
			if (b[0] === '_root') return 1;
			const aMax = Math.max(0, ...a[1].map((p) => latestCommitUnix(p.project)));
			const bMax = Math.max(0, ...b[1].map((p) => latestCommitUnix(p.project)));
			return bMax - aMax;
		});

		return entries;
	}, [filtered, pinnedSlugs, tree, preset, search, statusFilter, categoryFilter]);

	const toggleGroup = useCallback((group: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(group)) next.delete(group);
			else next.add(group);
			return next;
		});
	}, []);

	const handlePin = useCallback((slug: string) => {
		setPinnedSlugs((prev) => {
			const next = new Set(prev);
			if (next.has(slug)) next.delete(slug);
			else next.add(slug);
			return next;
		});
	}, []);

	const handleMove = useCallback(async (slug: string, targetGroup: string) => {
		try {
			const res = await fetch(`${API_BASE}/api/projects/${slug}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ target_group: targetGroup }),
			});
			if (res.ok) {
				await loadData();
			}
		} catch (err) {
			console.error('Move failed:', err);
		}
	}, [loadData]);

	const handleContextMenu = useCallback((e: React.MouseEvent, slug: string, project: ProjectData) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, slug, project });
	}, []);

	const handleGroupContextMenu = useCallback((e: React.MouseEvent, groupSlug: string, name: string, projectCount: number, path: string) => {
		e.preventDefault();
		e.stopPropagation();
		setGroupContextMenu({ x: e.clientX, y: e.clientY, slug: groupSlug, name, projectCount, path });
	}, []);

	const handleGroupClick = useCallback((groupSlug: string) => {
		if (selectedSlug === groupSlug && selectedType === 'group') {
			setSelectedSlug(null);
		} else {
			setSelectedSlug(groupSlug);
			setSelectedType('group');
		}
	}, [selectedSlug, selectedType]);

	const handleCreateGroup = useCallback(async (name: string, description: string) => {
		try {
			const res = await fetch(`${API_BASE}/api/projects/groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, description }),
			});
			if (res.ok) {
				setShowNewGroupModal(false);
				await loadData();
			}
		} catch (err) {
			console.error('Create group failed:', err);
		}
	}, [loadData]);

	const handleDeleteGroup = useCallback(async (slug: string) => {
		try {
			const res = await fetch(`${API_BASE}/api/projects/groups/${slug}`, { method: 'DELETE' });
			if (res.ok) {
				if (selectedSlug === slug) setSelectedSlug(null);
				await loadData();
			}
		} catch (err) {
			console.error('Delete group failed:', err);
		}
	}, [loadData, selectedSlug]);

	const handleEditGroup = useCallback((slug: string) => {
		setSelectedSlug(slug);
		setSelectedType('group');
	}, []);

	const groupDisplayName = (group: string) => {
		if (group === '_root') return 'Top Level';
		const meta = groupMeta.get(group);
		if (meta?.name) return meta.name;
		return group.split('/').pop()!.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	};

	if (loading && tree.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center h-full">
				<Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center h-full">
				<div className="text-center">
					<p className="text-[var(--text-muted)] text-sm mb-3">{error}</p>
					<button onClick={loadData} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1.5 mx-auto">
						<RefreshCw className="w-3.5 h-3.5" />
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Filter bar */}
			<FilterBar
				preset={preset}
				setPreset={setPreset}
				search={search}
				setSearch={setSearch}
				statusFilter={statusFilter}
				setStatusFilter={setStatusFilter}
				categoryFilter={categoryFilter}
				setCategoryFilter={setCategoryFilter}
				allCategories={allCategories}
				allStatuses={allStatuses}
				totalCount={allProjects.length}
				filteredCount={filtered.length}
			/>
			{/* Subheader with New Group */}
			<div className="px-4 py-1.5 border-b border-[var(--border-default)] flex items-center">
				<button
					onClick={() => setShowNewGroupModal(true)}
					className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] rounded-md transition-colors"
				>
					<Plus className="w-3.5 h-3.5" />
					New Group
				</button>
			</div>

			{/* Main content: card grid + optional detail panel */}
			<div className="flex flex-1 min-h-0">
				{/* Card grid */}
				<div className="flex-1 overflow-y-auto py-3 px-4">
					{groupedProjects.length === 0 ? (
						<div className="text-center py-12">
							<FolderGit2 className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-20" />
							<p className="text-sm text-[var(--text-muted)]">No projects match</p>
						</div>
					) : (
						<div className="space-y-5">
							{groupedProjects.map(([group, projects]) => {
								const isCollapsed = collapsedGroups.has(group);
								return (
									<div key={group}>
										{/* Group header */}
										{group !== '_root' && (
											<div className="flex items-center gap-2 mb-2.5 group">
												<button
													onClick={() => toggleGroup(group)}
													className="shrink-0 p-0.5 rounded hover:bg-[var(--surface-muted)]"
												>
													{isCollapsed ? (
														<ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
													) : (
														<ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
													)}
												</button>
												<button
													onClick={() => handleGroupClick(group)}
													onContextMenu={(e) => handleGroupContextMenu(e, group, groupDisplayName(group), projects.length, groupMeta.get(group)?.path || '')}
													className={`text-[12px] font-semibold uppercase tracking-wider transition-colors ${
														selectedSlug === group && selectedType === 'group'
															? 'text-cyan-400'
															: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
													}`}
												>
													{groupDisplayName(group)}
												</button>
												<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
													{projects.length}
												</span>
												{groupMeta.get(group)?.has_group_md && (
													<FileText className="w-3 h-3 text-[var(--text-muted)] opacity-50" />
												)}
												<span className="flex-1 border-b border-[var(--border-default)] ml-2" />
											</div>
										)}

										{/* Cards grid */}
										{!isCollapsed && (
											projects.length > 0 ? (
												<div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
													{projects.map((p) => (
														<ProjectCard
															key={p.slug}
															project={p.project}
															slug={p.slug}
															isSelected={selectedSlug === p.slug && selectedType === 'project'}
															onClick={() => {
																if (selectedSlug === p.slug && selectedType === 'project') {
																	setSelectedSlug(null);
																} else {
																	setSelectedSlug(p.slug);
																	setSelectedType('project');
																}
															}}
															onContextMenu={(e) => handleContextMenu(e, p.slug, p.project)}
														/>
													))}
												</div>
											) : (
												<div className="py-4 text-center text-[11px] text-[var(--text-muted)] border border-dashed border-[var(--border-default)] rounded-lg">
													Empty group
												</div>
											)
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Detail panel (slide-over) */}
				{selectedSlug && (
					<div className="w-[400px] shrink-0 border-l border-[var(--border-default)] bg-[var(--surface-raised)]">
						<DetailPanel slug={selectedSlug} detailType={selectedType} onClose={() => setSelectedSlug(null)} />
					</div>
				)}
			</div>

			{/* Context menu */}
			{contextMenu && (
				<ProjectContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					project={contextMenu.project}
					slug={contextMenu.slug}
					groups={groupsList.map((g) => ({ slug: g.slug, name: g.name }))}
					onClose={() => setContextMenu(null)}
					onMove={handleMove}
					onPin={handlePin}
				/>
			)}

			{/* Group context menu */}
			{groupContextMenu && (
				<GroupContextMenu
					x={groupContextMenu.x}
					y={groupContextMenu.y}
					groupSlug={groupContextMenu.slug}
					groupName={groupContextMenu.name}
					groupPath={groupContextMenu.path}
					projectCount={groupContextMenu.projectCount}
					onClose={() => setGroupContextMenu(null)}
					onEditGroup={handleEditGroup}
					onDeleteGroup={handleDeleteGroup}
				/>
			)}

			{/* New group modal */}
			{showNewGroupModal && (
				<NewGroupModal
					onClose={() => setShowNewGroupModal(false)}
					onCreate={handleCreateGroup}
				/>
			)}
		</div>
	);
}
