'use client';

import {
	Activity,
	ArrowUp,
	Brain,
	Check,
	CheckCheck,
	ChevronDown,
	ChevronRight,
	Clock,
	Filter,
	Inbox,
	Loader2,
	Mail,
	RefreshCw,
	Search,
	X,
	Zap,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE } from '@/lib/api';
import { ChatButton } from '@/components/shared/ChatButton';
import { SenderCard } from './SenderCard';

// ==========================================
// TYPES
// ==========================================

interface ClassifiedEmail {
	id: string;
	message_id: string;
	account_id: string;
	category: Category;
	summary: string | null;
	briefing: string | null;
	reasoning: string | null;
	display_name: string | null;
	sender: string | null;
	subject: string | null;
	preview: string | null;
	processing_time_ms: number | null;
	received_at: string | null;
	classified_at: string | null;
	suggested_actions?: string[];
	handled?: boolean;
}

interface RecentClassification {
	message_id: string;
	category: string;
	summary: string | null;
	display_name: string | null;
	sender: string | null;
	subject: string | null;
	processing_time_ms: number | null;
	classified_at: string | null;
}

interface PendingItem {
	message_id: string;
	account_id: string;
	received_at: string | null;
	queued_at: string | null;
}

interface PipelineStatus {
	total_tracked: number;
	classified: number;
	pending: number;
	action_needed_count: number;
	category_breakdown: Record<string, number>;
	avg_processing_ms: number | null;
	throughput_last_hour: number;
	error_count: number;
	max_workers: number;
	recent_classifications: RecentClassification[];
	pending_queue: PendingItem[];
}

type Category = 'action_needed' | 'heads_up' | 'fyi' | 'noise';
type ViewMode = 'inbox' | 'activity';
type InboxFilter = 'triage' | 'all';

const ALL_CATEGORIES: Category[] = ['action_needed', 'heads_up', 'fyi', 'noise'];
const DEFAULT_ACTIVE: Category[] = ['action_needed', 'heads_up', 'fyi'];
const PAGE_SIZE = 200;
const PIPELINE_POLL_MS = 8000;

// ==========================================
// CONSTANTS
// ==========================================

const CATEGORY_CONFIG: Record<Category, {
	color: string; bg: string; border: string; label: string;
	accent: string; dot: string;
}> = {
	action_needed: {
		color: 'text-red-400', bg: 'bg-red-500/12', border: 'border-red-500/30',
		label: 'Action', accent: 'border-l-red-400', dot: 'bg-red-400',
	},
	heads_up: {
		color: 'text-amber-400', bg: 'bg-amber-500/12', border: 'border-amber-500/30',
		label: 'Heads Up', accent: 'border-l-amber-400', dot: 'bg-amber-400',
	},
	fyi: {
		color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
		label: 'FYI', accent: 'border-l-blue-400/40', dot: 'bg-blue-400',
	},
	noise: {
		color: 'text-zinc-500', bg: 'bg-zinc-500/8', border: 'border-zinc-600/20',
		label: 'Noise', accent: 'border-l-zinc-700', dot: 'bg-zinc-600',
	},
};

// ==========================================
// HELPERS
// ==========================================

function formatRelativeTime(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);

	if (diffMins < 1) return 'now';
	if (diffMins < 60) return `${diffMins}m`;
	if (diffHours < 24) return `${diffHours}h`;

	const isToday = date.toDateString() === now.toDateString();
	if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('en-US', {
		weekday: 'short', month: 'short', day: 'numeric',
		hour: 'numeric', minute: '2-digit', hour12: true,
	});
}

function getDateGroup(dateStr: string | null): string {
	if (!dateStr) return 'Older';
	const date = new Date(dateStr);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	const thisWeek = new Date(today);
	thisWeek.setDate(today.getDate() - 7);

	if (date >= today) return 'Today';
	if (date >= yesterday) return 'Yesterday';
	if (date >= thisWeek) return 'This Week';
	return 'Older';
}

