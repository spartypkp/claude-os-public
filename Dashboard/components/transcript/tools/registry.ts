/**
 * Tool Registry — Single source of truth for tool rendering.
 *
 * Every tool gets: icon, color, category, one-liner, showToolName.
 * TranscriptViewer imports from here instead of maintaining parallel maps.
 */
import {
	Activity,
	Briefcase,
	Calendar,
	CheckCircle,
	Contact,
	Download,
	Eye,
	FileEdit,
	FilePlus,
	FileText,
	Folder,
	Globe,
	ListChecks,
	Mail,
	MessageCircleQuestion,
	MessageCircleReply,
	MessageSquare,
	Network,
	PawPrint,
	PenLine,
	RefreshCw,
	Search,
	Star,
	Terminal,
	Workflow,
	Wrench,
	Zap,
} from 'lucide-react';
import type { ParsedToolInput, ParsedToolResult, ToolConfig } from './types';

// =============================================================================
// INPUT/RESULT PARSING
// =============================================================================

/**
 * Parse tool input into semantic structure
 */
export function parseToolInput(
	toolName: string,
	rawInput?: Record<string, unknown>
): ParsedToolInput {
	if (!rawInput) return { raw: {} };

	const input: ParsedToolInput = { raw: rawInput };

	// Check for truncation — preserved small fields are still in rawInput
	if ('_truncated' in rawInput) {
		input.truncated = true;
		const preview = String(rawInput.preview || '');
		const fileMatch = preview.match(/"file_path":\s*"([^"]+)"/);
		if (fileMatch) {
			input.filePath = fileMatch[1];
			input.fileName = fileMatch[1].split('/').pop();
		}
		// Don't return early — fall through to extract preserved fields
	}

	// File path
	if (rawInput.file_path) {
		const path = String(rawInput.file_path);
		input.filePath = path;
		const parts = path.split('/');
		input.fileName = parts.pop() || path;
		input.parentDir = parts.length > 0 ? parts.pop() : undefined;
	}

	// Content
	if (rawInput.content) input.content = String(rawInput.content);

	// Search patterns
	if (rawInput.pattern) input.pattern = String(rawInput.pattern);
	if (rawInput.query) input.query = String(rawInput.query);

	// Bash
	if (rawInput.command) input.command = String(rawInput.command);
	if (rawInput.description) input.description = String(rawInput.description);

	// MCP operation
	if (rawInput.operation) input.operation = String(rawInput.operation);

	// Contact
	if (rawInput.name && toolName.includes('contact')) input.contactName = String(rawInput.name);
	if (rawInput.query && toolName.includes('contact')) input.contactQuery = String(rawInput.query);

	// Priority
	if (rawInput.content && toolName.includes('priority')) input.priorityContent = String(rawInput.content);
	if (rawInput.id) input.priorityId = String(rawInput.id);

	return input;
}

/**
 * Parse tool result — uses structured checks, not string matching
 */
export function parseToolResult(rawResult?: string): ParsedToolResult | undefined {
	if (!rawResult) return undefined;

	const result: ParsedToolResult = { raw: rawResult };

	// Try JSON first — MCP tools return structured responses
	try {
		const parsed = JSON.parse(rawResult);
		result.data = parsed;
		if (typeof parsed === 'object' && parsed !== null) {
			if ('success' in parsed) result.success = Boolean(parsed.success);
			if ('error' in parsed) {
				result.error = String(parsed.error);
				result.success = false;
			}
		}
		if (result.success === undefined) result.success = true;
		result.content = rawResult;
		return result;
	} catch {
		// Not JSON — check for error patterns
	}

	// Heuristic for non-JSON results
	const lower = rawResult.toLowerCase();
	const hasError = lower.startsWith('error:') ||
		lower.startsWith('failed:') ||
		lower.includes('traceback (most recent') ||
		lower.includes('exception:');

	if (hasError) {
		result.error = rawResult;
		result.success = false;
	} else {
		result.success = true;
		result.content = rawResult;
	}

	return result;
}

