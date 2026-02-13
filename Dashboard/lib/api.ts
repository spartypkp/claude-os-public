import { BlockData, CalendarEvent, ClaudeActivityData, Contact, ContactDetail, DashboardData, FileContent, FileTreeNode, LifeTasksResponse, MemoryData, MetricsData, MetricsOverviewData, MetricsPatternsData, MissionsResponse, StageData, SystemConfigData, SystemDocsData, SystemHealth, SystemHealthData, SystemMetricsData } from './types';
import { CLAUDE_SYSTEM_FILES } from './systemFiles';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// =========================================
// CALENDAR APIs
// =========================================

export interface CalendarEventsResponse {
	events: CalendarEvent[];
	count: number;
	from_date: string;
	to_date: string;
}

export interface FetchCalendarEventsOptions {
	fromDate?: string;  // ISO date
	toDate?: string;    // ISO date
	days?: number;      // Default 7
	calendar?: string;  // Filter by calendar name
	usePreferred?: boolean;  // Default true
	limit?: number;     // Default 100
}

function normalizeCalendarEvents(rawEvents: CalendarEvent[]): CalendarEvent[] {
	return rawEvents.map((event, index) => {
		const id = event.id || event.event_id || `${event.summary}-${event.start_ts}-${index}`;
		return { ...event, id };
	});
}

function resolveDateRange(options: FetchCalendarEventsOptions): { from: string; to: string; } {
	if (options.fromDate && options.toDate) {
		return { from: options.fromDate, to: options.toDate };
	}

	const now = new Date();
	const start = options.fromDate
		? new Date(options.fromDate)
		: new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const days = options.days ?? 7;
	const end = options.toDate ? new Date(options.toDate) : new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

	return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Fetch calendar events from Apple Calendar.
 * This is the primary API for calendar data - use instead of fetchDashboardData.
 */
export async function fetchCalendarEvents(options: FetchCalendarEventsOptions = {}): Promise<CalendarEventsResponse> {
	const params = new URLSearchParams();
	if (options.fromDate) params.set('from_date', options.fromDate);
	if (options.toDate) params.set('to_date', options.toDate);
	if (options.days) params.set('days', options.days.toString());
	if (options.calendar) params.set('calendar', options.calendar);
	if (options.usePreferred !== undefined) params.set('use_preferred', options.usePreferred.toString());
	if (options.limit) params.set('limit', options.limit.toString());

	const queryString = params.toString();
	const url = `${API_BASE}/api/calendar/events${queryString ? `?${queryString}` : ''}`;

	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) {
		throw new Error('Failed to fetch calendar events');
	}
	const payload = await res.json();
	const rawEvents = Array.isArray(payload) ? payload : payload.events || [];
	const events = normalizeCalendarEvents(rawEvents);
	const { from, to } = resolveDateRange(options);

	return {
		events,
		count: Array.isArray(payload) ? events.length : payload.count ?? events.length,
		from_date: Array.isArray(payload) ? from : payload.from_date ?? from,
		to_date: Array.isArray(payload) ? to : payload.to_date ?? to,
	};
}

// NOTE: fetchDashboardData - DEPRECATED
// Jan 2026: Removed calendar fetch to prevent spam (was triggering on every SSE event)
export async function fetchDashboardData(): Promise<DashboardData> {
	return {
		timestamp: new Date().toISOString(),
		schedule: [],
		attention: [],
		sessions: { count: 0, active: false },
		priorities: { critical: [], medium: [], low: [] },
	};
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
	const res = await fetch(`${API_BASE}/api/health/detailed`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch system health');
	return res.json();
}

export async function fetchMetrics(): Promise<MetricsData> {
	const res = await fetch(`${API_BASE}/api/system/metrics`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch metrics');
	return res.json();
}

// =========================================
// ACTION APIs
// =========================================

interface ActionResponse {
	success: boolean;
	message?: string;
	error?: string;
}

interface CreateEventPayload {
	summary: string;
	start: string;
	end: string;
	tags?: string[];
	notify?: boolean;
}

export async function createCalendarEvent(payload: CreateEventPayload): Promise<ActionResponse> {
	// Map payload to match backend's CreateEventRequest
	const res = await fetch(`${API_BASE}/api/calendar/create`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			title: payload.summary,
			start_date: payload.start,
			end_date: payload.end,
		}),
	});
	return res.json();
}

