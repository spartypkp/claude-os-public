/**
 * ClaudePanel - Public API
 */

export { ClaudePanel } from './ClaudePanel';
export { ConversationList } from './ConversationList';
export { TaskListPanel } from './TaskListPanel';

export { useAttachments, useDragDrop, usePanelResize } from './hooks';
export type { AttachmentItem } from './hooks';

export { API_BASE, DEFAULT_PANEL_WIDTH, MINIMIZED_PANEL_WIDTH } from './constants';
