'use client';

import {
	AlertTriangle,
	Check,
	ChevronDown,
	Edit3,
	FileText,
	Loader2,
	Plus,
	RotateCcw,
	Save,
	Settings2,
	Sliders,
	Trash2,
	X,
} from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

// ==========================================
// TYPES
// ==========================================

interface SenderRule {
	id: string;
	match_type: 'domain' | 'sender';
	match_value: string;
	rule_type: 'always' | 'never' | 'suggest';
	category: string;
	instructions: string | null;
	extract_content: boolean;
	enabled: boolean;
	created_from: string;
	times_applied: number;
	created_at: string;
	updated_at: string;
}

interface FeedbackEntry {
	id: string;
	classification_id: string;
	message_id: string;
	account_id: string;
	original_category: string;
	corrected_category: string;
	sender: string | null;
	subject: string | null;
	notes: string | null;
	rule_created: boolean;
	prompt_version: string | null;
	created_at: string;
	reviewed: boolean;
	promoted_to_eval: boolean;
}

interface FeedbackStats {
	total_feedback: number;
	unreviewed: number;
	week_corrections: number;
	week_total_classifications: number;
	correction_rate_pct: number;
	drift_warning: boolean;
	category_flows: { from: string; to: string; count: number }[];
	eval_set_size: number;
}

type SettingsTab = 'prompt' | 'rules' | 'feedback';

const CATEGORY_OPTIONS = ['action_needed', 'heads_up', 'fyi', 'noise'] as const;

const CATEGORY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
	action_needed: { label: 'Action', color: 'text-red-400', bg: 'bg-red-500/12' },
	heads_up: { label: 'Heads Up', color: 'text-amber-400', bg: 'bg-amber-500/12' },
	fyi: { label: 'FYI', color: 'text-blue-400', bg: 'bg-blue-500/10' },
	noise: { label: 'Noise', color: 'text-zinc-500', bg: 'bg-zinc-500/8' },
};

const RULE_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
	always: { label: 'Always', color: 'text-emerald-400', bg: 'bg-emerald-500/12' },
	never: { label: 'Never', color: 'text-red-400', bg: 'bg-red-500/12' },
	suggest: { label: 'Suggest', color: 'text-violet-400', bg: 'bg-violet-500/12' },
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export function ClassifierSettings({ onClose }: { onClose: () => void }) {
	const [tab, setTab] = useState<SettingsTab>('rules');

	return (
		<div className="flex flex-col h-full bg-[var(--surface-base)]">
			{/* Header */}
			<div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-subtle)]">
				<Settings2 className="w-4 h-4 text-[var(--text-muted)]" />
				<span className="text-sm font-semibold text-[var(--text-primary)]">
					Classifier Settings
				</span>
				<div className="flex-1" />
				<button
					onClick={onClose}
					className="p-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors"
				>
					<X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				</button>
			</div>

			{/* Tabs */}
			<div className="flex-shrink-0 flex items-center gap-0.5 px-4 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--surface-accent)]/30">
				<TabButton
					active={tab === 'rules'}
					onClick={() => setTab('rules')}
					icon={<Sliders className="w-3 h-3" />}
					label="Sender Rules"
				/>
				<TabButton
					active={tab === 'prompt'}
					onClick={() => setTab('prompt')}
					icon={<FileText className="w-3 h-3" />}
					label="Prompt"
				/>
				<TabButton
					active={tab === 'feedback'}
					onClick={() => setTab('feedback')}
					icon={<Edit3 className="w-3 h-3" />}
					label="Feedback"
				/>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto min-h-0">
				{tab === 'prompt' && <PromptEditor />}
				{tab === 'rules' && <RulesPanel />}
				{tab === 'feedback' && <FeedbackPanel />}
			</div>
		</div>
	);
}

// ==========================================
// TAB BUTTON
// ==========================================

