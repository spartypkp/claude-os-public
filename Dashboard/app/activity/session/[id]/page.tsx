'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, Loader2, AlertCircle, Crown, Code2, Target, Briefcase, Lightbulb } from 'lucide-react';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { InputArea } from '@/components/ClaudePanel/InputArea';
import { ThinkingIndicator, ActiveTaskBanner } from '@/components/ClaudePanel/ClaudeActivityHeader';
import { ContextWarningBanner } from '@/components/ClaudePanel/ContextWarningBanner';
import { TaskListPanel } from '@/components/ClaudePanel/TaskListPanel';
import { useClaudeSession } from '@/hooks/useClaudeConversation';
import { useClaudeActivity } from '@/hooks/useClaudeActivity';
import { useAttachments } from '@/components/ClaudePanel/hooks';
import type { ChatInputHandle } from '@/components/ClaudePanel/ChatInput';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Role icons
const ROLE_ICONS: Record<string, React.ElementType> = {
  chief: Crown,
  builder: Code2,
  'deep-work': Target,
  project: Briefcase,
  idea: Lightbulb,
};

// Role names
const ROLE_NAMES: Record<string, string> = {
  chief: 'Chief',
  builder: 'Builder',
  'deep-work': 'Deep Work',
  project: 'Project',
  idea: 'Idea',
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  // Get session data
  const claudeActivity = useClaudeActivity();
  const currentSession = claudeActivity.sessions.find(s => s.session_id === sessionId);
  const conversationId = currentSession?.conversation_id;

  // Session transcript data
  const {
    events,
    activity,
    contextWarning,
    tasks,
    isConnected,
    isLoading,
    error: transcriptError,
  } = useClaudeSession(sessionId, {
    includeThinking: true,
    conversationId,
  });

  // Attachments
  const {
    attachedFiles,
    addAttachment,
    removeAttachment,
    togglePreview,
    formatBytes,
  } = useAttachments({ sessionId });

  // Input ref and state
  const chatInputRef = useRef<ChatInputHandle>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Get role info
  const role = currentSession?.role || 'chief';
  const roleName = ROLE_NAMES[role] || role;
  const RoleIcon = ROLE_ICONS[role] || Crown;

  // Send message handler
  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId) return;
    setSendError(null);

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

      const response = await fetch(`${API_BASE}/api/system/sessions/${sessionId}/say`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMessage }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      chatInputRef.current?.clear();
      attachedFiles.forEach(f => removeAttachment(f.path));
    } catch (err) {
      setSendError('Failed to send message. Please try again.');
      console.error('Send error:', err);
    }
  }, [sessionId, attachedFiles, removeAttachment]);

  // Interrupt handler
  const handleInterrupt = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE}/api/system/sessions/${sessionId}/interrupt`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to interrupt:', err);
    }
  }, [sessionId]);

  // Compact handler
  const handleCompact = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE}/api/system/sessions/${sessionId}/say`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '/compact' }),
      });
    } catch (err) {
      console.error('Failed to send /compact:', err);
    }
  }, [sessionId]);

  // Force handoff handler
  const handleForceHandoff = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE}/api/system/sessions/${sessionId}/force-handoff`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to force handoff:', err);
    }
  }, [sessionId]);

  const error = transcriptError || sendError;

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-base)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/activity')}
            className="p-2 rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
            aria-label="Back to activity"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-claude)]/10">
              <RoleIcon className="w-5 h-5 text-[var(--color-claude)]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">{roleName}</h1>
              {currentSession?.description && (
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  {currentSession.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context warning */}
      {contextWarning && (
        <ContextWarningBanner
          warning={contextWarning}
          onCompact={handleCompact}
          onReset={handleForceHandoff}
        />
      )}

      {/* Task list */}
      {tasks.length > 0 && (
        <TaskListPanel tasks={tasks} />
      )}

      {/* Transcript area */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-[#1e1e1e]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-[#888]" />
            <span className="ml-2 text-xs text-gray-500 dark:text-[#888]">Loading transcript...</span>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto px-6 py-4" tabIndex={0} aria-label="Claude transcript">
              <TranscriptViewer
                events={events}
                isConnected={isConnected}
                role={role}
                activityIndicator={<ThinkingIndicator activity={activity} />}
              />
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-500/10 border-t border-red-200 dark:border-red-500/20">
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Active task banner */}
      {sessionId && (
        <ActiveTaskBanner activity={activity} />
      )}

      {/* Input area */}
      {sessionId && (
        <div className="border-t border-[var(--border-subtle)]">
          <InputArea
            sessionId={sessionId}
            roleName={roleName}
            attachedFiles={attachedFiles}
            chatInputRef={chatInputRef}
            formatBytes={formatBytes}
            onSend={sendMessage}
            onInterrupt={handleInterrupt}
            onRemoveAttachment={removeAttachment}
            onTogglePreview={togglePreview}
          />
        </div>
      )}
    </div>
  );
}
