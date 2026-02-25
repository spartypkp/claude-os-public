'use client';

/**
 * ConversationPicker — Popover to select an interactive conversation target.
 *
 * Used by ChatButton to route context messages to active Claude sessions.
 * Only shows interactive conversations (never autonomous specialists).
 * Chief pinned first.
 */

import { useActiveConversations } from '@/hooks/queries/useConversationsQuery';
import { getRoleConfig } from '@/lib/sessionUtils';
import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';
import type { ActiveConversation } from '@/lib/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConversationPickerProps {
  anchorRect: DOMRect;
  onSelect: (conversation: ActiveConversation) => void;
  onClose: () => void;
}

const AUTONOMOUS_MODES = new Set(['preparation', 'implementation', 'verification']);

export function ConversationPicker({ anchorRect, onSelect, onClose }: ConversationPickerProps) {
  const { data: conversations } = useActiveConversations();
  const ref = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  // Filter to interactive-only (never autonomous specialists)
  const interactive = (conversations ?? []).filter(
    (c) => !AUTONOMOUS_MODES.has(c.mode)
  );

  // Pin Chief first, then sort by last activity
  const sorted = [...interactive].sort((a, b) => {
    if (a.role === 'chief' && b.role !== 'chief') return -1;
    if (b.role === 'chief' && a.role !== 'chief') return 1;
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });

  // Auto-select when only one interactive session (skip picker)
  useEffect(() => {
    if (sorted.length === 1) {
      onSelect(sorted[0]);
    }
  }, [sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handle);
    };
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIndex(i => Math.min(i + 1, sorted.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && sorted[focusIndex]) { e.preventDefault(); onSelect(sorted[focusIndex]); }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose, onSelect, sorted, focusIndex]);

  // Position: prefer below anchor, flip up if not enough space
  const top = anchorRect.bottom + 4;
  const left = Math.max(8, anchorRect.left);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      className="w-60 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden"
    >
      <div className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
        Send to conversation
      </div>

      {sorted.length === 0 ? (
        <div className="px-3 py-4 text-xs text-[var(--text-tertiary)] text-center">
          No active conversations
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto">
          {sorted.map((conv, idx) => {
            const config = getRoleConfig(conv.role);
            const Icon = config.icon;
            const isChief = conv.role === 'chief';
            const isFocused = idx === focusIndex;

            return (
              <button
                key={conv.conversation_id}
                onClick={() => onSelect(conv)}
                onMouseEnter={() => setFocusIndex(idx)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                  ${isFocused ? 'bg-[var(--surface-accent)]' : 'hover:bg-[var(--surface-accent)]'}
                `}
              >
                <div className={`flex-shrink-0 w-6 h-6 rounded-md ${config.bgColor} flex items-center justify-center`}>
                  {isChief ? (
                    <ClaudeLogo className="w-3.5 h-3.5 text-[var(--color-claude)]" />
                  ) : (
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {config.label}
                  </div>
                  {conv.status_text && (
                    <div className="text-[10px] text-[var(--text-muted)] truncate">
                      {conv.status_text}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