// =============================================================================
// ONE-LINER HELPERS
// =============================================================================

function truncate(s: string, max: number): string {
	return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function fileName(input: ParsedToolInput): string {
	return input.fileName || input.filePath?.split('/').pop() || 'file';
}

// =============================================================================
// TOOL CONFIGS — Unified registry (icon + color + category + oneLiner)
// =============================================================================

const toolConfigs: Record<string, ToolConfig> = {

	// ─── Claude Code: File Operations ───────────────────────────────────────
	Read: {
		icon: FileText,
		color: 'var(--color-cyan)',
		category: 'tool',
		getOneLiner: (input) => `Read ${fileName(input)}`,
		showToolName: false,
	},
	Write: {
		icon: FilePlus,
		color: 'var(--color-warning)',
		category: 'tool',
		getOneLiner: (input) => `Write ${fileName(input)}`,
		showToolName: false,
	},
	Edit: {
		icon: FileEdit,
		color: 'var(--color-warning)',
		category: 'tool',
		getOneLiner: (input) => `Edit ${fileName(input)}`,
		showToolName: false,
	},
	NotebookEdit: {
		icon: FileEdit,
		color: 'var(--color-warning)',
		category: 'tool',
		getOneLiner: (input) => {
			const path = input.raw?.notebook_path ? String(input.raw.notebook_path).split('/').pop() : 'notebook';
			const mode = input.raw?.edit_mode ? String(input.raw.edit_mode) : 'edit';
			return `${mode} ${path}`;
		},
		showToolName: true,
		chipLabel: 'NOTEBOOK',
	},

	// ─── Claude Code: Terminal ──────────────────────────────────────────────
	Bash: {
		icon: Terminal,
		color: 'var(--color-primary)',
		category: 'tool',
		getOneLiner: (input) => {
			if (input.description) return truncate(input.description, 55);
			if (!input.command) return 'command';
			const parts = input.command.split(/\s*(?:&&|\|\|?|;)\s*/);
			const meaningful = parts.find(p => {
				const trimmed = p.trim();
				return trimmed && !trimmed.startsWith('cd ');
			}) || parts[0] || input.command;
			return truncate(meaningful.trim().replace(/\/(?:Users|home|var|tmp|opt)[^\s"']+\/([^\s"'/]+)/g, '$1'), 40);
		},
		showToolName: true,
	},

	// ─── Claude Code: Search ────────────────────────────────────────────────
	Grep: {
		icon: Search,
		color: 'var(--color-info)',
		category: 'tool',
		getOneLiner: (input) => input.pattern ? truncate(`"${input.pattern}"`, 38) : 'search',
		showToolName: false,
	},
	Glob: {
		icon: Folder,
		color: 'var(--color-cyan)',
		category: 'tool',
		getOneLiner: (input) => input.pattern ? truncate(`"${input.pattern}"`, 38) : 'search',
		showToolName: false,
	},

	// ─── Claude Code: Web ───────────────────────────────────────────────────
	WebSearch: {
		icon: Globe,
		color: 'var(--color-success)',
		category: 'tool',
		getOneLiner: (input) => {
			if (input.query) return truncate(`"${input.query}"`, 42);
			return 'web search';
		},
		showToolName: false,
	},
	WebFetch: {
		icon: Download,
		color: 'var(--color-success)',
		category: 'tool',
		getOneLiner: (input) => {
			if (input.raw?.url) {
				const url = String(input.raw.url);
				const domain = url.includes('://') ? url.split('://')[1]?.split('/')[0] : url.slice(0, 30);
				return domain || url.slice(0, 30);
			}
			return 'fetch';
		},
		showToolName: false,
	},

	// ─── Claude Code: Tasks & Meta ──────────────────────────────────────────
	Task: {
		icon: Zap,
		color: '#8b5cf6',
		category: 'tool',
		getOneLiner: (input) => {
			const agentType = input.raw?.subagent_type ? String(input.raw.subagent_type) : '';
			const desc = input.raw?.description ? String(input.raw.description) : '';
			if (agentType && desc) return truncate(`${agentType} · ${desc}`, 50);
			if (desc) return truncate(desc, 45);
			if (agentType) return agentType;
			return 'subagent';
		},
		showToolName: false,
	},
	TaskOutput: {
		icon: Zap,
		color: '#8b5cf6',
		category: 'tool',
		getOneLiner: (input) => {
			const id = input.raw?.task_id ? String(input.raw.task_id).slice(0, 8) : '';
			return id ? `output ${id}` : 'task output';
		},
		showToolName: true,
		chipLabel: 'TASK',
	},
	TaskStop: {
		icon: Zap,
		color: 'var(--color-error)',
		category: 'tool',
		getOneLiner: (input) => {
			const id = input.raw?.task_id ? String(input.raw.task_id).slice(0, 8) : '';
			return id ? `stop ${id}` : 'stop task';
		},
		showToolName: true,
		chipLabel: 'TASK',
	},
	TodoWrite: {
		icon: ListChecks,
		color: 'var(--color-primary)',
		category: 'tool',
		getOneLiner: (input) => {
			const todos = input.raw?.todos;
			if (Array.isArray(todos)) {
				const active = todos.filter((t: { status?: string }) => t.status === 'in_progress').length;
				return active > 0 ? `${todos.length} tasks (${active} active)` : `${todos.length} tasks`;
			}
			return 'update tasks';
		},
		showToolName: false,
	},
	TaskCreate: {
		icon: ListChecks,
		color: 'var(--color-primary)',
		category: 'tool',
		getOneLiner: (input) => {
			const subject = input.raw?.subject ? String(input.raw.subject) : '';
			return subject ? `+ ${truncate(subject, 42)}` : 'create task';
		},
		showToolName: false,
	},
	TaskUpdate: {
		icon: ListChecks,
		color: 'var(--color-primary)',
		category: 'tool',
		getOneLiner: (input) => {
			const status = input.raw?.status ? String(input.raw.status) : '';
			const id = input.raw?.taskId ? String(input.raw.taskId) : '';
			const subject = input.raw?.subject ? String(input.raw.subject) : '';
			if (status === 'completed') return id ? `#${id} → done` : 'task done';
			if (status === 'in_progress') return id ? `#${id} → active` : 'task started';
			if (status === 'deleted') return id ? `#${id} → deleted` : 'task deleted';
			if (subject) return id ? `#${id} ${truncate(subject, 30)}` : truncate(subject, 35);
			return id ? `update #${id}` : 'update task';
		},
		showToolName: false,
	},
	TaskList: {
		icon: ListChecks,
		color: 'var(--color-primary)',
		category: 'tool',
		getOneLiner: () => 'list tasks',
		showToolName: false,
	},
	TaskGet: {
		icon: ListChecks,
		color: 'var(--color-primary)',
		category: 'tool',
		getOneLiner: (input) => {
			const id = input.raw?.taskId ? `#${input.raw.taskId}` : '';
			return id ? `get ${id}` : 'get task';
		},
		showToolName: false,
	},

	// ─── Claude Code: Interactive / System Events ───────────────────────────
	AskUserQuestion: {
		icon: MessageCircleQuestion,
		color: 'var(--color-warning)',
		category: 'system',
		getOneLiner: (input) => {
			const questions = input.raw?.questions;
			if (Array.isArray(questions) && questions.length > 0) {
				const q = questions[0] as { question?: string };
				if (q.question) return truncate(q.question, 50);
			}
			return 'Question for you';
		},
		showToolName: false,
	},
	EnterPlanMode: {
		icon: Workflow,
		color: '#8b5cf6',
		category: 'system',
		getOneLiner: () => 'Entering plan mode',
		showToolName: false,
	},
	ExitPlanMode: {
		icon: Workflow,
		color: '#22c55e',
		category: 'system',
		getOneLiner: () => 'Plan ready for review',
		showToolName: false,
	},
	Skill: {
		icon: Zap,
		color: 'var(--color-warning)',
		category: 'system',
		getOneLiner: (input) => {
			const skill = input.raw?.skill ? String(input.raw.skill) : '';
			return skill ? `/${skill}` : '/skill';
		},
		showToolName: false,
	},

	// ─── MCP Life: System Events ────────────────────────────────────────────
	status: {
		icon: Activity,
		color: 'var(--color-claude)',
		category: 'system',
		getOneLiner: (input) => {
			const text = input.raw?.text ? String(input.raw.text) : '';
			return text ? truncate(text, 40) : 'update';
		},
		showToolName: true,
	},
	timeline: {
		icon: PenLine,
		color: '#64748b',
		category: 'system',
		getOneLiner: (input) => {
			const desc = input.raw?.description ? String(input.raw.description) : '';
			return desc ? truncate(desc, 55) : 'log';
		},
		showToolName: true,
	},
	reset: {
		icon: RefreshCw,
		color: '#f97316',
		category: 'system',
		getOneLiner: (input) => {
			const summary = input.raw?.summary ? String(input.raw.summary) : '';
			return summary ? truncate(summary, 45) : 'Reset session';
		},
		showToolName: true,
	},
	done: {
		icon: CheckCircle,
		color: '#22c55e',
		category: 'system',
		getOneLiner: (input) => {
			const summary = input.raw?.summary ? String(input.raw.summary) : '';
			return summary ? truncate(summary, 45) : 'Session complete';
		},
		showToolName: true,
	},
	reply_to_chief: {
		icon: MessageCircleReply,
		color: 'var(--color-claude)',
		category: 'system',
		getOneLiner: (input) => {
			const msg = input.raw?.message ? String(input.raw.message) : '';
			return msg ? truncate(msg, 45) : 'reply';
		},
		showToolName: true,
		chipLabel: 'REPLY',
	},
	show: {
		icon: Eye,
		color: '#3b82f6',
		category: 'system',
		getOneLiner: (input) => {
			const what = input.raw?.what ? String(input.raw.what) : '';
			return what ? truncate(what, 35) : 'render';
		},
		showToolName: true,
	},

	// ─── MCP Life: Team / Orchestration ─────────────────────────────────────
	team: {
		icon: Network,
		color: '#8b5cf6',
		category: 'system',
		showToolName: true,
		getOneLiner: (input, result) => {
			const op = input.raw?.operation || '';
			// Helper: extract role from result data
			const resultRole = (() => {
				if (!result?.data || typeof result.data !== 'object') return '';
				const d = result.data as Record<string, unknown>;
				return d.role ? String(d.role) : '';
			})();
			// Helper: check if spawn was routed as request
			const isRequestSent = (() => {
				if (!result?.data || typeof result.data !== 'object') return false;
				return Boolean((result.data as Record<string, unknown>).request_sent);
			})();
			if (op === 'spawn') {
				const role = input.raw?.role ? String(input.raw.role) : '';
				if (isRequestSent) return role ? `Request ${role} → Chief` : 'Spawn request → Chief';
				return role ? `Spawn ${role}` : 'Spawn specialist';
			}
			if (op === 'peek') {
				if (resultRole) return `Peek ${resultRole}`;
				const id = input.raw?.id ? String(input.raw.id) : '';
				// Show truncated ID — could be conversation_id (long) or session prefix (short)
				const displayId = id.length > 12 ? id.slice(0, 12) + '...' : id.slice(0, 8);
				return displayId ? `Peek ${displayId}` : 'Peek session';
			}
			if (op === 'close') {
				if (resultRole) return `Close ${resultRole}`;
				const id = input.raw?.id ? String(input.raw.id) : '';
				const displayId = id.length > 12 ? id.slice(0, 12) + '...' : id.slice(0, 8);
				return displayId ? `Close ${displayId}` : 'Close session';
			}
			if (op === 'list') {
				const count = (() => {
					if (!result?.data || typeof result.data !== 'object') return 0;
					const d = result.data as Record<string, unknown>;
					return typeof d.count === 'number' ? d.count : 0;
				})();
				return count > 0 ? `${count} active` : 'List team';
			}
			if (op === 'message') {
				const msg = input.raw?.message ? String(input.raw.message) : '';
				const target = resultRole || (input.raw?.id ? (() => {
					const id = String(input.raw!.id);
					return id.length > 12 ? id.slice(0, 12) + '...' : id.slice(0, 8);
				})() : '');
				if (target && msg) return `\u2192 ${target}: ${truncate(msg, 30)}`;
				if (msg) return `\u2192 ${truncate(msg, 35)}`;
				return 'Message specialist';
			}
			if (op === 'subscribe') {
				if (resultRole) return `Subscribe to ${resultRole}`;
				return 'Subscribe to specialist';
			}
			return String(op) || 'manage';
		},
	},

	// ─── MCP Life: Data Tools ───────────────────────────────────────────────
	contact: {
		icon: Contact,
		color: '#06b6d4',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.operation || '';
			if (op === 'enrich' || op === 'update') {
				const id = input.raw?.identifier ? String(input.raw.identifier) : input.contactName || '';
				const fields = ['notes', 'tags', 'context_notes', 'role', 'company']
					.filter(f => input.raw?.[f]);
				const detail = fields.length > 0 ? ` + ${fields.slice(0, 2).join(', ')}` : '';
				return id ? truncate(`${id}${detail}`, 40) : `${op}${detail}`;
			}
			if (input.contactQuery) return `search "${truncate(input.contactQuery, 25)}"`;
			if (input.contactName) return input.contactName;
			if (input.raw?.identifier) return String(input.raw.identifier);
			return op || 'lookup';
		},
	},
	priority: {
		icon: Star,
		color: '#f59e0b',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input, result) => {
			const op = input.operation || '';
			const level = input.raw?.level ? String(input.raw.level) : '';
			if (input.priorityContent) {
				const prefix = level && level !== 'medium' ? `${level} · ` : '';
				return `${prefix}${truncate(input.priorityContent, 35)}`;
			}
			// For complete/delete, try to extract content from result
			if (input.priorityId && result?.data) {
				const data = result.data as Record<string, unknown>;
				const content = data.content ? String(data.content) : '';
				if (content) return `${op} "${truncate(content, 30)}"`;
			}
			if (input.priorityId) return `${op} #${input.priorityId.slice(0, 6)}`;
			return op || 'manage';
		},
	},
	calendar: {
		icon: Calendar,
		color: '#3b82f6',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			const title = input.raw?.title ? String(input.raw.title) : '';
			if (op === 'list') {
				const from = input.raw?.from_date ? String(input.raw.from_date).slice(5) : '';
				const to = input.raw?.to_date ? String(input.raw.to_date).slice(5) : '';
				if (from && to && from !== to) return `${from} → ${to}`;
				if (from) return from;
				return 'list events';
			}
			if (op === 'create') {
				return title ? `+ ${truncate(title, 30)}` : 'create event';
			}
			if (op === 'update') {
				return title ? `update ${truncate(title, 28)}` : 'update event';
			}
			if (op === 'delete') {
				return title ? `delete ${truncate(title, 28)}` : 'delete event';
			}
			if (op === 'calendars') return 'list calendars';
			return String(op) || 'manage';
		},
	},
	email: {
		icon: Mail,
		color: '#ef4444',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			if (op === 'search') {
				const q = input.raw?.query ? String(input.raw.query) : '';
				return q ? `"${truncate(q, 30)}"` : 'search';
			}
			if (op === 'send' || op === 'draft') {
				const to = input.raw?.to ? String(input.raw.to) : '';
				const subject = input.raw?.subject ? String(input.raw.subject) : '';
				if (to && subject) return `${op} → ${truncate(subject, 25)}`;
				return to ? `${op} → ${to}` : String(op);
			}
			if (op === 'unread') {
				const account = input.raw?.account ? String(input.raw.account) : '';
				return account ? `unread · ${account.split('@')[0]}` : 'check unread';
			}
			if (op === 'read') {
				const msgId = input.raw?.message_id ? String(input.raw.message_id).slice(0, 8) : '';
				return msgId ? `read ${msgId}` : 'read email';
			}
			if (op === 'accounts') return 'list accounts';
			if (op === 'discover') return 'discover accounts';
			return String(op) || 'manage';
		},
	},
	messages: {
		icon: MessageSquare,
		color: '#22c55e',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || 'read';
			const recipient = input.raw?.recipient ? String(input.raw.recipient) : '';
			const phone = recipient.length > 4 ? `...${recipient.slice(-4)}` : recipient;
			if (op === 'send' && input.raw?.text) {
				const msg = String(input.raw.text);
				return `send "${truncate(msg, 25)}"`;
			}
			return phone ? `${op} ${phone}` : String(op);
		},
	},
	opportunity: {
		icon: Briefcase,
		color: '#8b5cf6',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.operation || '';
			const name = input.raw?.name ? String(input.raw.name) : '';
			const slug = input.raw?.slug ? String(input.raw.slug) : '';
			if (name) return `${op} ${truncate(name, 35)}`;
			if (slug) return `${op} ${truncate(slug, 35)}`;
			if (op === 'list') return 'list opportunities';
			if (op === 'sync') return 'sync pipeline';
			return op || 'manage';
		},
	},
	pet: {
		icon: PawPrint,
		color: '#f59e0b',
		category: 'tool',
		showToolName: true,
		chipLabel: 'PET',
		getOneLiner: (input) => {
			const op = input.operation || '';
			if (op === 'note' && input.raw?.message) return `note: ${truncate(String(input.raw.message), 30)}`;
			if (op === 'status') return 'check on companion';
			if (op === 'feed') return 'feed companion';
			if (op === 'play') return 'play with companion';
			if (op === 'history') return 'companion history';
			return op || 'check';
		},
	},

};

