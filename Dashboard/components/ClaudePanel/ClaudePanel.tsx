'use client';

/**
 * ClaudePanel - Main Claude Conversation Panel
 *
 * CONVERSATION-FIRST architecture:
 * - Primary unit is conversation_id, not session_id
 * - Sessions are internal implementation details
 * - Resets and mode transitions visible in one unified view
 */

import { useChatPanel } from '@/components/context/ChatPanelContext';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { TranscriptProvider } from '@/components/transcript/TranscriptContext';
import { useChiefStatus } from '@/hooks/useChiefStatus';
import { useConversation } from '@/hooks/useConversation';
import { useConversationsQuery } from '@/hooks/queries/useConversationsQuery';
import { useClaudeActivityState } from '@/hooks/useClaudeActivityState';
import { useEventStream } from '@/hooks/useEventStream';
import { useHandoffState } from '@/hooks/useHandoffState';
import { AlertCircle, Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Local components
import { ChatInputHandle } from './ChatInput';
import { ActiveTaskBanner } from './ClaudeActivityHeader';
import { EmptyState } from './EmptyState';
import { InputArea } from './InputArea';
import { MinimizedView } from './MinimizedView';
import { ConversationList } from './ConversationList';
import { TaskListPanel } from './TaskListPanel';
import { LifecycleToast } from './LifecycleToast';

import {
  API_BASE,
  MINIMIZED_PANEL_WIDTH,
} from './constants';
import { getRoleConfig } from '@/lib/sessionUtils';
import { useAttachments, useDragDrop, usePanelResize } from './hooks';
import { sendKeystroke, sendKeys } from '@/lib/api';

const INTERACTIVE_TOOL_NAMES = new Set(['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode']);

interface ClaudePanelProps {
  isVisible: boolean;
}

export function ClaudePanel({ isVisible }: ClaudePanelProps) {
  // ─────────────────────────────────────────────────────────────────────────
  // CONTEXT & EXTERNAL HOOKS
  // ─────────────────────────────────────────────────────────────────────────

  const {
    conversationId,
    conversationRole,
    openConversation,
    closePanel,
    setConversation,
  } = useChatPanel();

  const { data, refetch: refetchConversations } = useConversationsQuery();
  const conversations = data?.conversations ?? [];
  const chiefStatus = useChiefStatus();
  const { connected: sseConnected } = useEventStream();
  const { getPhase: getHandoffPhase } = useHandoffState(conversations);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Conversation-first data hook
  const {
    events,
    activity,
    tasks,
    meta,
    pagination,
    isConnected,
    isLoading,
    error: transcriptError,
    activeSessionId,
    loadEarlierHistory,
    sendMessage: sendConversationMessage,
  } = useConversation(conversationId, {
    includeThinking: true,
    // Chief loads 10+ sessions/day (1,500+ events) — limit to 3 most recent.
    // Specialists are bounded by lifecycle (typically 1-3 sessions), so hours=24 is fine.
    ...(conversationRole === 'chief'
      ? { limitSessions: 3 }
      : { hours: 24 }),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // ─────────────────────────────────────────────────────────────────────────

  const [sendError, setSendError] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isPanelFocused, setIsPanelFocused] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [eventCountAtSend, setEventCountAtSend] = useState(0);

  const panelRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // Auto-dismiss errors after 5s
  useEffect(() => {
    if (!sendError) return;
    const timer = setTimeout(() => setSendError(null), 5000);
    return () => clearTimeout(timer);
  }, [sendError]);

  // ─────────────────────────────────────────────────────────────────────────
  // EXTRACTED HOOKS
  // ─────────────────────────────────────────────────────────────────────────

  const { panelWidth, isResizing, startResize } = usePanelResize();

  const {
    attachedFiles,
    addAttachment,
    removeAttachment,
    togglePreview,
    clearAttachments,
    formatBytes,
  } = useAttachments({ sessionId: conversationId }); // Use conversationId for drafts

  const {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFilePick,
  } = useDragDrop({
    onAttach: addAttachment,
    onError: setSendError,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED STATE
  // ─────────────────────────────────────────────────────────────────────────

  const activeConversations = useMemo(() => conversations.filter(c => !c.ended_at), [conversations]);
  const roleName = conversationRole ? getRoleConfig(conversationRole).label : 'Claude';
  const error = transcriptError || sendError;

  // Detect pending interactive tools — block chat input while waiting for user action
  const hasPendingQuestion = useMemo(() => {
    const toolUseIds = new Set<string>();
    const answeredIds = new Set<string>();
    for (const ev of events) {
      if (ev.type === 'tool_use' && INTERACTIVE_TOOL_NAMES.has(ev.toolName || '') && ev.toolUseId) {
        toolUseIds.add(ev.toolUseId);
      }
      if (ev.type === 'tool_result' && ev.toolUseId && toolUseIds.has(ev.toolUseId)) {
        answeredIds.add(ev.toolUseId);
      }
    }
    for (const id of toolUseIds) {
      if (!answeredIds.has(id)) return true;
    }
    return false;
  }, [events]);
  const hasAnyConversation = activeConversations.length > 0 || chiefStatus.isRunning;
  const currentWidth = !isVisible ? 0 : isMinimized ? MINIMIZED_PANEL_WIDTH : panelWidth;

  const activityState = useClaudeActivityState(events, isWaitingForResponse, eventCountAtSend);
  const transcriptContextValue = useMemo(() => ({ activeSessionId: activeSessionId || null }), [activeSessionId]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSATION SYNC EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  // Initialize from URL param
  useEffect(() => {
    if (hasInitialized || activeConversations.length === 0) return;

    const urlConversationId = searchParams.get('conversation');
    if (urlConversationId) {
      const conversation = activeConversations.find(c => c.conversation_id === urlConversationId);
      if (conversation) {
        openConversation(conversation.conversation_id, conversation.role);
        setHasInitialized(true);
        return;
      }
      // Conversation not found - clear URL param
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete('conversation');
      router.replace(`${pathname}${newParams.toString() ? `?${newParams.toString()}` : ''}`);
    }
    setHasInitialized(true);
  }, [hasInitialized, activeConversations, searchParams, openConversation, router, pathname]);

  // Auto-select Chief if no conversation selected
  useEffect(() => {
    if (!hasInitialized) return;
    if (!conversationId && activeConversations.length > 0) {
      const chiefConversation = activeConversations.find(c => c.role === 'chief');
      if (chiefConversation) {
        openConversation(chiefConversation.conversation_id, 'chief');
      }
    }
  }, [hasInitialized, conversationId, activeConversations, openConversation]);

  // If selected conversation ends, switch to Chief or clear
  useEffect(() => {
    if (!conversationId || conversations.length === 0) return;
    const stillActive = activeConversations.some(c => c.conversation_id === conversationId);
    if (stillActive) return;

    const chiefConversation = activeConversations.find(c => c.role === 'chief');
    if (chiefConversation) {
      openConversation(chiefConversation.conversation_id, 'chief');
    } else {
      setConversation(null, null);
    }
  }, [conversationId, activeConversations, conversations.length, openConversation, setConversation]);

  // Update URL when conversation changes
  useEffect(() => {
    if (!hasInitialized) return;
    const currentUrlConversation = searchParams.get('conversation');
    if (conversationId !== currentUrlConversation) {
      const newParams = new URLSearchParams(searchParams.toString());
      if (conversationId) {
        newParams.set('conversation', conversationId);
      } else {
        newParams.delete('conversation');
      }
      router.replace(`${pathname}${newParams.toString() ? `?${newParams.toString()}` : ''}`, { scroll: false });
    }
  }, [conversationId, hasInitialized, searchParams, router, pathname]);

  // ─────────────────────────────────────────────────────────────────────────
  // INPUT FOCUS & PANEL FOCUS
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isVisible && conversationId) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [isVisible, conversationId]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const handleFocusIn = () => setIsPanelFocused(true);
    const handleFocusOut = () => {
      setTimeout(() => {
        const activeElement = document.activeElement;
        setIsPanelFocused(panel.contains(activeElement));
      }, 0);
    };

    panel.addEventListener('focusin', handleFocusIn);
    panel.addEventListener('focusout', handleFocusOut);
    return () => {
      panel.removeEventListener('focusin', handleFocusIn);
      panel.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ASK CHIEF EVENT LISTENER
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleAskChief = async (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; itemName: string }>;
      const { path, itemName } = customEvent.detail;

      const chiefConversation = activeConversations.find(c => c.role === 'chief');
      if (chiefConversation) {
        openConversation(chiefConversation.conversation_id, 'chief');
        if (path) addAttachment(path);
        setTimeout(() => {
          chatInputRef.current?.setValue(`Please explain "${itemName}" in more detail. What is it, how does it work, and how should I use it?`);
          chatInputRef.current?.focus();
        }, 100);
      } else {
        setSendError('Chief is not running. Start Chief first to ask questions.');
      }
    };

    window.addEventListener('ask-chief', handleAskChief);
    return () => window.removeEventListener('ask-chief', handleAskChief);
  }, [activeConversations, openConversation, addAttachment]);

  // ─────────────────────────────────────────────────────────────────────────
  // INJECT-TO-CONVERSATION EVENT LISTENER (from ChatButton / ConversationPicker)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleInject = async (e: Event) => {
      const { conversationId: targetId, sessionId, role, message } = (e as CustomEvent<{
        conversationId: string;
        sessionId: string;
        role: string;
        message: string;
      }>).detail;

      // Switch to target conversation
      openConversation(targetId, role);

      // Auto-send the message via keystroke API (no prefill, immediate delivery)
      if (sessionId) {
        try {
          await sendKeystroke(sessionId, message);
        } catch (err) {
          console.error('Failed to inject message:', err);
          // Fallback to prefill if auto-send fails
          setTimeout(() => {
            chatInputRef.current?.setValue(message);
            chatInputRef.current?.focus();
          }, 100);
        }
      }
    };

    window.addEventListener('inject-to-conversation', handleInject);
    return () => window.removeEventListener('inject-to-conversation', handleInject);
  }, [openConversation]);

  // ─────────────────────────────────────────────────────────────────────────
  // ANSWER QUESTION EVENT LISTENER (for AskUserQuestion tool)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleAnswerQuestion = async (e: Event) => {
      const customEvent = e as CustomEvent<{ steps: Array<{ text: string; submit: boolean; delayAfter?: number }> }>;
      const { steps } = customEvent.detail;
      if (!activeSessionId || !steps?.length) return;

      try {
        for (const step of steps) {
          await sendKeystroke(activeSessionId, step.text, step.submit);
          if (step.delayAfter) {
            await new Promise(resolve => setTimeout(resolve, step.delayAfter));
          }
        }
      } catch (err) {
        console.error('Failed to send answer:', err);
        setSendError(err instanceof Error ? err.message : 'Failed to answer question');
      }
    };

    window.addEventListener('answer-question', handleAnswerQuestion);
    return () => window.removeEventListener('answer-question', handleAnswerQuestion);
  }, [activeSessionId]);

  // ─────────────────────────────────────────────────────────────────────────
  // PLAN MODE ACTION LISTENER (for EnterPlanMode / ExitPlanMode)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handlePlanAction = async (e: Event) => {
      const customEvent = e as CustomEvent<{ keys: string[]; followUpText?: string }>;
      const { keys, followUpText } = customEvent.detail;
      if (!activeSessionId || !keys?.length) return;

      try {
        await sendKeys(activeSessionId, keys);
        // If feedback text was provided (plan mode option 5), send it after menu selection
        if (followUpText) {
          // Wait for the menu to process and show the text input
          setTimeout(async () => {
            try {
              await sendKeystroke(activeSessionId, followUpText);
            } catch (err) {
              console.error('Failed to send plan feedback:', err);
            }
          }, 500);
        }
      } catch (err) {
        console.error('Failed to send plan mode action:', err);
        setSendError(err instanceof Error ? err.message : 'Failed to send plan action');
      }
    };

    window.addEventListener('plan-mode-action', handlePlanAction);
    return () => window.removeEventListener('plan-mode-action', handlePlanAction);
  }, [activeSessionId]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSATION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleSelectConversation = useCallback((convId: string, role: string) => {
    openConversation(convId, role);
  }, [openConversation]);

  const handleEndConversation = useCallback(async (convId: string) => {
    try {
      // Use conversation-level endpoint — ends ALL active sessions in the conversation
      await fetch(`${API_BASE}/api/sessions/conversation/${convId}/end`, { method: 'POST' });

      // Always refetch regardless of response — the user's intent is "close this"
      refetchConversations();

      if (convId === conversationId) {
        const remaining = activeConversations.filter(c => c.conversation_id !== convId);
        if (remaining.length > 0) {
          openConversation(remaining[0].conversation_id, remaining[0].role);
        } else {
          closePanel();
        }
      }
    } catch (err) {
      console.error('Failed to end conversation:', err);
      // Still refetch — tmux window may have been killed even if request errored
      refetchConversations();
    }
  }, [conversationId, activeConversations, refetchConversations, openConversation, closePanel]);

  const handleSpawnChief = useCallback(async () => {
    await chiefStatus.spawnChief();
    refetchConversations();
  }, [chiefStatus, refetchConversations]);

  // ─────────────────────────────────────────────────────────────────────────
  // MESSAGE HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (message: string): Promise<boolean> => {
    if (!conversationId) return false;
    setSendError(null);
    setEventCountAtSend(events.length);
    setIsWaitingForResponse(true);

    try {
      const messageBlocks: string[] = [];
      if (attachedFiles.length > 0) {
        const attachmentLines = attachedFiles.map((item) => `@${item.path}`);
        messageBlocks.push(`[Attached Files]:\n${attachmentLines.join('\n')}`);
      }
      if (message.trim()) {
        messageBlocks.push(message.trim());
      }
      const fullMessage = messageBlocks.join('\n\n');

      await sendConversationMessage(fullMessage);
      clearAttachments();
      return true;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
      setIsWaitingForResponse(false);
      return false;
    }
  }, [conversationId, attachedFiles, clearAttachments, events.length, sendConversationMessage]);

  const handleInterrupt = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${activeSessionId}/interrupt`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        setSendError(data.error || 'Failed to interrupt session');
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to interrupt session');
    }
  }, [activeSessionId]);

  // Global Escape handler
  useEffect(() => {
    if (!isVisible || !conversationId) return;

    const handleGlobalEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !isPanelFocused) return;
      const isInModal = document.activeElement?.closest('[role="dialog"]');
      if (isInModal) return;
      e.preventDefault();
      handleInterrupt();
    };

    window.addEventListener('keydown', handleGlobalEscape);
    return () => window.removeEventListener('keydown', handleGlobalEscape);
  }, [isVisible, conversationId, isPanelFocused, handleInterrupt]);

  // Reset waiting state
  useEffect(() => {
    if (activityState.type === 'complete' || activityState.type === 'idle') {
      setIsWaitingForResponse(false);
    }
  }, [activityState.type]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <aside
      ref={panelRef}
      data-testid="claude-panel"
      style={{ width: `${currentWidth}px` }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        h-full relative flex flex-col shrink-0
        bg-[var(--surface-claude)]
        border-l border-[var(--border-claude)]
        shadow-[-4px_0_20px_rgba(0,0,0,0.15)]
        transition-all duration-200 ease-out overflow-hidden
        ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
    >
      {isMinimized ? (
        <MinimizedView
          conversations={activeConversations}
          selectedConversationId={conversationId}
          onSelectConversation={(id, role) => openConversation(id, role)}
          onExpand={() => setIsMinimized(false)}
          onSpawnChief={handleSpawnChief}
        />
      ) : (
        <>
          {isDragOver && (
            <div className="absolute inset-2 z-20 rounded-xl border-2 border-dashed border-[var(--color-claude)] bg-[var(--surface-claude)]/95 backdrop-blur-sm pointer-events-none flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs font-medium text-[var(--color-claude)]">Drop to attach</div>
                <div className="text-[10px] text-[var(--color-claude)]/70 mt-1">Files will be added as context</div>
              </div>
            </div>
          )}

          <div
            onMouseDown={startResize}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--surface-muted)] transition-colors z-10"
            title="Drag to resize"
          />

          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-claude-raised)]">
            <ConversationList
              conversations={activeConversations}
              selectedConversationId={conversationId}
              onSelectConversation={handleSelectConversation}
              onEndConversation={handleEndConversation}
              onSpawnChief={handleSpawnChief}
              onRefresh={refetchConversations}
              onMinimize={() => setIsMinimized(true)}
              sseConnected={sseConnected}
              getHandoffPhase={getHandoffPhase}
              hasPendingQuestion={hasPendingQuestion}
            />
          </div>
        </>
      )}


      {!isMinimized && conversationId && tasks.length > 0 && (
        <TaskListPanel tasks={tasks} />
      )}

      {!isMinimized && (
        <div className="flex-1 overflow-hidden bg-[var(--surface-claude)]">
          {!conversationId ? (
            <EmptyState
              hasAnySession={hasAnyConversation}
              onSpawnChief={handleSpawnChief}
            />
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
              <span className="ml-2 text-xs text-[var(--text-tertiary)]">Loading...</span>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-auto px-3 py-2" tabIndex={0} aria-label="Claude transcript">
                <TranscriptProvider value={transcriptContextValue}>
                  <TranscriptViewer
                    events={events}
                    isConnected={isConnected}
                    role={conversationRole || undefined}
                    pagination={pagination}
                    onLoadEarlier={loadEarlierHistory}
                    handoffPhase={conversationId ? getHandoffPhase(conversationId) : undefined}
                  />
                </TranscriptProvider>
              </div>
            </div>
          )}
        </div>
      )}

      {!isMinimized && error && (
        <div className="px-3 py-2 bg-[var(--color-error-dim)] border-t border-[var(--color-error)]/20">
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-error)]">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!isMinimized && conversationId && (
        <ActiveTaskBanner activity={activity} />
      )}

      {!isMinimized && conversationId && (
        <InputArea
          sessionId={activeSessionId || conversationId}
          roleName={roleName}
          attachedFiles={attachedFiles}
          chatInputRef={chatInputRef}
          formatBytes={formatBytes}
          onSend={sendMessage}
          onInterrupt={handleInterrupt}
          onRemoveAttachment={removeAttachment}
          onTogglePreview={togglePreview}
          onFilePick={handleFilePick}
          onAddAttachment={addAttachment}
          hasPendingQuestion={hasPendingQuestion}
          isProcessing={activityState.type === 'thinking' || activityState.type === 'tool_executing'}
        />
      )}

      <LifecycleToast />
    </aside>
  );
}

export default ClaudePanel;
