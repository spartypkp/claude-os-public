'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, FolderGit2, RefreshCw, Search } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import {
	TreeItem,
	GitSection,
	STATUS_STYLES,
	CATEGORY_COLORS,
	type TreeNode,
	type ProjectData,
} from './ProjectCard';
import { ChatButton } from '@/components/shared/ChatButton';

// =============================================================================
// HELPERS
// =============================================================================

function latestCommitUnix(p: ProjectData): number {
	if (p.git.length === 0) return 0;
	return Math.max(...p.git.map((g) => g.last_commit_unix));
}

function sortTreeByActivity(nodes: TreeNode[]): TreeNode[] {
	const getNodeTimestamp = (node: TreeNode): number => {
		if (node.type === 'project' && node.project) return latestCommitUnix(node.project);
		if (node.type === 'group' && node.children) {
			return Math.max(0, ...node.children.map(getNodeTimestamp));
		}
		return 0;
	};
	return [...nodes]
		.map((node) => {
			if (node.type === 'group' && node.children) {
				return { ...node, children: sortTreeByActivity(node.children) };
			}
			return node;
		})
		.sort((a, b) => getNodeTimestamp(b) - getNodeTimestamp(a));
}

function flattenProjects(nodes: TreeNode[]): { slug: string; project: ProjectData }[] {
	const result: { slug: string; project: ProjectData }[] = [];
	for (const node of nodes) {
		if (node.type === 'project' && node.project) {
			result.push({ slug: node.slug, project: node.project });
		}
		if (node.type === 'group' && node.children) {
			result.push(...flattenProjects(node.children));
		}
	}
	return result;
}

function filterTree(nodes: TreeNode[], predicate: (p: ProjectData) => boolean): TreeNode[] {
	const result: TreeNode[] = [];
	for (const node of nodes) {
		if (node.type === 'project' && node.project && predicate(node.project)) {
			result.push(node);
		} else if (node.type === 'group' && node.children) {
			const filteredChildren = filterTree(node.children, predicate);
			if (filteredChildren.length > 0) {
				result.push({ ...node, children: filteredChildren });
			}
		}
	}
	return result;
}

function findNode(nodes: TreeNode[], slug: string): TreeNode | null {
	for (const n of nodes) {
		if (n.slug === slug) return n;
		if (n.children) {
			const found = findNode(n.children, slug);
			if (found) return found;
		}
	}
	return null;
}

// =============================================================================
// DETAIL PANEL
// =============================================================================

