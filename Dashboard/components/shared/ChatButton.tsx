'use client';

/**
 * ChatButton — Trigger button that opens ConversationPicker and fires inject-to-conversation.
 *
 * Usage:
 *   <ChatButton message="From: sender — subject" app="Email" />               // compact
 *   <ChatButton message="Meeting at 3pm" app="Calendar" size="md" />          // with label
 */

import { ExternalLink } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ConversationPicker } from './ConversationPicker';
import type { ActiveConversation } from '@/lib/types';

interface ChatButtonProps {
  /** The context message to send */
  message: string;
  /** App name for [CONTEXT:App] tagging (e.g., "Email", "Calendar", "Contact", "Project") */
  app: string;
  /** sm = icon only [↗], md = icon + label [↗ Chat...] */
  size?: 'sm' | 'md';
  className?: string;
}

export function ChatButton({ message, app, size = 'sm', className = '' }: ChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback((conv: ActiveConversation) => {
    setIsOpen(false);

    // Format with [CONTEXT:App] prefix and fire CustomEvent
    const taggedMessage = `[CONTEXT:${app}] ${message}`;
    window.dispatchEvent(
      new CustomEvent('inject-to-conversation', {
        detail: {
          conversationId: conv.conversation_id,
          sessionId: conv.latest_session_id,
          role: conv.role,
          message: taggedMessage,
        },
      })
    );
  }, [message, app]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const anchorRect = buttonRef.current?.getBoundingClientRect();

  if (size === 'md') {
    return (
      <>
        <button
          ref={buttonRef}
          onClick={handleClick}
          className={`
            inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
            text-[var(--text-muted)] hover:text-[var(--text-secondary)]
            hover:bg-[var(--surface-accent)] transition-colors
            ${className}
          `}
          title="Chat about this"
        >
          <ExternalLink className="w-3 h-3" />
          Chat...
        </button>
        {isOpen && anchorRect && (
          <ConversationPicker
            anchorRect={anchorRect}
            onSelect={handleSelect}
            onClose={handleClose}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`
          p-1.5 rounded-md hover:bg-[var(--surface-accent)] transition-colors
          ${className}
        `}
        title="Chat about this"
      >
        <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]" />
      </button>
      {isOpen && anchorRect && (
        <ConversationPicker
          anchorRect={anchorRect}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      )}
    </>
  );
}
