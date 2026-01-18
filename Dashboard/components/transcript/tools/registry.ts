/**
 * Tool Registry - Maps tool names to their rendering configuration
 */
import type { ParsedToolInput, ParsedToolResult, ToolRendererConfig } from './types';

/**
 * Parse tool input into semantic structure
 */
export function parseToolInput(
	toolName: string,
	rawInput?: Record<string, unknown>
): ParsedToolInput {
	if (!rawInput) return { raw: {} };

	const input: ParsedToolInput = { raw: rawInput };

	// Check for truncation
	if ('_truncated' in rawInput) {
		input.truncated = true;
		// Try to extract from preview
		const preview = String(rawInput.preview || '');
		const fileMatch = preview.match(/"file_path":\s*"([^"]+)"/);
		if (fileMatch) {
			input.filePath = fileMatch[1];
			input.fileName = fileMatch[1].split('/').pop();
		}
		return input;
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
	if (rawInput.content) {
		input.content = String(rawInput.content);
	}

	// Search patterns
	if (rawInput.pattern) {
		input.pattern = String(rawInput.pattern);
	}
	if (rawInput.query) {
		input.query = String(rawInput.query);
	}

	// Bash command
	if (rawInput.command) {
		input.command = String(rawInput.command);
	}
	if (rawInput.description) {
		input.description = String(rawInput.description);
	}

	// MCP operation
	if (rawInput.operation) {
		input.operation = String(rawInput.operation);
	}

	// Worker
	if (rawInput.worker_id) {
		input.workerId = String(rawInput.worker_id);
	}
	if (rawInput.instructions) {
		input.instructions = String(rawInput.instructions);
	}

	// Contact
	if (rawInput.name && toolName.includes('contact')) {
		input.contactName = String(rawInput.name);
	}
	if (rawInput.query && toolName.includes('contact')) {
		input.contactQuery = String(rawInput.query);
	}

	// Priority
	if (rawInput.content && toolName.includes('priority')) {
		input.priorityContent = String(rawInput.content);
	}
	if (rawInput.id) {
		input.priorityId = String(rawInput.id);
	}

	return input;
}

/**
 * Parse tool result
 */
export function parseToolResult(rawResult?: string): ParsedToolResult | undefined {
	if (!rawResult) return undefined;

	const result: ParsedToolResult = { raw: rawResult };

	// Check for errors
	const hasError = rawResult.toLowerCase().includes('error') ||
		rawResult.toLowerCase().includes('failed') ||
		rawResult.toLowerCase().includes('exception');

	if (hasError) {
		result.error = rawResult;
		result.success = false;
	} else {
		result.success = true;
		result.content = rawResult;
	}

	// Try to parse as JSON
	try {
		const parsed = JSON.parse(rawResult);
		result.data = parsed;
		if (typeof parsed === 'object' && parsed !== null) {
			if ('success' in parsed) result.success = Boolean(parsed.success);
			if ('error' in parsed) result.error = String(parsed.error);
			if ('worker_id' in parsed) result.content = `Worker ${parsed.worker_id.slice(0, 8)} created`;
		}
	} catch {
		// Not JSON, that's fine
	}

	return result;
}

// =============================================================================
// TOOL RENDERERS
// =============================================================================

/**
 * Read tool - "Read filename"
 */
const readToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const file = input.fileName || input.filePath?.split('/').pop() || 'file';
		return `Read ${file}`;
	},
	showToolName: false,
};

/**
 * Write tool - "Write filename" or "Create filename"
 */
const writeToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const file = input.fileName || input.filePath?.split('/').pop() || 'file';
		return `Write ${file}`;
	},
	showToolName: false,
};

/**
 * Edit tool - "Edit filename"
 */
const editToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const file = input.fileName || input.filePath?.split('/').pop() || 'file';
		return `Edit ${file}`;
	},
	showToolName: false,
};

/**
 * Bash tool - show description, not command
 */
const bashToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		// Use description if available (Claude always provides it)
		if (input.description) {
			const desc = input.description;
			// Truncate if too long
			if (desc.length > 45) {
				return desc.slice(0, 42) + '...';
			}
			return desc;
		}

		// Fallback: clean up the command for display
		if (!input.command) return 'command';

		let cmd = input.command;
		const parts = cmd.split(/\s*(?:&&|\|\|?|;)\s*/);
		const meaningful = parts.find(p => {
			const trimmed = p.trim();
			if (!trimmed) return false;
			if (trimmed.startsWith('cd ')) return false;
			return true;
		}) || parts[0] || cmd;

		let cleaned = meaningful.trim()
			.replace(/\/(?:Users|home|var|tmp|opt)[^\s"']+\/([^\s"'/]+)/g, '$1');

		if (cleaned.length > 40) {
			cleaned = cleaned.slice(0, 37) + '...';
		}

		return cleaned;
	},
	showToolName: true, // Show "Bash" badge since description alone needs context
};