function DetailPanel({ slug }: { slug: string }) {
	const [data, setData] = useState<{ project: ProjectData } | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		fetch(`${API_BASE}/api/projects/${slug}`)
			.then((r) => r.json())
			.then((d) => {
				setData(d);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, [slug]);

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

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	if (!p) {
		return (
			<div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
				Project not found
			</div>
		);
	}

	const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.archived;
	const catColors = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other;
	const chatMessage = `[Project] ${p.name}${p.description ? ` — ${p.description.slice(0, 120)}` : ''}`;

	const statusBadge = statusStyle.dot === 'bg-emerald-400'
		? 'bg-emerald-500/15 text-emerald-400'
		: statusStyle.dot === 'bg-blue-400'
			? 'bg-blue-500/15 text-blue-400'
			: statusStyle.dot === 'bg-amber-400'
				? 'bg-amber-500/15 text-amber-400'
				: 'bg-gray-500/15 text-gray-400';

	return (
		<div className="flex-1 overflow-y-auto">
			{/* Header */}
			<div className="px-6 pt-5 pb-4 border-b border-[var(--border-default)]">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-2">
							<h1 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">{p.name}</h1>
							<span className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${statusBadge}`}>
								<span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
								{statusStyle.label}
							</span>
							{p.category !== 'other' && (
								<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${catColors.accent} bg-[var(--surface-sunken)]`}>
									{p.category}
								</span>
							)}
						</div>
						{p.description && (
							<p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
								{p.description}
							</p>
						)}
						{p.tech.length > 0 && (
							<div className="flex flex-wrap gap-1">
								{p.tech.map((t) => (
									<span
										key={t}
										className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
									>
										{t}
									</span>
								))}
							</div>
						)}
					</div>
					<ChatButton message={chatMessage} app="Project" size="md" />
				</div>
			</div>

			{/* Body — rendered PROJECT.md content */}
			{bodyContent && (
				<div className="px-6 py-4 border-b border-[var(--border-default)]">
					<div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-2">
						{bodyContent.split('\n\n').map((block, i) => {
							if (block.startsWith('## ')) {
								return (
									<h3 key={i} className="text-[13px] font-semibold text-[var(--text-primary)] mt-3 first:mt-0">
										{block.replace('## ', '')}
									</h3>
								);
							}
							if (block.startsWith('- ')) {
								return (
									<ul key={i} className="space-y-0.5 ml-3">
										{block.split('\n').map((line, j) => (
											<li key={j} className="relative pl-3 before:content-['·'] before:absolute before:left-0 before:text-[var(--text-muted)]">
												{line.replace(/^- /, '')}
											</li>
										))}
									</ul>
								);
							}
							if (block.startsWith('_') && block.endsWith('_')) {
								return (
									<p key={i} className="italic text-[var(--text-muted)]">
										{block.slice(1, -1)}
									</p>
								);
							}
							return <p key={i}>{block}</p>;
						})}
					</div>
				</div>
			)}

			{/* Git + History side by side when both exist, or stacked */}
			<div className="px-6 py-4 space-y-4">
				{/* Git repos — compact inline */}
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
							{historyContent.split(/(?=^## )/m).filter(Boolean).slice(0, 10).map((entry, i) => {
								const lines = entry.trim().split('\n');
								const dateMatch = lines[0]?.match(/^## (\d{4}-\d{2}-\d{2})/);
								return (
									<div key={i} className="pl-3 border-l-2 border-[var(--border-default)]">
										{dateMatch && (
											<div className="text-[10px] font-mono text-[var(--text-muted)] mb-0.5">
												{dateMatch[1]}
											</div>
										)}
										{lines.slice(dateMatch ? 1 : 0).filter(Boolean).map((line, j) => (
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
	);
}

// =============================================================================
// GROUP DETAIL
// =============================================================================

function GroupDetail({ node, onSelect }: { node: TreeNode; onSelect: (slug: string) => void }) {
	const children = node.children || [];
	return (
		<div className="flex-1 overflow-y-auto">
			<div className="px-6 pt-5 pb-4 border-b border-[var(--border-default)]">
				<h1 className="text-lg font-semibold text-[var(--text-primary)] leading-tight mb-1">{node.slug}</h1>
				<p className="text-xs text-[var(--text-secondary)]">
					{children.length} project{children.length !== 1 ? 's' : ''}
				</p>
			</div>
			<div className="px-6 py-4 space-y-2">
				{children.map((child) => {
					const p = child.project;
					if (!p) return null;
					const latestGit = p.git.length > 0
						? p.git.reduce((a, b) => (a.last_commit_unix > b.last_commit_unix ? a : b))
						: null;
					return (
						<button
							key={child.slug}
							onClick={() => onSelect(child.slug)}
							className="w-full text-left rounded-lg bg-[var(--surface-sunken)] p-3 hover:bg-[var(--surface-hover)] transition-colors"
						>
							<div className="flex items-center justify-between mb-1">
								<span className="text-xs font-medium text-[var(--text-primary)]">{p.name}</span>
								{latestGit && (
									<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
										{latestGit.last_commit_ago}
									</span>
								)}
							</div>
							{p.description && (
								<p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-1.5">{p.description}</p>
							)}
							{p.tech.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{p.tech.slice(0, 5).map((t) => (
										<span key={t} className="px-1.5 py-0.5 text-[9px] rounded bg-[var(--surface-default)] text-[var(--text-muted)]">
											{t}
										</span>
									))}
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyDetail({ projectCount }: { projectCount: number }) {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center">
				<FolderGit2 className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-20" />
				<p className="text-sm text-[var(--text-muted)] font-medium">{projectCount} projects</p>
				<p className="text-[11px] text-[var(--text-muted)] opacity-50 mt-1">Select a project</p>
			</div>
		</div>
	);
}

// =============================================================================
// MAIN
// =============================================================================

export function ProjectsWindowContent() {
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const response = await fetch(`${API_BASE}/api/projects/`);
			if (!response.ok) throw new Error('Failed to load projects');
			const data = await response.json();
			const sorted = sortTreeByActivity(data);
			setTree(sorted);
			setError(null);

			// Auto-expand all groups and select most recent project
			const groupSlugs = new Set<string>();
			const collectGroups = (nodes: TreeNode[]) => {
				for (const n of nodes) {
					if (n.type === 'group') {
						groupSlugs.add(n.slug);
						if (n.children) collectGroups(n.children);
					}
				}
			};
			collectGroups(sorted);
			setExpandedGroups(groupSlugs);

			const allFlat = flattenProjects(sorted);
			if (allFlat.length > 0) {
				const mostRecent = allFlat.reduce((best, cur) =>
					latestCommitUnix(cur.project) > latestCommitUnix(best.project) ? cur : best
				);
				setSelectedSlug(mostRecent.slug);
			}
		} catch (err) {
			console.error('Error loading projects:', err);
			setError('Failed to load projects');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const toggleGroup = useCallback((slug: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(slug)) next.delete(slug);
			else next.add(slug);
			return next;
		});
	}, []);

	const allProjects = useMemo(() => flattenProjects(tree), [tree]);

	const filteredTree = useMemo(() => {
		if (!search.trim()) return tree;
		const q = search.toLowerCase();
		return filterTree(tree, (p) =>
			p.name.toLowerCase().includes(q) ||
			(p.description || '').toLowerCase().includes(q) ||
			p.tech.some((t) => t.toLowerCase().includes(q)) ||
			p.category.toLowerCase().includes(q)
		);
	}, [tree, search]);

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
					<button
						onClick={loadData}
						className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1.5 mx-auto"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Master-Detail Layout */}
			<div className="flex flex-1 min-h-0">
				{/* Sidebar */}
				<div className="w-64 shrink-0 border-r border-[var(--border-default)] flex flex-col">
					{/* Search in sidebar */}
					<div className="p-2 border-b border-[var(--border-default)]">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
							<input
								type="text"
								placeholder="Search..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-[var(--surface-sunken)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
							/>
						</div>
					</div>

					{/* Tree */}
					<div className="flex-1 overflow-y-auto py-1">
						{filteredTree.length === 0 ? (
							<div className="text-center py-12">
								<p className="text-xs text-[var(--text-muted)]">No projects match</p>
							</div>
						) : (
							filteredTree.map((node) => (
								<TreeItem
									key={node.slug}
									node={node}
									depth={0}
									selectedSlug={selectedSlug}
									expandedGroups={expandedGroups}
									onSelect={setSelectedSlug}
									onToggleGroup={toggleGroup}
								/>
							))
						)}
					</div>

					{/* Bottom count */}
					<div className="px-3 py-1.5 border-t border-[var(--border-default)] text-[10px] text-[var(--text-muted)] tabular-nums">
						{allProjects.length} projects
					</div>
				</div>

				{/* Detail panel */}
				{selectedSlug ? (
					(() => {
						const selectedNode = findNode(tree, selectedSlug);
						if (selectedNode?.type === 'group') {
							return <GroupDetail node={selectedNode} onSelect={setSelectedSlug} />;
						}
						return <DetailPanel slug={selectedSlug} />;
					})()
				) : (
					<EmptyDetail projectCount={allProjects.length} />
				)}
			</div>
		</div>
	);
}