// =========================================
// FILES APIs
// =========================================

export async function fetchFileTree(): Promise<FileTreeNode[]> {
	const res = await fetch(`${API_BASE}/api/files/tree`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch file tree');
	return res.json();
}

export async function fetchFileContent(path: string): Promise<FileContent> {
	const encodedPath = encodeURIComponent(path);
	const res = await fetch(`${API_BASE}/api/files/content/${encodedPath}`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch file content');
	return res.json();
}

export interface FileUpdateResponse {
	success: boolean;
	path?: string;
	mtime?: string;  // New mtime after successful save
	error?: string;  // 'conflict' for mtime mismatch
}

/**
 * Update file content with optional conflict detection.
 *
 * @param path - File path relative to repo root
 * @param content - New file content
 * @param expectedMtime - If provided, server returns 409 if file was modified since this mtime
 * @returns Response with success status and new mtime, or error
 */
export async function updateFileContent(
	path: string,
	content: string,
	expectedMtime?: string
): Promise<FileUpdateResponse> {
	const encodedPath = encodeURIComponent(path);
	const res = await fetch(`${API_BASE}/api/files/content/${encodedPath}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			content,
			expected_mtime: expectedMtime,
		}),
	});

	// Handle conflict (409)
	if (res.status === 409) {
		try {
			const error = await res.json();
			return {
				success: false,
				error: 'conflict',
				mtime: error.detail?.current_mtime,
			};
		} catch {
			return { success: false, error: 'conflict' };
		}
	}

	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to save file' }));
		return { success: false, error: error.detail || 'Failed to save file' };
	}

	return res.json();
}

/**
 * Open a file in the native macOS default application.
 * Pass reveal=true to reveal in Finder instead.
 */
export async function openInMacOS(path: string, reveal?: boolean): Promise<void> {
	const res = await fetch(`${API_BASE}/api/files/open`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path, reveal: reveal ?? false }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to open file' }));
		throw new Error(error.detail || 'Failed to open file');
	}
}

/**
 * Send raw keystrokes to a session (no Dashboard prefix).
 * Used for answering interactive prompts like AskUserQuestion.
 */
export async function sendKeystroke(sessionId: string, text: string): Promise<void> {
	const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/keystroke`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message: text }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to send keystroke' }));
		throw new Error(error.detail || 'Failed to send keystroke');
	}
}

// =========================================
// CONTACTS APIs
// =========================================

export async function fetchContacts(search?: string): Promise<Contact[]> {
	const params = new URLSearchParams();
	if (search) params.set('search', search);
	const queryString = params.toString();
	const url = `${API_BASE}/api/contacts${queryString ? `?${queryString}` : ''}`;
	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch contacts');
	return res.json();
}

export async function fetchContact(id: string): Promise<ContactDetail> {
	const res = await fetch(`${API_BASE}/api/contacts/${encodeURIComponent(id)}`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch contact');
	return res.json();
}

// =========================================
// IMPROVEMENTS APIs - REMOVED (no backend endpoint)
// =========================================

// NOTE: fetchImprovements removed - /api/improvements endpoint doesn't exist

// =========================================
// STAGE APIs - STUB (no backend endpoint)
// =========================================

// NOTE: /api/stage endpoint doesn't exist - returns empty data for compatibility
export async function fetchStage(): Promise<StageData> {
	return { items: [], count: 0 };
}

export async function dismissStagedItem(id: string): Promise<{ success: boolean; }> {
	return { success: true };
}

// =========================================
// EMAIL APIs - REMOVED (no backend endpoint)
// =========================================

// NOTE: All email functions removed - /api/emails/* endpoints don't exist
// Email access is via Apple MCP tool (mcp__apple__mail) only

// =========================================
// IMESSAGE APIs - REMOVED (no backend endpoint)
// =========================================

// NOTE: All iMessage functions removed - /api/imessages/* endpoints don't exist
// iMessage access is via Apple MCP tool (mcp__apple__messages) only

// =========================================
// PRIORITIES APIs
// =========================================

export interface Priority {
	id: string;
	content: string;
	completed: boolean;
	position: number;
	created_at?: string;
	completed_at?: string | null;
}

export interface PrioritiesResponse {
	date: string;
	priorities: {
		critical: Priority[];
		medium: Priority[];
		low: Priority[];
	};
	count: number;
	timestamp: string;
}

export async function fetchPriorities(date?: string, includeCompleted: boolean = false): Promise<PrioritiesResponse> {
	const params = new URLSearchParams();
	if (date) params.set('date', date);
	if (includeCompleted) params.set('include_completed', 'true');
	const queryString = params.toString();
	const url = `${API_BASE}/api/priorities${queryString ? `?${queryString}` : ''}`;
	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch priorities');
	return res.json();
}

export async function createPriority(content: string, level: 'critical' | 'medium' | 'low' = 'medium'): Promise<ActionResponse> {
	const res = await fetch(`${API_BASE}/api/priorities`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ content, level }),
	});
	return res.json();
}

