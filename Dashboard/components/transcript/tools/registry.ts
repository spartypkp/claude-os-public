/**
 * Tool Registry — Single source of truth for tool rendering.
 *
 * Every tool gets: icon, color, category, one-liner, showToolName.
 * TranscriptViewer imports from here instead of maintaining parallel maps.
 */
import {
	Activity,
	Archive,
	BarChart3,
	Briefcase,
	Calendar,
	CheckCircle,
	Chrome,
	Clock,
	Contact,
	Download,
	Eye,
	FileEdit,
	FilePlus,
	FileText,
	Folder,
	Globe,
	ListChecks,
	ListTodo,
	Mail,
	MessageCircleQuestion,
	MessageCircleReply,
	MessageSquare,
	Network,
	PawPrint,
	PenLine,
	RefreshCw,
	Search,
	Send,
	Square,
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
		color: 'var(--color-info)', // AGENT_COLOR
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
		icon: Download,
		color: '#64748b',
		category: 'tool',
		getOneLiner: (input) => {
			const id = input.raw?.task_id ? String(input.raw.task_id).slice(0, 8) : '';
			const isBlocking = input.raw?.block !== false;
			if (id) return isBlocking ? `await ${id}` : `read ${id}`;
			return 'task output';
		},
		showToolName: false,
	},
	TaskStop: {
		icon: Square,
		color: 'var(--color-error)',
		category: 'tool',
		getOneLiner: (input) => {
			const id = input.raw?.task_id ? String(input.raw.task_id).slice(0, 8) : '';
			return id ? `stop ${id}` : 'stop task';
		},
		showToolName: false,
	},
	// ─── Task Management (Todo List) ────────────────────────────────────────
	// These are checklist/todo operations — NOT agent spawning.
	// The "Task" prefix is Claude Code's naming, not ours.
	TodoWrite: {
		icon: ListTodo,
		color: '#10b981',
		category: 'tool',
		chipLabel: 'todo',
		getOneLiner: (input) => {
			const todos = input.raw?.todos;
			if (Array.isArray(todos)) {
				const active = todos.filter((t: { status?: string }) => t.status === 'in_progress').length;
				return active > 0 ? `${todos.length} items (${active} active)` : `${todos.length} items`;
			}
			return 'update list';
		},
		showToolName: true,
	},
	TaskCreate: {
		icon: ListTodo,
		color: '#10b981',
		category: 'tool',
		chipLabel: 'todo',
		getOneLiner: (input) => {
			const subject = input.raw?.subject ? String(input.raw.subject) : '';
			return subject ? `+ ${truncate(subject, 42)}` : 'add item';
		},
		showToolName: true,
	},
	TaskUpdate: {
		icon: ListTodo,
		color: '#10b981',
		category: 'tool',
		chipLabel: 'todo',
		getOneLiner: (input) => {
			const status = input.raw?.status ? String(input.raw.status) : '';
			const id = input.raw?.taskId ? String(input.raw.taskId) : '';
			const subject = input.raw?.subject ? String(input.raw.subject) : '';
			if (status === 'completed') return id ? `#${id} → done` : 'done';
			if (status === 'in_progress') return id ? `#${id} → active` : 'started';
			if (status === 'deleted') return id ? `#${id} → deleted` : 'deleted';
			if (subject) return id ? `#${id} ${truncate(subject, 30)}` : truncate(subject, 35);
			return id ? `update #${id}` : 'update';
		},
		showToolName: true,
	},
	TaskList: {
		icon: ListTodo,
		color: '#10b981',
		category: 'tool',
		chipLabel: 'todo',
		getOneLiner: () => 'list',
		showToolName: true,
	},
	TaskGet: {
		icon: ListTodo,
		color: '#10b981',
		category: 'tool',
		chipLabel: 'todo',
		getOneLiner: (input) => {
			const id = input.raw?.taskId ? `#${input.raw.taskId}` : '';
			return id ? `get ${id}` : 'get';
		},
		showToolName: true,
	},

	// ─── Claude Code: Interactive / System Events ───────────────────────────
	AskUserQuestion: {
		icon: MessageCircleQuestion,
		color: 'var(--color-warning)',
		category: 'interactive',
		chipLabel: 'QUESTION',
		getOneLiner: (input) => {
			const questions = input.raw?.questions;
			if (Array.isArray(questions) && questions.length > 0) {
				const q = questions[0] as { question?: string };
				if (q.question) return truncate(q.question, 50);
			}
			return 'Question for you';
		},
		showToolName: true,
	},
	EnterPlanMode: {
		icon: Workflow,
		color: 'var(--color-info)',
		category: 'system',
		getOneLiner: () => 'Entering plan mode',
		showToolName: false,
	},
	ExitPlanMode: {
		icon: Workflow,
		color: 'var(--color-success)',
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

	// ─── Claude Code: MCP Management ───────────────────────────────────────
	ToolSearch: {
		icon: Search,
		color: 'var(--color-info)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'MCP',
		getOneLiner: (input) => {
			const query = input.raw?.query ? String(input.raw.query) : '';
			return query ? `search "${truncate(query, 30)}"` : 'search tools';
		},
	},
	ListMcpResourcesTool: {
		icon: ListChecks,
		color: 'var(--color-info)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'MCP',
		getOneLiner: (input) => {
			const server = input.raw?.server ? String(input.raw.server) : '';
			return server ? `resources · ${server}` : 'list resources';
		},
	},
	ReadMcpResourceTool: {
		icon: FileText,
		color: 'var(--color-info)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'MCP',
		getOneLiner: (input) => {
			const uri = input.raw?.uri ? String(input.raw.uri) : '';
			const server = input.raw?.server ? String(input.raw.server) : '';
			if (uri) {
				// Show the last meaningful segment of the URI
				const parts = uri.split('/').filter(Boolean);
				const last = parts[parts.length - 1] || uri;
				return server ? `${server} · ${truncate(last, 25)}` : truncate(last, 35);
			}
			return server ? `read · ${server}` : 'read resource';
		},
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
	day: {
		icon: PenLine,
		color: '#64748b',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.operation || '';
			if (op === 'log') {
				const desc = input.raw?.description ? String(input.raw.description) : '';
				return desc ? truncate(desc, 55) : 'log';
			}
			if (op === 'priority') {
				const content = input.raw?.content ? String(input.raw.content) : '';
				const level = input.raw?.level ? String(input.raw.level) : '';
				return content ? `${level ? level + ': ' : ''}${truncate(content, 40)}` : 'create priority';
			}
			if (op === 'complete') return `complete ${String(input.raw?.id || '')}`;
			if (op === 'delete') return `delete ${String(input.raw?.id || '')}`;
			if (op === 'priorities') return 'list priorities';
			return op || 'day';
		},
	},
	// Legacy: kept for old transcript rendering
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
		color: 'var(--color-success)',
		category: 'system',
		getOneLiner: (input) => {
			const summary = input.raw?.summary ? String(input.raw.summary) : '';
			return summary ? truncate(summary, 45) : 'Session complete';
		},
		showToolName: true,
	},
	// Legacy: kept for old transcript rendering (now team("reply"))
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
	// Legacy: kept for old transcript rendering (now telegram("show"))
	show: {
		icon: Eye,
		color: 'var(--color-primary)',
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
		color: 'var(--color-claude)',
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
		color: 'var(--color-success)',
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
		color: 'var(--color-warning)',
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
		color: 'var(--color-error)',
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
		color: 'var(--color-primary)',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input, result) => {
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
			if (op === 'triage') {
				const count = (() => {
					if (!result?.data || typeof result.data !== 'object') return 0;
					const d = result.data as Record<string, unknown>;
					return typeof d.unhandled === 'number' ? d.unhandled : 0;
				})();
				return count > 0 ? `triage · ${count} unhandled` : 'triage';
			}
			if (op === 'unread') {
				const account = input.raw?.account ? String(input.raw.account) : '';
				return account ? `unread · ${account.split('@')[0]}` : 'check unread';
			}
			if (op === 'read') {
				const msgId = input.raw?.message_id ? String(input.raw.message_id).slice(0, 8) : '';
				return msgId ? `read ${msgId}` : 'read email';
			}
			if (op === 'classify') {
				const category = input.raw?.category ? String(input.raw.category) : '';
				const displayName = input.raw?.display_name ? String(input.raw.display_name) : '';
				if (displayName) return `classify · ${truncate(displayName, 25)}`;
				return category ? `classify · ${category}` : 'classify';
			}
			if (op === 'handle') return 'mark handled';
			if (op === 'accounts') return 'list accounts';
			if (op === 'discover') return 'discover accounts';
			return String(op) || 'manage';
		},
	},
	messages: {
		icon: MessageSquare,
		color: 'var(--color-claude)',
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
		color: 'var(--color-info)',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.operation || '';
			const name = input.raw?.name ? String(input.raw.name) : '';
			const slug = input.raw?.slug ? String(input.raw.slug) : '';
			const company = input.raw?.company ? String(input.raw.company) : '';
			if (op === 'list') {
				const tier = input.raw?.tier ? String(input.raw.tier) : '';
				const stage = input.raw?.stage ? String(input.raw.stage) : '';
				if (tier) return `${tier}-tier pipeline`;
				if (stage) return `${stage} pipeline`;
				return 'list pipeline';
			}
			if (op === 'get') return slug || 'get details';
			if (op === 'create') return company ? `+ ${truncate(company, 30)}` : 'create';
			if (op === 'close') return slug ? `close ${slug}` : 'close';
			if (op === 'add_event') return slug ? `event → ${slug}` : 'add event';
			if (op === 'add_contact') return slug ? `contact → ${slug}` : 'add contact';
			if (name) return `${op} ${truncate(name, 35)}`;
			if (slug) return `${op} ${truncate(slug, 35)}`;
			if (op === 'sync') return 'sync pipeline';
			return op || 'manage';
		},
	},
	pet: {
		icon: PawPrint,
		color: 'var(--color-warning)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'EMBER',
		getOneLiner: (input) => {
			const op = input.operation || '';
			if (op === 'note' && input.raw?.message) return `note: ${truncate(String(input.raw.message), 30)}`;
			if (op === 'status') return 'check on Ember';
			if (op === 'feed') return 'feed Ember';
			if (op === 'play') return 'play with Ember';
			if (op === 'history') return 'Ember history';
			return op || 'check';
		},
	},
	telegram: {
		icon: Send,
		color: 'var(--color-primary)',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			const target = input.raw?.target ? String(input.raw.target) : '';
			if (op === 'send') {
				const text = input.raw?.text ? String(input.raw.text) : '';
				const dest = target || 'owner';
				return text ? `→ ${dest}: ${truncate(text, 25)}` : `send → ${dest}`;
			}
			if (op === 'read') return target ? `read ${target}` : 'read';
			if (op === 'show') {
				const what = input.raw?.what ? String(input.raw.what) : '';
				return what ? `show ${truncate(what, 25)}` : 'show';
			}
			if (op === 'info') return 'info';
			return String(op) || 'message';
		},
	},
	schedule: {
		icon: Clock,
		color: '#8b5cf6',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			if (op === 'add') {
				const expr = input.raw?.expression ? String(input.raw.expression) : '';
				const payload = input.raw?.payload ? String(input.raw.payload) : '';
				// Show payload for reminders, expression for cron
				if (payload) return `+ ${truncate(payload, 35)}`;
				if (expr) return `+ ${truncate(expr, 35)}`;
				return 'add entry';
			}
			if (op === 'list') return 'list entries';
			if (op === 'remove') return 'remove entry';
			if (op === 'enable') return 'enable entry';
			if (op === 'disable') return 'disable entry';
			if (op === 'history') return 'run history';
			return String(op) || 'manage';
		},
	},
	analytics: {
		icon: BarChart3,
		color: 'var(--color-info)',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			const days = input.raw?.days ? `${input.raw.days}d` : '';
			if (op === 'specialists') return days ? `specialists · ${days}` : 'specialists';
			if (op === 'tools') return days ? `tools · ${days}` : 'tools';
			if (op === 'sessions') return days ? `sessions · ${days}` : 'sessions';
			if (op === 'resets') return days ? `resets · ${days}` : 'resets';
			if (op === 'files') return days ? `files · ${days}` : 'files';
			if (op === 'insights') return 'insights';
			if (op === 'subagents') return days ? `subagents · ${days}` : 'subagents';
			return String(op) || 'analytics';
		},
	},
	lineage: {
		icon: Archive,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			if (op === 'search') {
				const q = input.raw?.query ? String(input.raw.query) : '';
				return q ? `"${truncate(q, 30)}"` : 'search';
			}
			if (op === 'read') {
				const filename = input.raw?.filename ? String(input.raw.filename) : '';
				return filename ? truncate(filename, 30) : 'read entry';
			}
			if (op === 'list') return 'list entries';
			return String(op) || 'archive';
		},
	},
	release: {
		icon: Zap,
		color: 'var(--color-success)',
		category: 'tool',
		showToolName: true,
		getOneLiner: (input) => {
			const op = input.raw?.operation || '';
			const slug = input.raw?.slug ? String(input.raw.slug) : '';
			if (op === 'list') return 'pending features';
			if (op === 'get') return slug || 'get feature';
			if (op === 'mark_ready') return slug ? `ready: ${slug}` : 'mark ready';
			if (op === 'mark_synced') return slug ? `synced: ${slug}` : 'mark synced';
			if (op === 'history') return 'sync history';
			if (op === 'stats') return 'stats';
			return String(op) || 'manage';
		},
	},

	// ─── Chrome DevTools (MCP) ──────────────────────────────────────────────
	// Browser automation tools. Single Chrome icon, CHROME label, orange color.
	// Tool names arrive as mcp__chrome-isolated__X → formatToolName strips to X.

	navigate_page: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const type = input.raw?.type ? String(input.raw.type) : 'url';
			if (type === 'reload') return 'reload';
			if (type === 'back') return 'back';
			if (type === 'forward') return 'forward';
			const url = input.raw?.url ? String(input.raw.url) : '';
			if (url) {
				try {
					const u = new URL(url);
					const path = u.pathname !== '/' ? u.pathname : '';
					return truncate(`${u.host}${path}`, 45);
				} catch { return truncate(url, 45); }
			}
			return 'navigate';
		},
	},
	new_page: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const url = input.raw?.url ? String(input.raw.url) : '';
			if (url) {
				try { return `new tab · ${new URL(url).host}`; } catch { return `new tab · ${truncate(url, 30)}`; }
			}
			return 'new tab';
		},
	},
	select_page: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const id = input.raw?.pageId;
			return id !== undefined ? `select tab ${id}` : 'select tab';
		},
	},
	list_pages: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: () => 'list tabs',
	},
	close_page: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const id = input.raw?.pageId;
			return id !== undefined ? `close tab ${id}` : 'close tab';
		},
	},
	resize_page: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const w = input.raw?.width;
			const h = input.raw?.height;
			return w && h ? `resize ${w}×${h}` : 'resize';
		},
	},
	click: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const uid = input.raw?.uid ? String(input.raw.uid) : '';
			const dbl = input.raw?.dblClick ? 'dblclick' : 'click';
			return uid ? `${dbl} ${uid}` : dbl;
		},
	},
	fill: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const uid = input.raw?.uid ? String(input.raw.uid) : '';
			const val = input.raw?.value ? truncate(String(input.raw.value), 20) : '';
			if (uid && val) return `fill ${uid} "${val}"`;
			if (val) return `fill "${val}"`;
			return uid ? `fill ${uid}` : 'fill';
		},
	},
	fill_form: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const els = input.raw?.elements;
			const count = Array.isArray(els) ? els.length : 0;
			return count > 0 ? `fill ${count} fields` : 'fill form';
		},
	},
	hover: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const uid = input.raw?.uid ? String(input.raw.uid) : '';
			return uid ? `hover ${uid}` : 'hover';
		},
	},
	press_key: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const key = input.raw?.key ? String(input.raw.key) : '';
			return key ? `press ${key}` : 'press key';
		},
	},
	upload_file: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const path = input.raw?.filePath ? String(input.raw.filePath).split('/').pop() : '';
			return path ? `upload ${truncate(path, 28)}` : 'upload';
		},
	},
	drag: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const from = input.raw?.from_uid ? String(input.raw.from_uid) : '';
			const to = input.raw?.to_uid ? String(input.raw.to_uid) : '';
			if (from && to) return `drag ${from} → ${to}`;
			return 'drag';
		},
	},
	take_screenshot: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			if (input.raw?.uid) return `screenshot ${input.raw.uid}`;
			if (input.raw?.fullPage) return 'screenshot full page';
			return 'screenshot';
		},
	},
	take_snapshot: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: () => 'snapshot',
	},
	evaluate_script: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const fn = input.raw?.function ? String(input.raw.function) : '';
			if (fn) {
				const match = fn.match(/\/\/\s*(.+)/);
				if (match) return truncate(match[1], 35);
				const clean = fn.replace(/^\s*\(?\s*\)?\s*=>\s*\{?\s*/, '').trim();
				return truncate(clean.split('\n')[0], 35);
			}
			return 'eval';
		},
	},
	list_network_requests: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const types = input.raw?.resourceTypes;
			if (Array.isArray(types) && types.length > 0) return `network · ${types.join(', ')}`;
			return 'list network';
		},
	},
	get_network_request: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const id = input.raw?.reqid;
			return id !== undefined ? `network #${id}` : 'network request';
		},
	},
	list_console_messages: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const types = input.raw?.types;
			if (Array.isArray(types) && types.length > 0) return `console · ${types.join(', ')}`;
			return 'list console';
		},
	},
	get_console_message: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const id = input.raw?.msgid;
			return id !== undefined ? `console #${id}` : 'console message';
		},
	},
	performance_start_trace: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const reload = input.raw?.reload ? ' + reload' : '';
			return `start trace${reload}`;
		},
	},
	performance_stop_trace: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: () => 'stop trace',
	},
	performance_analyze_insight: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const name = input.raw?.insightName ? String(input.raw.insightName) : '';
			return name ? `insight · ${truncate(name, 28)}` : 'analyze insight';
		},
	},
	handle_dialog: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const action = input.raw?.action ? String(input.raw.action) : '';
			return action ? `dialog · ${action}` : 'dialog';
		},
	},
	emulate: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const parts: string[] = [];
			if (input.raw?.colorScheme) parts.push(String(input.raw.colorScheme));
			if (input.raw?.viewport) parts.push('viewport');
			if (input.raw?.networkConditions) parts.push(String(input.raw.networkConditions));
			return parts.length > 0 ? parts.join(', ') : 'emulate';
		},
	},
	wait_for: {
		icon: Chrome,
		color: 'var(--color-claude)',
		category: 'tool',
		showToolName: true,
		chipLabel: 'CHROME',
		getOneLiner: (input) => {
			const text = input.raw?.text ? String(input.raw.text) : '';
			return text ? `wait for "${truncate(text, 25)}"` : 'wait';
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