function extractSenderName(sender: string | null): string {
	if (!sender) return 'Unknown';
	const match = sender.match(/^(.+?)\s*</);
	if (match) return match[1].trim().replace(/"/g, '');
	if (sender.includes('@')) return sender.split('@')[0];
	return sender;
}

function extractSenderEmail(sender: string | null): string {
	if (!sender) return '';
	const match = sender.match(/<(.+?)>/);
	if (match) return match[1];
	return sender;
}

function accountShortName(email: string): string {
	// will@diamondquarters.com → "Work"
	// WillDiamond3@gmail.com → "Gmail"
	// wdiamond@contoural.com → "Contoural"
	// willdiamond.assistant@gmail.com → "Claude"
	const lower = email.toLowerCase();
	if (lower.includes('diamondquarters')) return 'Work';
	if (lower.includes('contoural')) return 'Contoural';
	if (lower.includes('assistant')) return 'Claude';
	if (lower.includes('gmail')) return 'Gmail';
	// Fallback: domain without TLD
	const domain = email.split('@')[1]?.split('.')[0];
	return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : '?';
}

function formatProcessingTime(ms: number | null): string {
	if (!ms) return '';
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function groupByDate(emails: ClassifiedEmail[]): { label: string; emails: ClassifiedEmail[] }[] {
	const groups = new Map<string, ClassifiedEmail[]>();
	const order: string[] = [];

	for (const email of emails) {
		const group = getDateGroup(email.received_at || email.classified_at);
		if (!groups.has(group)) {
			groups.set(group, []);
			order.push(group);
		}
		groups.get(group)!.push(email);
	}

	return order.map(label => ({ label, emails: groups.get(label)! }));
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function EmailWindowContent() {
	const [view, setView] = useState<ViewMode>('inbox');
	const [inboxFilter, setInboxFilter] = useState<InboxFilter>('triage');
	const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set(DEFAULT_ACTIVE));
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const [classifications, setClassifications] = useState<ClassifiedEmail[]>([]);
	const [classTotal, setClassTotal] = useState(0);
	const [classOffset, setClassOffset] = useState(0);
	const [triageCounts, setTriageCounts] = useState<Record<string, number>>({});
	const [totalUnhandled, setTotalUnhandled] = useState(0);
	const [handlingIds, setHandlingIds] = useState<Set<string>>(new Set());

	const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
	const [accountMap, setAccountMap] = useState<Record<string, string>>({}); // id → short name

	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const [emailBody, setEmailBody] = useState<string | null>(null);
	const [loadingBody, setLoadingBody] = useState(false);

	const [newCount, setNewCount] = useState(0);
	const latestClassifiedRef = useRef<string | null>(null);
	const suppressNewRef = useRef(false);

	// ── Category toggle ──

	const toggleCategory = useCallback((cat: Category) => {
		setActiveCategories(prev => {
			const next = new Set(prev);
			if (next.has(cat)) {
				if (next.size > 1) next.delete(cat);
			} else {
				next.add(cat);
			}
			return next;
		});
	}, []);

	// ── Loaders ──

	const loadPipeline = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE}/api/email/pipeline/status`);
			if (res.ok) {
				const data: PipelineStatus = await res.json();
				setPipeline(data);

				// Detect new classifications for banner
				if (data.recent_classifications?.length > 0) {
					const latest = data.recent_classifications[0].classified_at;
					if (latest && latestClassifiedRef.current && latest > latestClassifiedRef.current && !suppressNewRef.current) {
						const newOnes = data.recent_classifications.filter(
							(c: RecentClassification) => c.classified_at && c.classified_at > latestClassifiedRef.current!
						).length;
						if (newOnes > 0) setNewCount(prev => prev + newOnes);
					}
					if (latest) latestClassifiedRef.current = latest;
				}
			}
		} catch { /* non-fatal */ }
	}, []);

	const loadClassifications = useCallback(async (
		opts: { reset?: boolean; search?: string; fromOffset?: number; filter?: InboxFilter } = {}
	) => {
		const { reset = false, search, fromOffset, filter } = opts;
		const effectiveFilter = filter ?? inboxFilter;
		const effectiveOffset = reset ? 0 : (fromOffset ?? classOffset);
		if (reset) setLoading(true); else setLoadingMore(true);
		try {
			if (effectiveFilter === 'triage') {
				// Triage mode — single page, no offset/pagination
				const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
				const res = await fetch(`${API_BASE}/api/email/classifications/triage?${params}`);
				if (res.ok) {
					const data = await res.json();
					setClassifications(data.classifications);
					setClassTotal(data.total_unhandled);
					setTriageCounts(data.counts_by_category || {});
					setTotalUnhandled(data.total_unhandled);
					setClassOffset(data.classifications.length);
					if (data.classifications.length > 0) {
						const first = data.classifications[0];
						latestClassifiedRef.current = first.classified_at || first.received_at;
					}
					if (reset) setNewCount(0);
				}
			} else {
				// All mode — paginated
				const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(effectiveOffset) });
				if (search) params.set('search', search);

				const res = await fetch(`${API_BASE}/api/email/classifications?${params}`);
				if (res.ok) {
					const data = await res.json();
					if (reset) {
						setClassifications(data.classifications);
						if (data.classifications.length > 0) {
							const first = data.classifications[0];
							latestClassifiedRef.current = first.classified_at || first.received_at;
						}
					} else {
						setClassifications(prev => [...prev, ...data.classifications]);
					}
					setClassTotal(data.total);
					setClassOffset(effectiveOffset + data.classifications.length);
					if (reset) setNewCount(0);
				}
			}
		} catch { /* non-fatal */ }
		finally { setLoading(false); setLoadingMore(false); }
	}, [classOffset, inboxFilter]);

	const loadEmailBody = useCallback(async (messageId: string, accountId: string) => {
		setLoadingBody(true);
		try {
			const res = await fetch(`${API_BASE}/api/email/messages/${messageId}?account=${encodeURIComponent(accountId)}`);
			if (res.ok) {
				const data = await res.json();
				setEmailBody(data.content || data.html_content || null);
			}
		} catch { setEmailBody(null); }
		finally { setLoadingBody(false); }
	}, []);

	const handleMarkHandled = useCallback(async (messageId: string, accountId?: string) => {
		setHandlingIds(prev => new Set(prev).add(messageId));
		try {
			const params = accountId ? `?account=${encodeURIComponent(accountId)}` : '';
			const res = await fetch(`${API_BASE}/api/email/classifications/${messageId}/handle${params}`, {
				method: 'POST',
			});
			if (res.ok) {
				if (inboxFilter === 'triage') {
					// Remove from list immediately
					setClassifications(prev => prev.filter(c => c.message_id !== messageId));
					setTotalUnhandled(prev => Math.max(0, prev - 1));
				} else {
					// Update handled flag in place
					setClassifications(prev => prev.map(c =>
						c.message_id === messageId ? { ...c, handled: true } : c
					));
				}
				// Clear selection if this was selected
				setSelectedId(prev => {
					const match = classifications.find(c => c.message_id === messageId);
					return match && prev === match.id ? null : prev;
				});
			}
		} catch { /* non-fatal */ }
		finally {
			setHandlingIds(prev => {
				const next = new Set(prev);
				next.delete(messageId);
				return next;
			});
		}
	}, [inboxFilter, classifications]);

	const handleMarkAllHandled = useCallback(async () => {
		const unhandled = classifications.filter(c => !c.handled);
		if (unhandled.length === 0) return;
		const messageIds = unhandled.map(c => c.message_id);
		try {
			const res = await fetch(`${API_BASE}/api/email/classifications/handle-batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message_ids: messageIds }),
			});
			if (res.ok) {
				if (inboxFilter === 'triage') {
					setClassifications([]);
					setTotalUnhandled(0);
					setTriageCounts({});
				} else {
					setClassifications(prev => prev.map(c => ({ ...c, handled: true })));
				}
				setSelectedId(null);
			}
		} catch { /* non-fatal */ }
	}, [classifications, inboxFilter]);

	const handleRefresh = useCallback(() => {
		setRefreshing(true);
		suppressNewRef.current = true;
		setNewCount(0);
		Promise.all([
			loadClassifications({ reset: true, search: searchQuery, filter: inboxFilter }),
			loadPipeline(),
		]).finally(() => {
			setRefreshing(false);
			setNewCount(0);
			suppressNewRef.current = false;
		});
	}, [searchQuery, inboxFilter, loadClassifications, loadPipeline]);

	// ── Effects ──

	useEffect(() => {
		loadClassifications({ reset: true });
		loadPipeline();
		// Fetch accounts for display labels
		fetch(`${API_BASE}/api/email/accounts/full`)
			.then(r => r.ok ? r.json() : null)
			.then(data => {
				if (!data?.accounts) return;
				const map: Record<string, string> = {};
				for (const a of data.accounts) {
					if (a.id && a.email) map[a.id] = a.email;
				}
				setAccountMap(map);
			})
			.catch(() => {});
	}, []);

	// Reload when inbox filter changes
	useEffect(() => {
		setSelectedId(null);
		loadClassifications({ reset: true, filter: inboxFilter });
	}, [inboxFilter]);

	// Keep triage count updated even when not in triage view
	useEffect(() => {
		const loadTriageCount = async () => {
			try {
				const res = await fetch(`${API_BASE}/api/email/classifications/triage?limit=1`);
				if (res.ok) {
					const data = await res.json();
					setTotalUnhandled(data.total_unhandled);
					setTriageCounts(data.counts_by_category || {});
				}
			} catch { /* non-fatal */ }
		};
		// Poll triage count less frequently when not in triage view
		if (inboxFilter !== 'triage') {
			loadTriageCount();
			const interval = setInterval(loadTriageCount, 30000);
			return () => clearInterval(interval);
		}
	}, [inboxFilter]);

	// Pipeline polling
	useEffect(() => {
		const interval = setInterval(loadPipeline, PIPELINE_POLL_MS);
		return () => clearInterval(interval);
	}, [loadPipeline]);

	// Debounced search
	const searchTimeout = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (searchTimeout.current) clearTimeout(searchTimeout.current);
		searchTimeout.current = setTimeout(() => {
			setClassOffset(0);
			loadClassifications({ reset: true, search: searchQuery });
		}, 300);
		return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
	}, [searchQuery]);

	// ── Derived data ──

	const filteredEmails = useMemo(() =>
		classifications.filter(c => activeCategories.has(c.category as Category)),
		[classifications, activeCategories]
	);

	const dateGroups = useMemo(() => groupByDate(filteredEmails), [filteredEmails]);

	const selectedItem = useMemo(() => {
		if (!selectedId) return null;
		return classifications.find(c => c.id === selectedId) || null;
	}, [selectedId, classifications]);

	useEffect(() => {
		if (selectedItem) {
			setEmailBody(null);
			loadEmailBody(selectedItem.message_id, selectedItem.account_id);
		}
	}, [selectedItem?.id]);

	const categoryCounts = useMemo(() => {
		if (inboxFilter === 'triage' && Object.keys(triageCounts).length > 0) {
			return triageCounts;
		}
		const counts: Record<string, number> = {};
		for (const c of classifications) {
			counts[c.category] = (counts[c.category] || 0) + 1;
		}
		return counts;
	}, [classifications, inboxFilter, triageCounts]);

	// ==========================================
	// RENDER
	// ==========================================

	if (loading && classifications.length === 0) {
		return (
			<div className="flex items-center justify-center h-full bg-[var(--surface-base)]">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
					<span className="text-xs text-[var(--text-muted)]">Loading emails...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full bg-[var(--surface-base)]">
			{/* ── Toolbar ── */}
			<div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border-subtle)]">
				{/* View toggle: Triage | All | Activity */}
				<div className="flex items-center gap-0.5 mr-2 p-0.5 bg-[var(--surface-accent)] rounded-md">
					<button
						onClick={() => { setView('inbox'); setInboxFilter('triage'); }}
						className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded transition-all ${
							view === 'inbox' && inboxFilter === 'triage'
								? 'bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm'
								: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
						}`}
					>
						<Filter className="w-3 h-3" />
						Triage
						{totalUnhandled > 0 && (
							<span className="text-[10px] font-semibold text-orange-400 tabular-nums">
								{totalUnhandled}
							</span>
						)}
					</button>
					<button
						onClick={() => { setView('inbox'); setInboxFilter('all'); }}
						className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded transition-all ${
							view === 'inbox' && inboxFilter === 'all'
								? 'bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm'
								: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
						}`}
					>
						<Inbox className="w-3 h-3" />
						All
					</button>
					<button
						onClick={() => setView('activity')}
						className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded transition-all ${
							view === 'activity'
								? 'bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm'
								: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
						}`}
					>
						<Activity className="w-3 h-3" />
						Activity
						{pipeline && pipeline.pending > 0 && (
							<span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-medium">
								<span className="relative flex h-1.5 w-1.5">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
									<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
								</span>
								{pipeline.pending}
							</span>
						)}
					</button>
				</div>

				{/* Category filters (inbox only) */}
				{view === 'inbox' && (
					<>
						{ALL_CATEGORIES.map(cat => {
							const count = categoryCounts[cat] || 0;
							const cfg = CATEGORY_CONFIG[cat];
							const active = activeCategories.has(cat);

							return (
								<button
									key={cat}
									onClick={() => toggleCategory(cat)}
									className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md transition-all ${
										active
											? `${cfg.bg} ${cfg.color} ring-1 ring-inset ${cfg.border}`
											: `${cfg.color} opacity-35 hover:opacity-60`
									}`}
								>
									<div className={`w-1.5 h-1.5 rounded-full transition-all ${active ? cfg.dot : `${cfg.dot} opacity-50`}`} />
									{cfg.label}
									{count > 0 && (
										<span className="tabular-nums text-[10px] opacity-60">{count}</span>
									)}
								</button>
							);
						})}
					</>
				)}

				<div className="flex-1" />

				{/* Mark all handled (triage only) */}
				{view === 'inbox' && inboxFilter === 'triage' && totalUnhandled > 0 && (
					<button
						onClick={handleMarkAllHandled}
						className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md text-[var(--text-muted)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
						title="Mark all as handled"
					>
						<CheckCheck className="w-3 h-3" />
						Clear all
					</button>
				)}

				{/* Search (inbox only) */}
				{view === 'inbox' && (
					<div className="relative">
						<Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
						<input
							type="text"
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							placeholder="Search..."
							className="w-40 pl-7 pr-6 py-1 text-xs bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery('')}
								className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
							>
								<X className="w-3 h-3" />
							</button>
						)}
					</div>
				)}

				<button
					onClick={handleRefresh}
					disabled={refreshing}
					className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-accent)] transition-colors"
					title="Refresh"
				>
					<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
				</button>
			</div>

			{/* ── Content ── */}
			{view === 'activity' ? (
				<ActivityView pipeline={pipeline} accountMap={accountMap} />
			) : (
				<div className="flex-1 flex flex-col min-h-0">
					{/* New emails banner */}
					{newCount > 0 && (
						<button
							onClick={handleRefresh}
							className="flex-shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-500/10 border-b border-sky-500/20 text-xs text-sky-400 hover:bg-sky-500/15 transition-colors"
						>
							<ArrowUp className="w-3 h-3" />
							{newCount} new email{newCount !== 1 ? 's' : ''} classified
						</button>
					)}

					<div className="flex-1 flex min-h-0">
						{/* ── Email List ── */}
						<div className={`flex-shrink-0 overflow-y-auto transition-[width] duration-200 ${
							selectedItem ? 'w-[320px] border-r border-[var(--border-subtle)]' : 'w-full'
						}`}>
							{filteredEmails.length === 0 ? (
								<EmptyState searchActive={!!searchQuery} />
							) : selectedItem ? (
								<div>
									{filteredEmails.map(item => (
										<EmailRowCompact
											key={item.id}
											item={item}
											selected={selectedId === item.id}
											onSelect={() => setSelectedId(item.id)}
											accountLabel={accountMap[item.account_id]}
											onHandle={handleMarkHandled}
											handling={handlingIds.has(item.message_id)}
										/>
									))}
									{classifications.length < classTotal && (
										<LoadMoreButton loading={loadingMore} onClick={() => loadClassifications({ search: searchQuery })} />
									)}
								</div>
							) : (
								<div>
									{dateGroups.map(group => (
										<div key={group.label}>
											<DateGroupHeader label={group.label} />
											{group.emails.map(item => (
												<EmailRowFull
													key={item.id}
													item={item}
													onSelect={() => setSelectedId(item.id)}
													accountLabel={accountMap[item.account_id]}
													onHandle={handleMarkHandled}
													handling={handlingIds.has(item.message_id)}
												/>
											))}
										</div>
									))}
									{classifications.length < classTotal && (
										<LoadMoreButton loading={loadingMore} onClick={() => loadClassifications({ search: searchQuery })} />
									)}
								</div>
							)}
						</div>

						{/* ── Detail Panel ── */}
						{selectedItem && (
							<div className="flex-1 overflow-y-auto min-w-0">
								<DetailPanel
									item={selectedItem}
									emailBody={emailBody}
									loadingBody={loadingBody}
									onClose={() => setSelectedId(null)}
									accountLabel={accountMap[selectedItem.account_id]}
									onHandle={handleMarkHandled}
									handling={handlingIds.has(selectedItem.message_id)}
								/>
							</div>
						)}
					</div>

					{/* ── Processing Bar (compact, bottom) ── */}
					{pipeline && pipeline.pending > 0 && (
						<ProcessingBar pipeline={pipeline} />
					)}
				</div>
			)}
		</div>
	);
}

