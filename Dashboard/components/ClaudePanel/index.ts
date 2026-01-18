/**
 * ClaudePanel - Public API
 * 
 * Main components for the Claude conversation panel.
 * See SYSTEM-SPEC.md for architecture details.
 */

// Main component
export { ClaudePanel } from './ClaudePanel';

// Subcomponents (for direct use if needed)
export { ClaudeLogo } from './ClaudeLogo';
export { EmptyState } from './EmptyState';
export { InputArea } from './InputArea';
export { MinimizedView } from './MinimizedView';

// Existing exports
export { ActiveTaskBanner, ClaudeActivityHeader, ThinkingIndicator } from './ClaudeActivityHeader';
export { ContextWarningBanner } from './ContextWarningBanner';
export { ConversationList } from './ConversationList';
export { ConversationRow } from './ConversationRow';
export { TaskListPanel } from './TaskListPanel';

// Hooks (for external use)
export { useAttachments, useDragDrop, usePanelResize } from './hooks';
export type { AttachmentItem } from './hooks';

// Constants (for external use)
export {
	API_BASE,
	BREAK_MESSAGES,
	CLAUDE_LOGO_PATH,
	DEFAULT_PANEL_WIDTH,
	MAX_PANEL_WIDTH,
	MIN_PANEL_WIDTH,
	MINIMIZED_PANEL_WIDTH,
	ROLE_ICONS,
	ROLE_NAMES,
} from './constants';