export async function updatePriority(id: string, updates: { content?: string; level?: string; completed?: boolean; }): Promise<ActionResponse> {
	const res = await fetch(`${API_BASE}/api/priorities/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(updates),
	});
	return res.json();
}

export async function completePriority(id: string): Promise<ActionResponse> {
	const res = await fetch(`${API_BASE}/api/priorities/${id}/complete`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
	});
	return res.json();
}

export async function deletePriority(id: string): Promise<ActionResponse> {
	const res = await fetch(`${API_BASE}/api/priorities/${id}`, {
		method: 'DELETE',
	});
	return res.json();
}

// =========================================
// SYSTEM APIs
// =========================================

export async function fetchSystemHealthData(): Promise<SystemHealthData> {
	const res = await fetch(`${API_BASE}/api/system/health`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch system health data');
	return res.json();
}

export async function fetchSystemDocs(): Promise<SystemDocsData> {
	const res = await fetch(`${API_BASE}/api/system/health/docs`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch system docs');
	return res.json();
}

export async function fetchSystemMetrics(): Promise<SystemMetricsData> {
	const res = await fetch(`${API_BASE}/api/system/metrics`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch system metrics');
	return res.json();
}

export async function fetchMetricsOverview(): Promise<MetricsOverviewData> {
	const res = await fetch(`${API_BASE}/api/system/metrics/overview`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch metrics overview');
	return res.json();
}

export async function fetchMetricsPatterns(days: number = 7): Promise<MetricsPatternsData> {
	const res = await fetch(`${API_BASE}/api/system/metrics/patterns?days=${days}`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch metrics patterns');
	return res.json();
}

export async function fetchSystemConfig(): Promise<SystemConfigData> {
	const res = await fetch(`${API_BASE}/api/system/config`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch system config');
	return res.json();
}

// =========================================
// CLAUDE STATE APIs
// =========================================

export interface ClaudeStateResponse {
	state: 'active' | 'idle' | null;
	session_id: string | null;
	since: string | null;
	connected: boolean;
	stale?: boolean;
	error?: string;
}

export async function fetchClaudeState(): Promise<ClaudeStateResponse> {
	const res = await fetch(`${API_BASE}/api/system/claude-state`, { cache: 'no-store' });
	if (!res.ok) {
		return {
			state: null,
			session_id: null,
			since: null,
			connected: false,
			error: 'Failed to fetch claude state',
		};
	}
	return res.json();
}

// Duties API (renamed from missions - backward compatibility)
export async function fetchMissions(): Promise<MissionsResponse> {
	// Missions system renamed to Duties - this function kept for backward compat
	const res = await fetch(`${API_BASE}/api/duties`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch duties');
	return res.json();
}

// Life Tasks API
export async function fetchLifeTasks(): Promise<LifeTasksResponse> {
	const res = await fetch(`${API_BASE}/api/system/tasks-for-will`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch life tasks');
	return res.json();
}

// =========================================
// CLAUDE VIEW APIs (Memory)
// =========================================

export type { BlockData, MemoryData } from './types';

// NOTE: /api/system/blocks endpoint doesn't exist - returns empty array for compatibility
export async function fetchBlocks(): Promise<BlockData[]> {
	return [];
}

export async function fetchMemory(): Promise<MemoryData> {
	const res = await fetch(`${API_BASE}/api/system/memory`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch memory');
	return res.json();
}

// =========================================
// CLAUDE ACTIVITY APIs
// =========================================

export async function fetchClaudeActivity(): Promise<ClaudeActivityData> {
	const res = await fetch(`${API_BASE}/api/sessions/activity`, { cache: 'no-store' });
	if (!res.ok) throw new Error('Failed to fetch claude activity');
	return res.json();
}

// =========================================
// FINDER APIs (Desktop/ file operations)
// =========================================

export interface FinderItem {
	name: string;
	path: string;
	type: 'file' | 'folder' | 'domain' | 'app';
	icon: string;
	size: number | null;
	modified: string;
	created?: string;
	child_count?: number;
	has_app_spec?: boolean;
	has_life_spec?: boolean;
}

export interface FinderListResponse {
	path: string;
	items: FinderItem[];
	count: number;
}

export interface FinderFileContent {
	path: string;
	content: string;
	type: 'markdown' | 'text' | 'config' | 'code' | 'unknown';
	size: number;
	modified: string;
}

export interface FinderSearchResponse {
	query: string;
	results: FinderItem[];
	count: number;
}

/**
 * Strip "Desktop/" prefix from paths.
 * The file tree API returns repo-relative paths (Desktop/foo.md) but
 * Finder mutation APIs expect Desktop-relative paths (foo.md).
 * Call this on any path before passing to a Finder API.
 */
function toDesktopRelative(path: string): string {
	return path.replace(/^Desktop\//, '');
}

/**
 * List contents of a directory in Desktop/.
 */
export async function finderList(path: string = ''): Promise<FinderListResponse> {
	path = toDesktopRelative(path);
	const endpoint = path ? `/api/files/list/${encodeURIComponent(path)}` : '/api/files/list';
	const res = await fetch(`${API_BASE}${endpoint}`, { cache: 'no-store' });
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to list directory' }));
		throw new Error(error.detail || 'Failed to list directory');
	}
	return res.json();
}

/**
 * Get detailed info for a file or folder.
 */
export async function finderInfo(path: string): Promise<FinderItem> {
	path = toDesktopRelative(path);
	const res = await fetch(`${API_BASE}/api/files/info/${encodeURIComponent(path)}`, { cache: 'no-store' });
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to get info' }));
		throw new Error(error.detail || 'Failed to get info');
	}
	return res.json();
}

/**
 * Read file content.
 */
export async function finderRead(path: string): Promise<FinderFileContent> {
	path = toDesktopRelative(path);
	const res = await fetch(`${API_BASE}/api/files/read/${encodeURIComponent(path)}`, { cache: 'no-store' });
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to read file' }));
		throw new Error(error.detail || 'Failed to read file');
	}
	return res.json();
}

/**
 * Create a new file in Desktop/.
 */
export async function finderCreateFile(path: string, content: string = ''): Promise<FinderItem> {
	path = toDesktopRelative(path);
	const res = await fetch(`${API_BASE}/api/files/file`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path, content }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to create file' }));
		throw new Error(error.detail || 'Failed to create file');
	}
	return res.json();
}

/**
 * Create a new folder in Desktop/.
 */
export async function finderCreateFolder(path: string): Promise<FinderItem> {
	path = toDesktopRelative(path);
	const res = await fetch(`${API_BASE}/api/files/folder`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to create folder' }));
		throw new Error(error.detail || 'Failed to create folder');
	}
	return res.json();
}

/**
 * Upload a file to Desktop/ (supports binary files like images).
 * Uses multipart form data for upload.
 */
export async function finderUpload(file: File, destPath: string = ''): Promise<FinderItem> {
	destPath = toDesktopRelative(destPath);
	const formData = new FormData();
	formData.append('file', file);
	formData.append('dest_path', destPath);

	const res = await fetch(`${API_BASE}/api/files/upload`, {
		method: 'POST',
		body: formData,
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to upload file' }));
		throw new Error(error.detail || 'Failed to upload file');
	}
	return res.json();
}

/**
 * Rename a file or folder.
 */
export async function finderRename(path: string, newName: string): Promise<FinderItem> {
	// Protect Claude system files
	if (isProtectedFile(path)) {
		throw new Error('Cannot rename Claude system files');
	}

	path = toDesktopRelative(path);
	const res = await fetch(`${API_BASE}/api/files/rename/${encodeURIComponent(path)}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ new_name: newName }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to rename' }));
		throw new Error(error.detail || 'Failed to rename');
	}
	return res.json();
}