/**
 * Search tools: Grep, Glob
 */
const searchToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		if (input.pattern) {
			const p = input.pattern;
			return p.length > 35 ? `"${p.slice(0, 32)}..."` : `"${p}"`;
		}
		return 'search';
	},
	showToolName: false,
};

/**
 * Web tools: WebSearch, WebFetch
 */
const webToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		if (input.query) {
			const q = input.query;
			return q.length > 40 ? `"${q.slice(0, 37)}..."` : `"${q}"`;
		}
		if (input.raw?.url) {
			const url = String(input.raw.url);
			const domain = url.includes('://')
				? url.split('://')[1]?.split('/')[0]
				: url.slice(0, 30);
			return domain || url.slice(0, 30);
		}
		return 'web';
	},
	showToolName: false,
};

/**
 * Worker tool
 */
const workerToolRenderer: ToolRendererConfig = {
	getOneLiner: (input, result) => {
		const op = input.operation || 'worker';

		if (op === 'create' && input.instructions) {
			const preview = input.instructions.slice(0, 40);
			return preview + (input.instructions.length > 40 ? '...' : '');
		}

		if (op === 'ack') return 'acknowledge';
		if (op === 'list') return 'list workers';

		if (input.workerId) {
			return `${op} ${input.workerId.slice(0, 8)}`;
		}

		return op;
	},
	showToolName: true,
};

/**
 * Contact tool
 */
const contactToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const op = input.operation || 'contact';

		if (input.contactQuery) return `search "${input.contactQuery}"`;
		if (input.contactName) return input.contactName;
		if (input.raw?.identifier) return String(input.raw.identifier);

		return op;
	},
	showToolName: true,
};

/**
 * Priority tool
 */
const priorityToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const op = input.operation || 'priority';

		if (input.priorityContent) {
			const preview = input.priorityContent.slice(0, 35);
			return `${op} "${preview}${input.priorityContent.length > 35 ? '...' : ''}"`;
		}

		if (input.priorityId) return `${op} #${input.priorityId.slice(0, 6)}`;

		return op;
	},
	showToolName: true,
};

/**
 * Status tool - broadcast status update
 */
const statusToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const text = input.raw?.text ? String(input.raw.text) :
			input.raw?.status ? String(input.raw.status) : '';
		if (text) {
			const preview = text.length > 35 ? text.slice(0, 32) + '...' : text;
			return preview;
		}
		return 'Update status';
	},
	showToolName: true, // Show "Status" badge
};

/**
 * Task tool (subagent)
 */
const taskToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		if (input.raw?.description) {
			const desc = String(input.raw.description);
			return desc.length > 45 ? desc.slice(0, 42) + '...' : desc;
		}
		if (input.raw?.subagent_type) {
			return String(input.raw.subagent_type);
		}
		return 'task';
	},
	showToolName: true,
};

/**
 * TodoWrite - shows task count
 */
const todoWriteRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const todos = input.raw?.todos;
		if (Array.isArray(todos)) {
			const inProgress = todos.filter((t: { status?: string; }) => t.status === 'in_progress').length;
			if (inProgress > 0) {
				return `${todos.length} tasks (${inProgress} active)`;
			}
			return `${todos.length} tasks`;
		}
		return 'update tasks';
	},
	showToolName: false,
};

/**
 * Skill tool
 */
const skillToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const skill = input.raw?.skill ? String(input.raw.skill) : 'skill';
		const args = input.raw?.args ? String(input.raw.args) : '';
		const preview = args.length > 30 ? args.slice(0, 27) + '...' : args;
		return preview ? `${skill}: ${preview}` : skill;
	},
	showToolName: false,
};

/**
 * Session spawn tool
 */
const sessionSpawnRenderer: ToolRendererConfig = {
	getOneLiner: (input, result) => {
		const role = input.raw?.role ? String(input.raw.role) : '';
		// Try to get session ID from result
		let sessionId = '';
		if (result?.content) {
			try {
				const data = JSON.parse(result.content);
				sessionId = data.session_id ? String(data.session_id).slice(0, 8) : '';
			} catch { }
		}
		if (sessionId) return `Spawn ${role} → ${sessionId}`;
		return role ? `Spawn ${role}` : 'Spawn session';
	},
	showToolName: false,
};

/**
 * Session close tool
 */
const sessionCloseRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const id = input.raw?.session_id ? String(input.raw.session_id).slice(0, 8) : '';
		return id ? `Close ${id}` : 'Close session';
	},
	showToolName: false,
};

/**
 * Session peek tool
 */
const sessionPeekRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const id = input.raw?.session_id ? String(input.raw.session_id).slice(0, 8) : '';
		return id ? `Peek ${id}` : 'Peek session';
	},
	showToolName: false,
};

/**
 * Apple Messages tool
 */
const messagesRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const op = input.raw?.operation || 'read';
		const phone = input.raw?.phone_number ? String(input.raw.phone_number) : '';
		// Show last 4 digits if phone number
		const phoneHint = phone.length > 4 ? `...${phone.slice(-4)}` : phone;
		if (op === 'send' && input.raw?.message) {
			const msg = String(input.raw.message);
			return `send "${msg.slice(0, 25)}${msg.length > 25 ? '...' : ''}"`;
		}
		return phoneHint ? `${op} ${phoneHint}` : String(op);
	},
	showToolName: false,
};

/**
 * Apple Calendar tool
 */
const calendarRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const op = input.raw?.operation || '';
		if (op === 'list') {
			const from = input.raw?.from_date ? String(input.raw.from_date).slice(5) : ''; // MM-DD
			const to = input.raw?.to_date ? String(input.raw.to_date).slice(5) : '';
			if (from && to && from !== to) return `${from} → ${to}`;
			if (from) return from;
			return 'list events';
		}
		if (op === 'create') {
			const title = input.raw?.title ? String(input.raw.title) : '';
			return title ? `+ ${title.slice(0, 30)}` : 'create event';
		}
		return String(op) || 'calendar';
	},
	showToolName: false,
};

/**
 * Apple Mail tool
 */
const mailRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const op = input.raw?.operation || '';
		if (op === 'search') {
			const term = input.raw?.search_term ? String(input.raw.search_term) : '';
			return term ? `"${term.slice(0, 30)}"` : 'search mail';
		}
		if (op === 'send') {
			const to = input.raw?.to ? String(input.raw.to) : '';
			return to ? `→ ${to}` : 'send email';
		}
		return String(op) || 'mail';
	},
	showToolName: false,
};

/**
 * Voice converse tool
 */
const converseRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const msg = input.raw?.message ? String(input.raw.message) : '';
		if (msg) {
			return `🎤 ${msg.slice(0, 35)}${msg.length > 35 ? '...' : ''}`;
		}
		return '🎤 speaking';
	},
	showToolName: false,
};

/**
 * Ping tool (notification)
 */
const pingRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const msg = input.raw?.message ? String(input.raw.message) : '';
		return msg ? `📢 ${msg.slice(0, 35)}${msg.length > 35 ? '...' : ''}` : '📢 ping';
	},
	showToolName: false,
};

/**
 * Log tool
 */
const logRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const section = input.raw?.section ? String(input.raw.section) : '';
		const content = input.raw?.content ? String(input.raw.content) : '';
		const preview = content.length > 30 ? content.slice(0, 27) + '...' : content;
		return section ? `${section}: ${preview}` : preview || 'log';
	},
	showToolName: false,
};

/**
 * Reset/Done tool
 */
const resetDoneRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const summary = input.raw?.summary ? String(input.raw.summary) : '';
		return summary ? summary.slice(0, 45) + (summary.length > 45 ? '...' : '') : 'session';
	},
	showToolName: true,
};

/**
 * Team tool - spawn, peek, close, list operations
 */
const teamRenderer: ToolRendererConfig = {
	getOneLiner: (input, result) => {
		const op = input.raw?.operation || '';

		if (op === 'spawn') {
			const role = input.raw?.role ? String(input.raw.role) : '';
			// Try to get session ID from result
			let sessionId = '';
			if (result?.content) {
				try {
					const data = JSON.parse(result.content);
					sessionId = data.session_id ? String(data.session_id).slice(0, 8) : '';
				} catch { }
			}
			if (sessionId) return `Spawn ${role} → ${sessionId}`;
			return role ? `Spawn ${role}` : 'Spawn session';
		}

		if (op === 'peek') {
			const id = input.raw?.id ? String(input.raw.id).slice(0, 8) : '';
			return id ? `Peek ${id}` : 'Peek session';
		}

		if (op === 'close') {
			const id = input.raw?.id ? String(input.raw.id).slice(0, 8) : '';
			return id ? `Close ${id}` : 'Close session';
		}

		if (op === 'list') return 'List sessions';

		return String(op) || 'team';
	},
	showToolName: false,
};

/**
 * Mission tool
 */
const missionRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		const name = input.raw?.name ? String(input.raw.name) : '';
		const desc = input.raw?.description ? String(input.raw.description) : '';
		const id = input.raw?.mission_id ? String(input.raw.mission_id).slice(0, 8) : '';
		if (name) return name.slice(0, 40);
		if (desc) return desc.slice(0, 40);
		if (id) return `mission ${id}`;
		return 'mission';
	},
	showToolName: true,
};