function TabButton({ active, onClick, icon, label }: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<button
			onClick={onClick}
			className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
				active
					? 'bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm'
					: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
			}`}
		>
			{icon}
			{label}
		</button>
	);
}

// ==========================================
// PROMPT EDITOR
// ==========================================

function PromptEditor() {
	const [prompt, setPrompt] = useState('');
	const [originalPrompt, setOriginalPrompt] = useState('');
	const [updatedAt, setUpdatedAt] = useState<string | null>(null);
	const [promptPath, setPromptPath] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		fetch(`${API_BASE}/api/email/classifier/prompt`)
			.then(r => r.json())
			.then(data => {
				setPrompt(data.prompt || '');
				setOriginalPrompt(data.prompt || '');
				setUpdatedAt(data.updated_at);
				setPromptPath(data.path || '');
			})
			.finally(() => setLoading(false));
	}, []);

	const handleSave = async () => {
		setSaving(true);
		try {
			const res = await fetch(`${API_BASE}/api/email/classifier/prompt`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt }),
			});
			if (res.ok) {
				const data = await res.json();
				setUpdatedAt(data.updated_at);
				setOriginalPrompt(prompt);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			}
		} finally {
			setSaving(false);
		}
	};

	const handleReset = async () => {
		if (!confirm('Reset classifier prompt to default? This cannot be undone.')) return;
		setSaving(true);
		try {
			const res = await fetch(`${API_BASE}/api/email/classifier/prompt/reset`, {
				method: 'POST',
			});
			if (res.ok) {
				const data = await res.json();
				// Reload prompt
				const promptRes = await fetch(`${API_BASE}/api/email/classifier/prompt`);
				const promptData = await promptRes.json();
				setPrompt(promptData.prompt || '');
				setOriginalPrompt(promptData.prompt || '');
				setUpdatedAt(data.updated_at);
			}
		} finally {
			setSaving(false);
		}
	};

	const hasChanges = prompt !== originalPrompt;

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Info bar */}
			<div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-accent)]/20">
				<span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
					{promptPath}
				</span>
				{updatedAt && (
					<span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
						{new Date(updatedAt).toLocaleString()}
					</span>
				)}
			</div>

			{/* Editor */}
			<div className="flex-1 min-h-0 p-4">
				<textarea
					value={prompt}
					onChange={e => setPrompt(e.target.value)}
					className="w-full h-full resize-none bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-lg p-4 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors leading-relaxed"
					placeholder="Classifier prompt..."
					spellCheck={false}
				/>
			</div>

			{/* Action bar */}
			<div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-[var(--border-subtle)]">
				<button
					onClick={handleSave}
					disabled={!hasChanges || saving}
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
				>
					{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
					{saved ? 'Saved' : 'Save'}
				</button>
				<button
					onClick={handleReset}
					disabled={saving}
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
				>
					<RotateCcw className="w-3 h-3" />
					Reset to Default
				</button>
				<div className="flex-1" />
				{hasChanges && (
					<span className="text-[10px] text-amber-400">Unsaved changes</span>
				)}
				<span className="text-[10px] text-[var(--text-muted)] tabular-nums">
					{prompt.length} chars
				</span>
			</div>

			{/* Template variables reference */}
			<details className="flex-shrink-0 border-t border-[var(--border-subtle)]">
				<summary className="px-4 py-2 text-[10px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
					Template Variables Reference
				</summary>
				<div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
					{[
						['{sender}', 'Email sender'],
						['{subject}', 'Email subject'],
						['{date}', 'Current date/time'],
						['{message_id}', 'Email message ID'],
						['{account_id}', 'Account identifier'],
						['{content_section}', 'Email body'],
						['{previous_emails_section}', 'Previous emails from sender'],
						['{thread_section}', 'Thread context'],
						['{rules_section}', 'Matched sender rules'],
					].map(([key, desc]) => (
						<div key={key} className="flex items-center gap-2">
							<code className="text-sky-400 font-mono">{key}</code>
							<span className="text-[var(--text-muted)]">{desc}</span>
						</div>
					))}
				</div>
			</details>
		</div>
	);
}

// ==========================================
// RULES PANEL
// ==========================================

function RulesPanel() {
	const [rules, setRules] = useState<SenderRule[]>([]);
	const [loading, setLoading] = useState(true);
	const [showAdd, setShowAdd] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const loadRules = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE}/api/email/classifier/rules`);
			if (res.ok) {
				const data = await res.json();
				setRules(data.rules);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { loadRules(); }, [loadRules]);

	const handleDelete = async (id: string) => {
		if (!confirm('Delete this rule?')) return;
		const res = await fetch(`${API_BASE}/api/email/classifier/rules/${id}`, {
			method: 'DELETE',
		});
		if (res.ok) loadRules();
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	return (
		<div className="p-4 space-y-3">
			{/* Header with add button */}
			<div className="flex items-center justify-between">
				<span className="text-[11px] text-[var(--text-muted)]">
					{rules.length} rule{rules.length !== 1 ? 's' : ''} configured
				</span>
				<button
					onClick={() => setShowAdd(true)}
					className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 transition-colors"
				>
					<Plus className="w-3 h-3" />
					Add Rule
				</button>
			</div>

			{/* Add form */}
			{showAdd && (
				<RuleForm
					onSave={async (data) => {
						const res = await fetch(`${API_BASE}/api/email/classifier/rules`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(data),
						});
						if (res.ok) {
							setShowAdd(false);
							loadRules();
						}
					}}
					onCancel={() => setShowAdd(false)}
				/>
			)}

			{/* Rules list */}
			{rules.length === 0 && !showAdd ? (
				<div className="flex flex-col items-center py-8">
					<Sliders className="w-5 h-5 text-[var(--text-muted)] opacity-40 mb-2" />
					<span className="text-xs text-[var(--text-muted)]">No rules configured</span>
					<span className="text-[10px] text-[var(--text-muted)] mt-1">
						Rules are created from corrections or added manually
					</span>
				</div>
			) : (
				<div className="space-y-2">
					{rules.map(rule => (
						<RuleCard
							key={rule.id}
							rule={rule}
							editing={editingId === rule.id}
							onEdit={() => setEditingId(editingId === rule.id ? null : rule.id)}
							onDelete={() => handleDelete(rule.id)}
							onUpdate={async (data) => {
								const res = await fetch(`${API_BASE}/api/email/classifier/rules/${rule.id}`, {
									method: 'PUT',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify(data),
								});
								if (res.ok) {
									setEditingId(null);
									loadRules();
								}
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ==========================================
// RULE CARD
// ==========================================

const RuleCard = memo(function RuleCard({
	rule,
	editing,
	onEdit,
	onDelete,
	onUpdate,
}: {
	rule: SenderRule;
	editing: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onUpdate: (data: Partial<SenderRule>) => Promise<void>;
}) {
	const rtCfg = RULE_TYPE_LABELS[rule.rule_type] || RULE_TYPE_LABELS.suggest;
	const catCfg = CATEGORY_LABELS[rule.category] || CATEGORY_LABELS.fyi;

	return (
		<div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
			{/* Main row */}
			<div className="flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--surface-accent)]/30 transition-colors">
				{/* Match indicator */}
				<span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--surface-accent)] px-1.5 py-0.5 rounded flex-shrink-0">
					{rule.match_type === 'sender' ? '@' : '*.'}
				</span>

				{/* Match value */}
				<span className="text-xs font-medium text-[var(--text-primary)] truncate flex-1 min-w-0">
					{rule.match_value}
				</span>

				{/* Rule type badge */}
				<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${rtCfg.bg} ${rtCfg.color} flex-shrink-0`}>
					{rtCfg.label}
				</span>

				{/* Category badge */}
				<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catCfg.bg} ${catCfg.color} flex-shrink-0`}>
					{catCfg.label}
				</span>

				{/* Extract content indicator */}
				{rule.extract_content && (
					<span title="Content extraction enabled">
						<FileText className="w-3 h-3 text-violet-400 flex-shrink-0" />
					</span>
				)}

				{/* Times applied */}
				<span className="text-[10px] text-[var(--text-muted)] tabular-nums flex-shrink-0">
					{rule.times_applied}x
				</span>

				{/* Actions */}
				<button
					onClick={onEdit}
					className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
				>
					<Edit3 className="w-3 h-3" />
				</button>
				<button
					onClick={onDelete}
					className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
				>
					<Trash2 className="w-3 h-3" />
				</button>
			</div>

			{/* Instructions preview */}
			{rule.instructions && !editing && (
				<div className="px-3 pb-2 text-[10px] text-[var(--text-muted)] line-clamp-1">
					{rule.instructions}
				</div>
			)}

			{/* Source tag */}
			{rule.created_from !== 'manual' && !editing && (
				<div className="px-3 pb-2">
					<span className="text-[9px] text-[var(--text-muted)] opacity-60">
						from {rule.created_from}
					</span>
				</div>
			)}

			{/* Edit form */}
			{editing && (
				<div className="border-t border-[var(--border-subtle)]">
					<RuleForm
						initial={rule}
						onSave={onUpdate}
						onCancel={onEdit}
					/>
				</div>
			)}
		</div>
	);
});

// ==========================================
// RULE FORM (used for add + edit)
// ==========================================

function RuleForm({
	initial,
	onSave,
	onCancel,
}: {
	initial?: Partial<SenderRule>;
	onSave: (data: Record<string, unknown>) => Promise<void>;
	onCancel: () => void;
}) {
	const [matchType, setMatchType] = useState(initial?.match_type || 'domain');
	const [matchValue, setMatchValue] = useState(initial?.match_value || '');
	const [ruleType, setRuleType] = useState(initial?.rule_type || 'always');
	const [category, setCategory] = useState(initial?.category || 'noise');
	const [instructions, setInstructions] = useState(initial?.instructions || '');
	const [extractContent, setExtractContent] = useState(initial?.extract_content || false);
	const [saving, setSaving] = useState(false);

	const handleSubmit = async () => {
		if (!matchValue.trim()) return;
		setSaving(true);
		try {
			await onSave({
				match_type: matchType,
				match_value: matchValue.trim(),
				rule_type: ruleType,
				category,
				instructions: instructions.trim() || null,
				extract_content: extractContent,
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="p-3 space-y-3 bg-[var(--surface-accent)]/20 border border-[var(--border-subtle)] rounded-lg">
			{/* Match type + value */}
			<div className="flex items-center gap-2">
				<select
					value={matchType}
					onChange={e => setMatchType(e.target.value as 'domain' | 'sender')}
					className="text-[11px] bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-[var(--text-primary)]"
				>
					<option value="domain">Domain</option>
					<option value="sender">Sender</option>
				</select>
				<input
					type="text"
					value={matchValue}
					onChange={e => setMatchValue(e.target.value)}
					placeholder={matchType === 'domain' ? 'github.com' : 'user@example.com'}
					className="flex-1 text-xs bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
				/>
			</div>

			{/* Rule type + category */}
			<div className="flex items-center gap-2">
				<select
					value={ruleType}
					onChange={e => setRuleType(e.target.value as 'always' | 'never' | 'suggest')}
					className="text-[11px] bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-[var(--text-primary)]"
				>
					<option value="always">Always</option>
					<option value="never">Never</option>
					<option value="suggest">Suggest</option>
				</select>
				<span className="text-[10px] text-[var(--text-muted)]">classify as</span>
				<select
					value={category}
					onChange={e => setCategory(e.target.value)}
					className="text-[11px] bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-[var(--text-primary)]"
				>
					{CATEGORY_OPTIONS.map(cat => (
						<option key={cat} value={cat}>{CATEGORY_LABELS[cat].label}</option>
					))}
				</select>
			</div>

			{/* Instructions */}
			<textarea
				value={instructions}
				onChange={e => setInstructions(e.target.value)}
				placeholder="Optional instructions (injected into classifier prompt)..."
				rows={2}
				className="w-full text-xs bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md px-2.5 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] resize-none"
			/>

			{/* Extract content toggle */}
			<label className="flex items-center gap-2 cursor-pointer">
				<input
					type="checkbox"
					checked={extractContent}
					onChange={e => setExtractContent(e.target.checked)}
					className="rounded border-[var(--border-subtle)] bg-[var(--surface-accent)]"
				/>
				<span className="text-[11px] text-[var(--text-secondary)]">
					Extract content (for newsletters/digests)
				</span>
			</label>

			{/* Actions */}
			<div className="flex items-center gap-2">
				<button
					onClick={handleSubmit}
					disabled={!matchValue.trim() || saving}
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 disabled:opacity-30 transition-colors"
				>
					{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
					{initial ? 'Update' : 'Create'}
				</button>
				<button
					onClick={onCancel}
					className="px-3 py-1.5 text-[11px] font-medium rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

// ==========================================
// FEEDBACK PANEL
// ==========================================

function FeedbackPanel() {
	const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
	const [stats, setStats] = useState<FeedbackStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<'unreviewed' | 'all'>('unreviewed');

	const loadData = useCallback(async () => {
		try {
			const [fbRes, statsRes] = await Promise.all([
				fetch(`${API_BASE}/api/email/classifier/feedback?${
					filter === 'unreviewed' ? 'reviewed=false&' : ''
				}limit=50`),
				fetch(`${API_BASE}/api/email/classifier/feedback/stats`),
			]);

			if (fbRes.ok) {
				const data = await fbRes.json();
				setFeedback(data.feedback);
			}
			if (statsRes.ok) {
				setStats(await statsRes.json());
			}
		} finally {
			setLoading(false);
		}
	}, [filter]);

	useEffect(() => { loadData(); }, [loadData]);

	const handleMarkReviewed = async (id: string) => {
		const res = await fetch(`${API_BASE}/api/email/classifier/feedback/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reviewed: true }),
		});
		if (res.ok) loadData();
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
			</div>
		);
	}

	return (
		<div className="p-4 space-y-4">
			{/* Stats bar */}
			{stats && (
				<div className="flex items-center gap-4 p-3 bg-[var(--surface-accent)]/30 rounded-lg border border-[var(--border-subtle)]">
					<div className="text-center">
						<div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
							{stats.correction_rate_pct}%
						</div>
						<div className="text-[10px] text-[var(--text-muted)]">correction rate</div>
					</div>
					<div className="w-px h-8 bg-[var(--border-subtle)]" />
					<div className="text-center">
						<div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
							{stats.week_corrections}
						</div>
						<div className="text-[10px] text-[var(--text-muted)]">this week</div>
					</div>
					<div className="w-px h-8 bg-[var(--border-subtle)]" />
					<div className="text-center">
						<div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
							{stats.unreviewed}
						</div>
						<div className="text-[10px] text-[var(--text-muted)]">unreviewed</div>
					</div>
					<div className="w-px h-8 bg-[var(--border-subtle)]" />
					<div className="text-center">
						<div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
							{stats.eval_set_size}
						</div>
						<div className="text-[10px] text-[var(--text-muted)]">eval set</div>
					</div>

					{stats.drift_warning && (
						<>
							<div className="flex-1" />
							<div className="flex items-center gap-1.5 text-[11px] text-amber-400">
								<AlertTriangle className="w-3.5 h-3.5" />
								Drift detected
							</div>
						</>
					)}
				</div>
			)}

			{/* Category flows */}
			{stats && stats.category_flows.length > 0 && (
				<div className="space-y-1">
					<span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
						Common Corrections
					</span>
					<div className="flex flex-wrap gap-1.5">
						{stats.category_flows.map((flow, i) => {
							const fromCfg = CATEGORY_LABELS[flow.from] || CATEGORY_LABELS.fyi;
							const toCfg = CATEGORY_LABELS[flow.to] || CATEGORY_LABELS.fyi;
							return (
								<span key={i} className="flex items-center gap-1 text-[10px] bg-[var(--surface-accent)] px-2 py-1 rounded-md">
									<span className={fromCfg.color}>{fromCfg.label}</span>
									<span className="text-[var(--text-muted)]">→</span>
									<span className={toCfg.color}>{toCfg.label}</span>
									<span className="text-[var(--text-muted)] tabular-nums">({flow.count})</span>
								</span>
							);
						})}
					</div>
				</div>
			)}

			{/* Filter toggle */}
			<div className="flex items-center gap-2">
				<button
					onClick={() => setFilter('unreviewed')}
					className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
						filter === 'unreviewed'
							? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
							: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
					}`}
				>
					Unreviewed
				</button>
				<button
					onClick={() => setFilter('all')}
					className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
						filter === 'all'
							? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
							: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
					}`}
				>
					All
				</button>
			</div>

			{/* Feedback entries */}
			{feedback.length === 0 ? (
				<div className="flex flex-col items-center py-8">
					<Edit3 className="w-5 h-5 text-[var(--text-muted)] opacity-40 mb-2" />
					<span className="text-xs text-[var(--text-muted)]">No feedback yet</span>
					<span className="text-[10px] text-[var(--text-muted)] mt-1">
						Corrections appear here when you reclassify emails
					</span>
				</div>
			) : (
				<div className="space-y-1">
					{feedback.map(entry => {
						const fromCfg = CATEGORY_LABELS[entry.original_category] || CATEGORY_LABELS.fyi;
						const toCfg = CATEGORY_LABELS[entry.corrected_category] || CATEGORY_LABELS.fyi;

						return (
							<div
								key={entry.id}
								className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-accent)]/30 transition-colors"
							>
								{/* Category transition */}
								<div className="flex items-center gap-1 flex-shrink-0">
									<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${fromCfg.bg} ${fromCfg.color}`}>
										{fromCfg.label}
									</span>
									<span className="text-[10px] text-[var(--text-muted)]">→</span>
									<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${toCfg.bg} ${toCfg.color}`}>
										{toCfg.label}
									</span>
								</div>

								{/* Subject */}
								<div className="flex-1 min-w-0">
									<div className="text-[11px] text-[var(--text-secondary)] truncate">
										{entry.subject || '(no subject)'}
									</div>
									{entry.notes && (
										<div className="text-[10px] text-[var(--text-muted)] truncate">
											{entry.notes}
										</div>
									)}
								</div>

								{/* Rule created indicator */}
								{entry.rule_created && (
									<span className="text-[9px] text-violet-400 flex-shrink-0" title="Rule created from this correction">
										+rule
									</span>
								)}

								{/* Date */}
								<span className="text-[10px] text-[var(--text-muted)] tabular-nums flex-shrink-0">
									{new Date(entry.created_at).toLocaleDateString('en-US', {
										month: 'short', day: 'numeric',
									})}
								</span>

								{/* Mark reviewed */}
								{!entry.reviewed && (
									<button
										onClick={() => handleMarkReviewed(entry.id)}
										className="p-1 text-[var(--text-muted)] hover:text-emerald-400 transition-colors flex-shrink-0"
										title="Mark as reviewed"
									>
										<Check className="w-3 h-3" />
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ==========================================
// INLINE RECLASSIFY POPOVER (exported for use in EmailWindowContent)
// ==========================================

export function ReclassifyPopover({
	classificationId,
	currentCategory,
	sender,
	onClose,
	onReclassified,
}: {
	classificationId: string;
	currentCategory: string;
	sender: string | null;
	onClose: () => void;
	onReclassified: (newCategory: string) => void;
}) {
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [notes, setNotes] = useState('');
	const [createRule, setCreateRule] = useState(false);
	const [saving, setSaving] = useState(false);
	const [showForm, setShowForm] = useState(false);

	const handleCategoryClick = (cat: string) => {
		if (cat === currentCategory) return;
		setSelectedCategory(cat);
		setShowForm(true);
	};

	const handleSubmit = async () => {
		if (!selectedCategory) return;
		setSaving(true);
		try {
			const res = await fetch(`${API_BASE}/api/email/classifications/${classificationId}/reclassify`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					category: selectedCategory,
					notes: notes.trim() || null,
					create_rule: createRule,
				}),
			});
			if (res.ok) {
				onReclassified(selectedCategory);
				onClose();
			}
		} finally {
			setSaving(false);
		}
	};

	// Extract sender display for the rule checkbox
	const senderDisplay = sender
		? (sender.match(/<(.+?)>/)?.[1] || sender).split('@')[1] || sender
		: null;

	return (
		<div
			className="absolute z-50 bg-[var(--surface-overlay)] border border-[var(--border-subtle)] rounded-lg shadow-xl p-2 min-w-[220px]"
			onClick={e => e.stopPropagation()}
		>
			{/* Category options */}
			<div className="space-y-0.5">
				{CATEGORY_OPTIONS.map(cat => {
					const cfg = CATEGORY_LABELS[cat];
					const isCurrent = cat === currentCategory;
					const isSelected = cat === selectedCategory;

					return (
						<button
							key={cat}
							onClick={() => handleCategoryClick(cat)}
							disabled={isCurrent}
							className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${
								isSelected
									? `${cfg.bg} ${cfg.color}`
									: isCurrent
										? 'opacity-30 cursor-not-allowed'
										: 'hover:bg-[var(--surface-accent)]'
							}`}
						>
							<span className={`text-[11px] font-medium ${isSelected ? cfg.color : 'text-[var(--text-secondary)]'}`}>
								{cfg.label}
							</span>
							{isCurrent && (
								<span className="text-[9px] text-[var(--text-muted)] ml-auto">current</span>
							)}
							{isSelected && (
								<Check className="w-3 h-3 ml-auto" />
							)}
						</button>
					);
				})}
			</div>

			{/* Expanded form */}
			{showForm && selectedCategory && (
				<div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-2">
					{/* Notes */}
					<textarea
						value={notes}
						onChange={e => setNotes(e.target.value)}
						placeholder="Why is this wrong? (optional)"
						rows={2}
						className="w-full text-[11px] bg-[var(--surface-accent)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] resize-none"
						autoFocus
					/>

					{/* Create rule checkbox */}
					{sender && (
						<label className="flex items-start gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={createRule}
								onChange={e => setCreateRule(e.target.checked)}
								className="rounded border-[var(--border-subtle)] bg-[var(--surface-accent)] mt-0.5"
							/>
							<span className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
								Always classify emails from {senderDisplay} as {CATEGORY_LABELS[selectedCategory]?.label}
							</span>
						</label>
					)}

					{/* Submit */}
					<div className="flex items-center gap-2">
						<button
							onClick={handleSubmit}
							disabled={saving}
							className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 disabled:opacity-50 transition-colors"
						>
							{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
							Reclassify
						</button>
						<button
							onClick={onClose}
							className="px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default ClassifierSettings;
