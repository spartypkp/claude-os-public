/**
 * React Query Client Configuration
 * 
 * Jan 2026 Architecture Overhaul:
 * - staleTime: 30s — Data is "fresh" for 30 seconds
 * - refetchInterval: false — NO polling (SSE handles updates)
 * - refetchOnWindowFocus: false — SSE handles this too
 * 
 * All cache invalidation happens via EventStreamProvider
 * when server pushes events over SSE.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Data considered fresh for 30 seconds
			staleTime: 30 * 1000,

			// Cache for 5 minutes
			gcTime: 5 * 60 * 1000,

			// NO polling - SSE handles updates
			refetchInterval: false,

			// NO refetch on focus - SSE handles updates
			refetchOnWindowFocus: false,

			// Retry failed queries
			retry: 2,
			retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
		},
		mutations: {
			// Retry mutations once
			retry: 1,
		},
	},
});

/**
 * Query keys for type-safe cache invalidation.
 * 
 * Usage:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
 */
export const queryKeys = {
	// Session data
	sessions: ['sessions'] as const,
	sessionsActivity: ['sessions', 'activity'] as const,
	session: (id: string) => ['sessions', id] as const,

	// Worker data
	workers: ['workers'] as const,
	workersQueue: ['workers', 'queue'] as const,
	workersRunning: ['workers', 'running'] as const,
	workersHistory: ['workers', 'history'] as const,
	worker: (id: string) => ['workers', id] as const,

	// Priority data
	priorities: ['priorities'] as const,
	prioritiesByDate: (date: string) => ['priorities', date] as const,

	// Chief status
	chief: ['chief'] as const,
	chiefStatus: ['chief', 'status'] as const,

	// Mission data
	missions: ['missions'] as const,
	missionsRunning: ['missions', 'running'] as const,
	mission: (slug: string) => ['missions', slug] as const,
	missionHistory: (slug: string) => ['missions', slug, 'history'] as const,

	// Duty data (Chief duties - critical scheduled Chief work)
	duties: ['duties'] as const,
	dutiesRunning: ['duties', 'running'] as const,
	duty: (slug: string) => ['duties', slug] as const,
	dutyHistory: (slug: string) => ['duties', slug, 'history'] as const,

	// Email data
	email: ['email'] as const,
	emailAccounts: ['email', 'accounts'] as const,
	emailMailboxes: ['email', 'mailboxes'] as const,
	emailMessagesBase: ['email', 'messages'] as const,
	emailMessages: (mailbox: string) => ['email', 'messages', mailbox] as const,
	emailMessage: (id: string) => ['email', 'message', id] as const,
	emailQueue: ['email', 'queue'] as const,
	emailHistory: ['email', 'history'] as const,
	emailUnread: ['email', 'unread'] as const,

	// Calendar data
	calendar: ['calendar'] as const,
	calendarEvents: ['calendar', 'events'] as const,
	calendarEvent: (id: string) => ['calendar', 'events', id] as const,

	// Contacts data
	contacts: ['contacts'] as const,
	contact: (id: string) => ['contacts', id] as const,

	// Messages data
	messages: ['messages'] as const,
	messagesConversations: ['messages', 'conversations'] as const,
	messagesUnread: ['messages', 'unread'] as const,

	// Role data
	roles: ['roles'] as const,
	role: (slug: string) => ['roles', slug] as const,
} as const;

/**
 * Map SSE event types to query keys for invalidation.
 * 
 * When EventStreamProvider receives an event, it uses this
 * mapping to invalidate the right caches.
 * 
 * Note: For worker events, we also invalidate ['workers'] which
 * will match all worker-related queries including individual status queries.
 */
export const eventToQueryKeys: Record<string, readonly (readonly string[])[]> = {
	// Session events
	'session.started': [queryKeys.sessions, queryKeys.sessionsActivity, queryKeys.chief],
	'session.ended': [queryKeys.sessions, queryKeys.sessionsActivity, queryKeys.chief],
	'session.state': [queryKeys.sessions, queryKeys.sessionsActivity],
	'session.status': [queryKeys.sessions, queryKeys.sessionsActivity],

	// Worker events - invalidate ['workers'] to catch all worker queries including status
	'worker.created': [queryKeys.workers, queryKeys.workersQueue],
	'worker.started': [queryKeys.workers, queryKeys.workersQueue, queryKeys.workersRunning],
	'worker.completed': [queryKeys.workers, queryKeys.workersRunning, queryKeys.workersHistory],
	'worker.acked': [queryKeys.workers, queryKeys.workersHistory],
	'worker.cancelled': [queryKeys.workers, queryKeys.workersQueue],
	'worker.output_updated': [queryKeys.workers], // Jan 2026: Live output updates (replaces 500ms polling)

	// Priority events
	'priority.created': [queryKeys.priorities],
	'priority.updated': [queryKeys.priorities],
	'priority.completed': [queryKeys.priorities],
	'priority.deleted': [queryKeys.priorities],

	// Mission events
	'mission.created': [queryKeys.missions],
	'mission.updated': [queryKeys.missions],
	'mission.deleted': [queryKeys.missions],
	'mission.started': [queryKeys.missions, queryKeys.missionsRunning],
	'mission.completed': [queryKeys.missions, queryKeys.missionsRunning],

	// Duty events (Chief duties)
	'duty.updated': [queryKeys.duties],
	'duty.started': [queryKeys.duties, queryKeys.dutiesRunning],
	'duty.completed': [queryKeys.duties, queryKeys.dutiesRunning],

	// Email events
	'email.sent': [queryKeys.email, queryKeys.emailHistory],
	'email.queued': [queryKeys.emailQueue, queryKeys.emailHistory],
	'email.cancelled': [queryKeys.emailQueue],
	'email.read': [queryKeys.email, queryKeys.emailMessagesBase, queryKeys.emailUnread],
	'email.flagged': [queryKeys.email, queryKeys.emailMessagesBase, queryKeys.emailMailboxes, queryKeys.emailUnread],
	'email.deleted': [queryKeys.email, queryKeys.emailMessagesBase, queryKeys.emailMailboxes, queryKeys.emailUnread],

	// Calendar events
	'calendar.created': [queryKeys.calendar, queryKeys.calendarEvents],
	'calendar.updated': [queryKeys.calendar, queryKeys.calendarEvents],
	'calendar.deleted': [queryKeys.calendar, queryKeys.calendarEvents],

	// Contact events
	'contact.created': [queryKeys.contacts],
	'contact.updated': [queryKeys.contacts],
	'contact.deleted': [queryKeys.contacts],

	// Message events
	'message.sent': [queryKeys.messages, queryKeys.messagesConversations],
	'message.received': [queryKeys.messages, queryKeys.messagesConversations, queryKeys.messagesUnread],
};