/**
 * Move a file or folder to a new location.
 */
export async function finderMove(path: string, destPath: string): Promise<FinderItem> {
	path = toDesktopRelative(path);
	destPath = toDesktopRelative(destPath);
	const res = await fetch(`${API_BASE}/api/files/move/${encodeURIComponent(path)}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ dest_path: destPath }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to move' }));
		throw new Error(error.detail || 'Failed to move');
	}
	return res.json();
}

// Check if a file path points to a protected Claude system file
function isProtectedFile(path: string): boolean {
	const fileName = path.split('/').pop() || '';
	return CLAUDE_SYSTEM_FILES.has(fileName);
}

/**
 * Delete a file or folder.
 */
export async function finderDelete(path: string, recursive: boolean = false): Promise<{ deleted: string; }> {
	// Protect Claude system files
	if (isProtectedFile(path)) {
		throw new Error('Cannot delete Claude system files');
	}

	const res = await fetch(`${API_BASE}/api/files/delete/${encodeURIComponent(path)}?recursive=${recursive}`, {
		method: 'DELETE',
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to delete' }));
		throw new Error(error.detail || 'Failed to delete');
	}
	return res.json();
}

/**
 * Search for files matching query.
 */
export async function finderSearch(query: string, path: string = ''): Promise<FinderSearchResponse> {
	const res = await fetch(`${API_BASE}/api/files/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, path }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to search' }));
		throw new Error(error.detail || 'Failed to search');
	}
	return res.json();
}