// ==========================================
// EMPTY STATE
// ==========================================

const EmptyState = memo(function EmptyState({ searchActive }: { searchActive: boolean }) {
	return (
		<div className="flex flex-col items-center justify-center h-full py-16">
			<div className="w-10 h-10 rounded-full bg-[var(--surface-accent)] flex items-center justify-center mb-3">
				{searchActive ? (
					<Search className="w-4 h-4 text-[var(--text-muted)]" />
				) : (
					<Inbox className="w-4 h-4 text-[var(--text-muted)]" />
				)}
			</div>
			<p className="text-xs text-[var(--text-muted)]">
				{searchActive ? 'No emails match your search' : 'No emails in selected categories'}
			</p>
			<p className="text-[10px] text-[var(--text-muted)] mt-1 opacity-60">
				{searchActive ? 'Try a different query' : 'Adjust filters to see more'}
			</p>
		</div>
	);
});

// ==========================================
// DATE GROUP HEADER
// ==========================================

const DateGroupHeader = memo(function DateGroupHeader({ label }: { label: string }) {
	return (
		<div className="sticky top-0 z-10 px-3 py-1.5 bg-[var(--surface-base)]/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
			<span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
				{label}
			</span>
		</div>
	);
});

// ==========================================
// EMAIL ROW — Full width (no detail panel)
// ==========================================

