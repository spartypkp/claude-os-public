'use client';

import { useState } from 'react';
import {
  Crown,
  Code2,
  Target,
  Briefcase,
  Lightbulb,
  HelpCircle,
  Wrench,
  Terminal,
  Copy,
  XCircle,
  ArrowRightLeft,
  RefreshCw,
} from 'lucide-react';
import type { ActiveSession, ActiveConversation } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Role icons mapping
const ROLE_ICONS: Record<string, React.ReactNode> = {
  chief: <Crown className="w-3.5 h-3.5" />,
  system: <Code2 className="w-3.5 h-3.5" />,
  focus: <Target className="w-3.5 h-3.5" />,
  project: <Briefcase className="w-3.5 h-3.5" />,
  idea: <Lightbulb className="w-3.5 h-3.5" />,
  interviewer: <HelpCircle className="w-3.5 h-3.5" />,
};

// Role display names
const ROLE_NAMES: Record<string, string> = {
  chief: 'Chief',
  system: 'System',
  focus: 'Focus',
  project: 'Project',
  idea: 'Idea',
  interviewer: 'Interviewer',
};

// Activity indicator component
function ActivityIndicator({ state }: { state: string | null }) {
  switch (state) {
    case 'active':
      return (
        <span className="flex items-center justify-center w-4 h-4">
          <span className="w-2 h-2 rounded-full bg-[var(--color-claude)] animate-pulse" />
        </span>
      );
    case 'tool_active':
      return <Wrench className="w-3.5 h-3.5 text-[var(--color-claude)] animate-pulse" />;
    case 'idle':
    case 'ended':
    default:
      return (
        <span className="text-[10px] text-[var(--text-muted)] font-medium tracking-wide">
          zzz
        </span>
      );
  }
}

// TODO (Phase 5): Consider if this should accept ActiveConversation instead
interface ConversationRowProps {
  session: ActiveSession;
  isSelected: boolean;
  onSelect: () => void;
  onEnd: (sessionId: string) => void;
  onForceHandoff: (sessionId: string) => void;
  onResetChief?: () => void;
}

export function ConversationRow({
  session,
  isSelected,
  onSelect,
  onEnd,
  onForceHandoff,
  onResetChief,
}: ConversationRowProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const role = session.role || session.session_subtype || 'chief';
  const isChief = role === 'chief' || session.session_subtype === 'chief' || session.session_subtype === 'main';
  const icon = ROLE_ICONS[role] || <Crown className="w-3.5 h-3.5" />;
  const roleName = ROLE_NAMES[role] || role;

  // Status text - what session is working on
  const statusText = session.status_text || 'Working...';

  // Current activity state
  const activityState = session.current_state || 'idle';

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleFocusTmux = async () => {
    setShowContextMenu(false);
    try {
      await fetch(`${API_BASE}/api/system/sessions/${session.session_id}/focus`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to focus session:', err);
    }
  };

  const handleCopyId = () => {
    setShowContextMenu(false);
    navigator.clipboard.writeText(session.session_id);
  };

  // Navigate to expanded view
  const sessionHref = isChief ? '/desktop' : `/activity/session/${session.session_id}`;

  return (
    <>
      {/* Session row */}
      <button
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        className={`
          w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-all rounded-md
          ${isSelected
            ? 'bg-[var(--color-claude)]/10 border-l-2 border-l-[var(--color-claude)]'
            : 'hover:bg-[var(--surface-muted)] border-l-2 border-l-transparent'
          }
        `}
      >
        {/* Role icon */}
        <span className="flex-shrink-0 text-[var(--color-claude)]">
          {icon}
        </span>

        {/* Role name */}
        <span className="text-[13px] font-medium text-[var(--text-primary)] min-w-[55px]">
          {roleName}
        </span>

        {/* Status text - truncated */}
        <span className="flex-1 text-[11px] text-[var(--text-muted)] truncate" title={statusText}>
          {statusText}
        </span>

        {/* Activity indicator */}
        <span className="flex-shrink-0">
          <ActivityIndicator state={activityState} />
        </span>
      </button>

      {/* Context menu */}
      {showContextMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            onClick={() => setShowContextMenu(false)}
          />
          {/* Menu */}
          <div
            className="fixed z-50 min-w-[200px] py-1.5 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl shadow-xl backdrop-blur-sm"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            {/* Session info header */}
            <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
              <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                {roleName}
              </div>
              <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5 font-mono">
                {session.session_id.slice(0, 8)}
              </div>
            </div>

            {/* Navigation actions */}
            <div className="py-1">
              <button
                onClick={handleFocusTmux}
                className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] flex items-center gap-2.5 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 opacity-60" />
                <span>Focus in tmux</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">⌘T</span>
              </button>
              <button
                onClick={handleCopyId}
                className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] flex items-center gap-2.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 opacity-60" />
                <span>Copy session ID</span>
              </button>
            </div>

            {/* Session control actions */}
            <div className="py-1 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => {
                  setShowContextMenu(false);
                  onForceHandoff(session.session_id);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] flex items-center gap-2.5 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 opacity-60" />
                <span>Force Handoff</span>
              </button>
              {isChief && onResetChief && (
                <button
                  onClick={() => {
                    setShowContextMenu(false);
                    onResetChief();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-amber-400 hover:bg-amber-500/10 flex items-center gap-2.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 opacity-80" />
                  <span>Reset Chief</span>
                </button>
              )}
            </div>

            {/* Danger zone */}
            <div className="py-1 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => {
                  setShowContextMenu(false);
                  onEnd(session.session_id);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5 opacity-80" />
                <span>End Session</span>
                <span className="ml-auto text-[10px] text-red-400/60">⌘W</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default ConversationRow;
