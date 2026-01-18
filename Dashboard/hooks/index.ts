// Activity & Sessions
export { useActivityHub } from './useActivityHub';
export { useClaudeActivity } from './useClaudeActivity';
export { useClaudeActivityState } from './useClaudeActivityState';
export type { ClaudeActivityState } from './useClaudeActivityState';

// Workers
export { useWorkers } from './useWorkers';
export { useWorkerOutput } from './useWorkerOutput';

// Transcript & Chat
export { useTranscriptStream } from './useTranscriptStream';
export type { TranscriptEvent } from './useTranscriptStream';
export { useTranscriptWithHistory } from './useTranscriptWithHistory';

// Desktop & Files
export { useDesktopLayout } from './useDesktopLayout';
export { useFileEvents } from './useFileEvents';
export { useRecentFiles } from './useRecentFiles';

// UI State
export { useChiefStatus } from './useChiefStatus';
export { useTheme } from './useTheme';

// Event Stream (Jan 2026 Architecture)
export { useEventStream, EventStreamProvider } from './useEventStream';

// Query Hooks (Jan 2026 Architecture - replacements for polling hooks)
export * from './queries';