// =============================================================================
// DEFAULT CONFIG (for unknown tools)
// =============================================================================

const defaultConfig: ToolConfig = {
	icon: Wrench,
	color: 'var(--text-tertiary)',
	category: 'tool',
	getOneLiner: (input) => {
		const raw = input.raw || {};
		if (raw.operation) {
			const op = String(raw.operation);
			if (raw.id) return `${op} ${String(raw.id).slice(0, 8)}`;
			if (raw.query) return `${op} "${truncate(String(raw.query), 25)}"`;
			if (raw.name) return `${op} ${truncate(String(raw.name), 25)}`;
			return op;
		}
		if (raw.message) return truncate(String(raw.message), 40);
		if (raw.text) return truncate(String(raw.text), 40);
		if (raw.content) return truncate(String(raw.content), 40);
		if (raw.name) return String(raw.name);
		const keys = Object.keys(raw).filter(k => !k.startsWith('_'));
		if (keys.length > 0) return truncate(String(raw[keys[0]]), 30);
		return '';
	},
	showToolName: true,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get the full config for a tool (icon, color, category, one-liner).
 */
export function getToolConfig(toolName: string): ToolConfig {
	return toolConfigs[toolName] || defaultConfig;
}

/**
 * Get one-liner text + showToolName for a tool.
 */
export function getToolOneLiner(
	toolName: string,
	rawInput?: Record<string, unknown>,
	rawResult?: string
): { text: string; showToolName: boolean; chipLabel?: string } {
	const config = getToolConfig(toolName);
	const input = parseToolInput(toolName, rawInput);
	const result = parseToolResult(rawResult);
	return {
		text: config.getOneLiner(input, result),
		showToolName: config.showToolName ?? true,
		chipLabel: config.chipLabel,
	};
}
