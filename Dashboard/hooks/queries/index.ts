/**
 * Query Hooks Index
 * 
 * Jan 2026 Architecture Overhaul:
 * These hooks replace the polling-based hooks with React Query.
 * Cache invalidation happens automatically via SSE events.
 */

export * from './useChiefQuery';
export * from './useDutiesQuery';
export * from './useMissionsQuery';
export * from './usePrioritiesQuery';
export * from './useRolesQuery';
export * from './useConversationsQuery';  // Exports both session and conversation hooks