const EmailRowFull = memo(function EmailRowFull({
	item,
	onSelect,
	accountLabel,
	onHandle,
	handling,
}: {
	item: ClassifiedEmail;
	onSelect: () => void;
	accountLabel?: string;
	onHandle?: (messageId: string, accountId?: string) => void;
	handling?: boolean;
}) {
	const name = item.display_name || extractSenderName(item.sender);
	const email = extractSenderEmail(item.sender);
	const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.fyi;
	const time = formatRelativeTime(item.received_at || item.classified_at || '');

	return (
		<div
			className={`w-full text-left flex border-b border-[var(--border-subtle)] hover:bg-[var(--surface-accent)] transition-colors group`}
		>
			{/* Left accent bar */}
			<div className={`w-[3px] flex-shrink-0 ${cfg.dot}`} />

			<button onClick={onSelect} className="flex-1 min-w-0 flex gap-3 px-3 py-2.5 text-left">
				{/* Left: sender + summary */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className={`text-[13px] font-semibold truncate ${item.handled ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
							{name}
						</span>
						{item.display_name && email && (
							<span className="text-[10px] text-[var(--text-muted)] truncate">
								{email}
							</span>
						)}
						<span className={`flex-shrink-0 text-[9px] font-medium ${cfg.color}`}>
							{cfg.label}
						</span>
						{item.handled && (
							<Check className="w-3 h-3 text-emerald-500/40 flex-shrink-0" />
						)}
					</div>
					<div className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed line-clamp-2">
						{item.summary || item.subject || '(no subject)'}
					</div>
				</div>

				{/* Right: account + time */}
				<div className="flex-shrink-0 text-right pt-0.5">
					{accountLabel && (
						<div className="text-[9px] text-[var(--text-muted)] opacity-50">
							{accountLabel}
						</div>
					)}
					<div className="text-[10px] text-[var(--text-muted)] tabular-nums">
						{time}
					</div>
				</div>
			</button>

			{onHandle && !item.handled && (
				<button
					onClick={() => onHandle(item.message_id, item.account_id)}
					disabled={handling}
					className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-2 flex items-center text-[var(--text-muted)] hover:text-emerald-400 transition-all"
					title="Mark as handled"
				>
					{handling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
				</button>
			)}
		</div>
	);
});

// ==========================================
// EMAIL ROW — Compact (detail panel open)
// ==========================================

const EmailRowCompact = memo(function EmailRowCompact({
	item,
	selected,
	onSelect,
	accountLabel,
	onHandle,
	handling,
}: {
	item: ClassifiedEmail;
	selected: boolean;
	onSelect: () => void;
	accountLabel?: string;
	onHandle?: (messageId: string, accountId?: string) => void;
	handling?: boolean;
}) {
	const name = item.display_name || extractSenderName(item.sender);
	const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.fyi;
	const time = formatRelativeTime(item.received_at || item.classified_at || '');

	return (
		<div
			className={`w-full text-left flex border-b border-[var(--border-subtle)] transition-colors group ${
				selected
					? 'bg-[var(--surface-accent)]'
					: 'hover:bg-[var(--surface-accent)]/50'
			}`}
		>
			{/* Left accent bar — always shows classification color */}
			<div className={`w-[3px] flex-shrink-0 ${selected ? cfg.dot : `${cfg.dot} opacity-60`}`} />

			<button onClick={onSelect} className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-2 text-left">
				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between gap-2">
						<span className={`text-xs truncate ${selected ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'}`}>
							{name}
						</span>
						<div className="flex items-center gap-1.5 flex-shrink-0">
							{accountLabel && (
								<span className="text-[9px] text-[var(--text-muted)] opacity-50">
									{accountLabel}
								</span>
							)}
							<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
								{time}
							</span>
						</div>
					</div>
					<div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
						{item.summary || item.subject || '(no subject)'}
					</div>
				</div>
			</button>

			{onHandle && !item.handled && (
				<button
					onClick={(e) => { e.stopPropagation(); onHandle(item.message_id, item.account_id); }}
					disabled={handling}
					className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-2 flex items-center text-[var(--text-muted)] hover:text-emerald-400 transition-all"
					title="Mark as handled"
				>
					{handling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
				</button>
			)}
		</div>
	);
});

// ==========================================
// LOAD MORE
// ==========================================

const LoadMoreButton = memo(function LoadMoreButton({
	loading,
	onClick,
}: {
	loading: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			disabled={loading}
			className="w-full flex items-center justify-center gap-2 py-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-accent)]/50 transition-colors"
		>
			{loading ? (
				<Loader2 className="w-3.5 h-3.5 animate-spin" />
			) : (
				'Load more'
			)}
		</button>
	);
});

// ==========================================
// DETAIL PANEL
// ==========================================

function DetailPanelInner({
	item,
	emailBody,
	loadingBody,
	onClose,
	accountLabel,
	onHandle,
	handling,
}: {
	item: ClassifiedEmail;
	emailBody: string | null;
	loadingBody: boolean;
	onClose: () => void;
	accountLabel?: string;
	onHandle?: (messageId: string, accountId?: string) => void;
	handling?: boolean;
}) {
	const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.fyi;
	const senderName = item.display_name || extractSenderName(item.sender);
	const senderEmail = extractSenderEmail(item.sender);
	const [classificationOpen, setClassificationOpen] = useState(true);
	const [emailContentOpen, setEmailContentOpen] = useState(false);

	// Extract a plain-text preview from emailBody HTML for collapsed view
	const emailPreview = useMemo(() => {
		if (!emailBody) return item.preview || '';
		const tmp = document.createElement('div');
		tmp.innerHTML = emailBody;
		const text = tmp.textContent || tmp.innerText || '';
		return text.slice(0, 200).trim();
	}, [emailBody, item.preview]);

	return (
		<div className="flex flex-col h-full">
			{/* ── 1. Metadata (fixed) ── */}
			<div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-[var(--border-subtle)]">
				<div className="flex items-start justify-between gap-3 mb-2">
					<h2 className="text-sm font-semibold text-[var(--text-primary)] leading-snug flex-1 min-w-0">
						{item.subject || '(no subject)'}
					</h2>
					<div className="flex items-center gap-0.5 flex-shrink-0">
						{onHandle && !item.handled && (
							<button
								onClick={() => onHandle(item.message_id, item.account_id)}
								disabled={handling}
								className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
								title="Mark as handled"
							>
								{handling ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									<Check className="w-3 h-3" />
								)}
								Handled
							</button>
						)}
						{item.handled && (
							<span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-500/50">
								<Check className="w-3 h-3" />
								Handled
							</span>
						)}
						<ChatButton
							message={`From: ${senderName} <${senderEmail}> — ${item.subject}\n${item.summary || ''}\nTo read: email("read", message_id="${item.message_id}", account="${item.account_id}")`}
							app="Email"
							size="sm"
						/>
						<button
							onClick={onClose}
							className="p-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors"
							title="Close"
						>
							<X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
						</button>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-xs font-medium text-[var(--text-primary)]">{senderName}</span>
					{senderEmail && (
						<span className="text-[10px] text-[var(--text-muted)] truncate">{senderEmail}</span>
					)}
				</div>
				<div className="flex items-center gap-2 mt-0.5">
					<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
						{formatFullDate(item.received_at || item.classified_at || '')}
					</span>
					{accountLabel && (
						<>
							<span className="text-[var(--text-muted)] opacity-30">·</span>
							<span className="text-[10px] text-[var(--text-muted)] opacity-60">{accountLabel}</span>
						</>
					)}
				</div>
			</div>

			{/* ── 2. Classification (collapsible, takes most space when open) ── */}
			<div className={`flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-accent)]/30 ${
				classificationOpen ? 'flex-1 min-h-0 flex flex-col' : ''
			}`}>
				{/* Header — always visible, clickable */}
				<button
					onClick={() => setClassificationOpen(prev => !prev)}
					className="flex items-center gap-2 w-full px-5 py-2.5 hover:bg-[var(--surface-accent)]/50 transition-colors"
				>
					{classificationOpen
						? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
						: <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
					}
					<Brain className="w-3.5 h-3.5 text-[var(--text-muted)]" />
					<span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
						Classification
					</span>
					<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
						{cfg.label}
					</span>
					{item.processing_time_ms && (
						<span className="text-[9px] text-[var(--text-muted)] ml-auto tabular-nums">
							{formatProcessingTime(item.processing_time_ms)}
						</span>
					)}
				</button>

				{classificationOpen ? (
					/* Expanded: scrollable content */
					<div className="flex-1 overflow-y-auto min-h-0 px-5 pb-3">
						{item.summary && (
							<div className="text-xs text-[var(--text-secondary)] leading-relaxed mb-1.5 prose prose-invert prose-xs max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>{item.summary}</ReactMarkdown>
							</div>
						)}

						{(item.briefing || item.reasoning) && (
							<div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed prose prose-invert prose-xs max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 [&_strong]:text-[var(--text-secondary)]">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>{(item.briefing || item.reasoning)!}</ReactMarkdown>
							</div>
						)}

						{/* Suggested actions */}
						{item.suggested_actions && item.suggested_actions.length > 0 && (
							<div className="mt-3 pt-2 border-t border-[var(--border-subtle)]">
								<div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
									Suggested Actions
								</div>
								<ul className="space-y-1">
									{item.suggested_actions.map((action, i) => (
										<li key={i} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
											<span className="text-[var(--text-muted)] mt-0.5">&#8226;</span>
											{action}
										</li>
									))}
								</ul>
							</div>
						)}

						{/* Sender card inline */}
						{senderEmail && <SenderCard senderEmail={senderEmail} />}
					</div>
				) : (
					/* Collapsed: summary preview */
					<div className="px-5 pb-2.5 text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
						{item.summary || '(no summary)'}
					</div>
				)}
			</div>

			{/* ── 3. Email content (collapsible, defaults closed) ── */}
			<div className={`flex-shrink-0 ${
				emailContentOpen ? 'flex-1 min-h-0 flex flex-col' : ''
			}`}>
				{/* Header — always visible, clickable */}
				<button
					onClick={() => setEmailContentOpen(prev => !prev)}
					className="flex items-center gap-2 w-full px-5 py-2.5 border-b border-[var(--border-subtle)] hover:bg-[var(--surface-accent)]/50 transition-colors"
				>
					{emailContentOpen
						? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
						: <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
					}
					<Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
					<span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
						Email Content
					</span>
					{loadingBody && (
						<Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)] ml-auto" />
					)}
				</button>

				{emailContentOpen ? (
					/* Expanded: scrollable content */
					<div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
						{loadingBody ? (
							<div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-4">
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								Loading email...
							</div>
						) : emailBody ? (
							<div
								className="text-[13px] text-[var(--text-secondary)] leading-relaxed prose prose-invert prose-sm max-w-none [&_a]:text-sky-400 [&_img]:max-w-full [&_img]:h-auto [&_table]:text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_pre]:bg-[var(--surface-accent)] [&_pre]:rounded-md [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-subtle)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-muted)]"
								dangerouslySetInnerHTML={{ __html: emailBody }}
							/>
						) : item.preview ? (
							<div className="text-xs text-[var(--text-tertiary)] leading-relaxed whitespace-pre-wrap">
								{item.preview}
							</div>
						) : (
							<div className="flex flex-col items-center py-8">
								<Mail className="w-5 h-5 text-[var(--text-muted)] opacity-40 mb-2" />
								<span className="text-xs text-[var(--text-muted)]">No content available</span>
							</div>
						)}
					</div>
				) : (
					/* Collapsed: text preview */
					<div className="px-5 py-2.5 text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed border-b border-[var(--border-subtle)]">
						{emailPreview || '(no content)'}
					</div>
				)}
			</div>
		</div>
	);
}

const DetailPanel = memo(DetailPanelInner);

// ==========================================
// PROCESSING BAR (compact, bottom of inbox)
// ==========================================

const ProcessingBar = memo(function ProcessingBar({ pipeline }: { pipeline: PipelineStatus }) {
	const progress = pipeline.total_tracked > 0
		? Math.round((pipeline.classified / pipeline.total_tracked) * 100)
		: 100;

	const etaMin = pipeline.avg_processing_ms && pipeline.max_workers > 0
		? Math.ceil((pipeline.pending / pipeline.max_workers) * (pipeline.avg_processing_ms / 1000 / 60))
		: null;

	return (
		<div className="flex-shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-accent)]/50">
			<div className="h-0.5 bg-[var(--surface-accent)]">
				<div
					className="h-full bg-amber-400/60 transition-all duration-1000 ease-out"
					style={{ width: `${progress}%` }}
				/>
			</div>
			<div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
				<Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />
				<span>Classifying {pipeline.pending} email{pipeline.pending !== 1 ? 's' : ''}</span>
				<span className="opacity-40">·</span>
				<span>{pipeline.max_workers} workers</span>
				{etaMin !== null && (
					<>
						<span className="opacity-40">·</span>
						<span>~{etaMin} min</span>
					</>
				)}
				<span className="ml-auto tabular-nums">{progress}%</span>
			</div>
		</div>
	);
});

// ==========================================
// ACTIVITY VIEW (replaces Pipeline)
// ==========================================

const ActivityView = memo(function ActivityView({ pipeline, accountMap }: { pipeline: PipelineStatus | null; accountMap: Record<string, string> }) {
	if (!pipeline) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	const isProcessing = pipeline.pending > 0;
	const progress = pipeline.total_tracked > 0
		? Math.round((pipeline.classified / pipeline.total_tracked) * 100)
		: 100;

	return (
		<div className="flex-1 overflow-y-auto">
			{/* ── Stats strip ── */}
			<div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-accent)]/30">
				<StatPill
					icon={<Brain className="w-3 h-3" />}
					value={pipeline.classified}
					label="classified"
					accent="text-sky-400"
				/>
				<StatPill
					icon={<Clock className="w-3 h-3" />}
					value={pipeline.avg_processing_ms ? `${(pipeline.avg_processing_ms / 1000).toFixed(1)}s` : '\u2014'}
					label="avg"
					accent="text-violet-400"
				/>
				<StatPill
					icon={<Zap className="w-3 h-3" />}
					value={pipeline.throughput_last_hour}
					label="last hour"
					accent="text-emerald-400"
				/>
				{isProcessing && (
					<StatPill
						icon={<Loader2 className="w-3 h-3 animate-spin" />}
						value={pipeline.pending}
						label="queued"
						accent="text-amber-400"
					/>
				)}

				{/* Category breakdown (inline) */}
				<div className="ml-auto flex items-center gap-2">
					{Object.entries(pipeline.category_breakdown).map(([cat, count]) => {
						const cfg = CATEGORY_CONFIG[cat as Category] || CATEGORY_CONFIG.fyi;
						return (
							<div key={cat} className="flex items-center gap-1" title={`${cfg.label}: ${count}`}>
								<div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
								<span className="text-[10px] text-[var(--text-muted)] tabular-nums">{count}</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* ── Progress (when processing) ── */}
			{isProcessing && (
				<div className="px-4 py-3 border-b border-[var(--border-subtle)]">
					<div className="flex items-center justify-between text-[11px] mb-1.5">
						<span className="text-[var(--text-muted)]">Classification progress</span>
						<span className="text-[var(--text-secondary)] tabular-nums">{progress}%</span>
					</div>
					<div className="h-1 bg-[var(--surface-accent)] rounded-full overflow-hidden">
						<div
							className="h-full bg-amber-400/60 rounded-full transition-all duration-1000"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mt-1">
						<span>{pipeline.max_workers} workers</span>
						<span className="opacity-40">·</span>
						<span>{pipeline.pending} remaining</span>
						{pipeline.avg_processing_ms && (
							<>
								<span className="opacity-40">·</span>
								<span>~{Math.ceil((pipeline.pending / pipeline.max_workers) * (pipeline.avg_processing_ms / 1000 / 60))} min</span>
							</>
						)}
					</div>
				</div>
			)}

			{/* ── Pending queue (top when processing) ── */}
			{pipeline.pending_queue.length > 0 && (
				<div className="px-4 py-3 border-b border-[var(--border-subtle)]">
					<h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
						<Loader2 className="w-3 h-3 animate-spin text-amber-400" />
						Queue ({pipeline.pending})
					</h3>
					<div className="space-y-0.5">
						{pipeline.pending_queue.slice(0, 8).map((item, i) => {
							const acctLabel = accountMap[item.account_id];
							return (
								<div
									key={`${item.message_id}-${i}`}
									className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors"
								>
									<div className="w-1.5 h-1.5 rounded-full bg-amber-500/40 flex-shrink-0 animate-pulse" />
									<span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 min-w-0">
										Awaiting classification...
									</span>
									<div className="flex items-center gap-1.5 flex-shrink-0">
										{acctLabel && (
											<span className="text-[9px] text-[var(--text-muted)] opacity-50">
												{acctLabel}
											</span>
										)}
										<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
											{item.received_at ? formatRelativeTime(item.received_at) : '?'}
										</span>
									</div>
								</div>
							);
						})}
						{pipeline.pending > 8 && (
							<div className="text-[10px] text-[var(--text-muted)] text-center py-1 opacity-60">
								+{pipeline.pending - Math.min(pipeline.pending_queue.length, 8)} more
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── Classification feed ── */}
			<div className="px-4 py-3">
				<h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
					Recent Classifications
				</h3>

				{pipeline.recent_classifications.length === 0 ? (
					<div className="flex flex-col items-center py-8">
						<Activity className="w-5 h-5 text-[var(--text-muted)] opacity-40 mb-2" />
						<span className="text-xs text-[var(--text-muted)]">No classifications yet</span>
					</div>
				) : (
					<div className="space-y-0.5">
						{pipeline.recent_classifications.map((item, i) => {
							const cfg = CATEGORY_CONFIG[item.category as Category] || CATEGORY_CONFIG.fyi;
							const name = item.display_name || extractSenderName(item.sender);

							return (
								<div
									key={`${item.message_id}-${i}`}
									className="flex overflow-hidden rounded-lg hover:bg-[var(--surface-accent)] transition-colors"
								>
									{/* Left accent bar — matches inbox */}
									<div className={`w-[3px] flex-shrink-0 ${cfg.dot}`} />

									<div className="flex items-center gap-2.5 flex-1 min-w-0 px-2.5 py-2">
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-xs font-medium text-[var(--text-primary)] truncate">{name}</span>
												<span className={`flex-shrink-0 text-[9px] font-medium ${cfg.color}`}>
													{cfg.label}
												</span>
											</div>
											<div className="text-[11px] text-[var(--text-muted)] truncate">
												{item.summary || item.subject || '(no subject)'}
											</div>
										</div>

										<div className="flex-shrink-0 text-right">
											<div className="text-[10px] text-[var(--text-muted)] tabular-nums">
												{item.classified_at ? formatRelativeTime(item.classified_at) : ''}
											</div>
											{item.processing_time_ms && (
												<div className="text-[9px] text-[var(--text-muted)] opacity-60 tabular-nums">
													{formatProcessingTime(item.processing_time_ms)}
												</div>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* ── Errors ── */}
			{pipeline.error_count > 0 && (
				<div className="px-4 py-2 border-t border-[var(--border-subtle)] text-[10px] text-red-400/70 flex items-center gap-1.5">
					<X className="w-3 h-3" />
					{pipeline.error_count} classification errors
				</div>
			)}
		</div>
	);
});

// ==========================================
// STAT PILL (inline, for Activity view)
// ==========================================

const StatPill = memo(function StatPill({
	icon,
	value,
	label,
	accent,
}: {
	icon: React.ReactNode;
	value: string | number;
	label: string;
	accent: string;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<span className={accent}>{icon}</span>
			<span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">{value}</span>
			<span className="text-[10px] text-[var(--text-muted)]">{label}</span>
		</div>
	);
});

export default EmailWindowContent;