// =========================================
// TRASH APIs
// =========================================

export interface TrashItem {
	id: string;
	name: string;
	original_path: string;
	type: 'file' | 'folder';
	size: number;
	trashed_at: string;
}

export interface TrashListResponse {
	items: TrashItem[];
	count: number;
	total_size: number;
}

export interface TrashResponse {
	id: string;
	name: string;
	original_path: string;
	type: string;
	size: number;
	trashed_at: string;
}

export interface RestoreResponse {
	id: string;
	name: string;
	restored_to: string;
	original_path: string;
}

/**
 * Move a file or folder to trash.
 */
export async function moveToTrash(path: string): Promise<TrashResponse> {
	// Protect Claude system files
	if (isProtectedFile(path)) {
		throw new Error('Cannot delete Claude system files');
	}

	path = toDesktopRelative(path);
	const res = await fetch(`${API_BASE}/api/files/trash`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to move to trash' }));
		throw new Error(error.detail || 'Failed to move to trash');
	}
	return res.json();
}

/**
 * List all items in trash.
 */
export async function listTrash(): Promise<TrashListResponse> {
	const res = await fetch(`${API_BASE}/api/files/trash`, { cache: 'no-store' });
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to list trash' }));
		throw new Error(error.detail || 'Failed to list trash');
	}
	return res.json();
}

/**
 * Get info about a specific trashed item.
 */
export async function getTrashItem(trashId: string): Promise<TrashItem> {
	const res = await fetch(`${API_BASE}/api/files/trash/${encodeURIComponent(trashId)}`, { cache: 'no-store' });
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to get trash item' }));
		throw new Error(error.detail || 'Failed to get trash item');
	}
	return res.json();
}

/**
 * Restore an item from trash.
 */
export async function restoreFromTrash(trashId: string, destPath?: string): Promise<RestoreResponse> {
	const res = await fetch(`${API_BASE}/api/files/trash/${encodeURIComponent(trashId)}/restore`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ dest_path: destPath }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to restore' }));
		throw new Error(error.detail || 'Failed to restore');
	}
	return res.json();
}

/**
 * Permanently delete a specific item from trash.
 */
export async function permanentDelete(trashId: string): Promise<{ deleted: string; name: string; }> {
	const res = await fetch(`${API_BASE}/api/files/trash/${encodeURIComponent(trashId)}`, {
		method: 'DELETE',
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to delete' }));
		throw new Error(error.detail || 'Failed to delete');
	}
	return res.json();
}

/**
 * Empty the trash (permanently delete all items).
 */
export async function emptyTrash(olderThanDays?: number): Promise<{ deleted_count: number; remaining_count: number; }> {
	const res = await fetch(`${API_BASE}/api/files/trash/empty`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ older_than_days: olderThanDays }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ detail: 'Failed to empty trash' }));
		throw new Error(error.detail || 'Failed to empty trash');
	}
	return res.json();
}