/**
 * Default renderer for unknown tools
 */
const defaultToolRenderer: ToolRendererConfig = {
	getOneLiner: (input) => {
		// Try to extract something meaningful
		const raw = input.raw || {};

		// Common patterns
		if (raw.operation) {
			const op = String(raw.operation);
			// Check for common secondary fields
			if (raw.id) return `${op} ${String(raw.id).slice(0, 8)}`;
			if (raw.query) return `${op} "${String(raw.query).slice(0, 25)}"`;
			if (raw.name) return `${op} ${String(raw.name).slice(0, 25)}`;
			return op;
		}
		if (raw.message) return String(raw.message).slice(0, 40);
		if (raw.text) return String(raw.text).slice(0, 40);
		if (raw.content) return String(raw.content).slice(0, 40);
		if (raw.name) return String(raw.name);
		if (raw.id) return String(raw.id).slice(0, 12);

		// Just show first key-value
		const keys = Object.keys(raw).filter(k => !k.startsWith('_'));
		if (keys.length > 0) {
			const key = keys[0];
			const val = String(raw[key]).slice(0, 30);
			return val;
		}

		return '';
	},
	showToolName: true,
};

// =============================================================================
// REGISTRY
// =============================================================================

const toolRenderers: Record<string, ToolRendererConfig> = {
	// File operations
	Read: readToolRenderer,
	Write: writeToolRenderer,
	Edit: editToolRenderer,

	// Terminal
	Bash: bashToolRenderer,

	// Search
	Grep: searchToolRenderer,
	Glob: searchToolRenderer,

	// Web
	WebSearch: webToolRenderer,
	WebFetch: webToolRenderer,

	// Tasks & Skills
	Task: taskToolRenderer,
	TodoWrite: todoWriteRenderer,
	Skill: skillToolRenderer,

	// MCP Life System - Workers
	worker: workerToolRenderer,
	worker_create: workerToolRenderer,
	worker_ack: workerToolRenderer,
	worker_list: workerToolRenderer,
	worker_cancel: workerToolRenderer,

	// MCP Life System - Sessions
	session_spawn: sessionSpawnRenderer,
	session_close: sessionCloseRenderer,
	session_peek: sessionPeekRenderer,
	session_list: teamRenderer,
	session_status: statusToolRenderer,
	session_handoff: resetDoneRenderer,
	team: teamRenderer,

	// MCP Life System - Core
	status: statusToolRenderer,
	ping: pingRenderer,
	log: logRenderer,
	reset: resetDoneRenderer,
	done: resetDoneRenderer,

	// MCP Life System - Priorities
	priority: priorityToolRenderer,
	priority_create: priorityToolRenderer,
	priority_delete: priorityToolRenderer,
	priority_update: priorityToolRenderer,
	priority_complete: priorityToolRenderer,
	priority_list: priorityToolRenderer,

	// MCP Life System - Contacts
	contact: contactToolRenderer,
	contact_search: contactToolRenderer,
	contact_view: contactToolRenderer,
	contact_update: contactToolRenderer,
	contact_create: contactToolRenderer,
	contact_tag: contactToolRenderer,

	// MCP Life System - Calendar
	calendar_create: calendarRenderer,
	calendar_list: calendarRenderer,
	calendar_delete: calendarRenderer,
	local_calendar: calendarRenderer,

	// MCP Life System - Missions
	mission_create: missionRenderer,
	mission_complete: missionRenderer,
	mission_list: missionRenderer,
	mission_disable: missionRenderer,

	// MCP Life System - Tasks
	task_create: workerToolRenderer,
	task_ack: workerToolRenderer,
	task_list: workerToolRenderer,
	task_cancel: workerToolRenderer,

	// MCP Life System - Misc
	service: defaultToolRenderer,
	timer: defaultToolRenderer,
	remind: defaultToolRenderer,

	// MCP Apple
	calendar: calendarRenderer,
	messages: messagesRenderer,
	mail: mailRenderer,
	reminders: defaultToolRenderer,
	web_search: webToolRenderer,

	// MCP Voice
	converse: converseRenderer,
};

/**
 * Get renderer for a tool
 */
export function getToolRenderer(toolName: string): ToolRendererConfig {
	return toolRenderers[toolName] || defaultToolRenderer;
}

/**
 * Get one-liner for a tool
 */
export function getToolOneLiner(
	toolName: string,
	rawInput?: Record<string, unknown>,
	rawResult?: string
): { text: string; showToolName: boolean; } {
	const renderer = getToolRenderer(toolName);
	const input = parseToolInput(toolName, rawInput);
	const result = parseToolResult(rawResult);

	return {
		text: renderer.getOneLiner(input, result),
		showToolName: renderer.showToolName ?? true,
	};
}

