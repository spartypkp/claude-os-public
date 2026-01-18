'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  X,
  ExternalLink,
  Send,
  FileText,
  Bug,
  Lightbulb,
  Zap,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

type ActionType = 'drop' | 'bug' | 'idea' | 'dump' | 'say';

interface ActionConfig {
  type: ActionType;
  label: string;
  description: string;
  icon: typeof FileText;
  color: string;
  hoverBg: string;
}

const ACTIONS: ActionConfig[] = [
  { type: 'drop', label: 'Note', description: 'File silently', icon: FileText, color: 'text-slate-400', hoverBg: 'hover:bg-slate-500/10' },
  { type: 'bug', label: 'Bug', description: 'Track issue', icon: Bug, color: 'text-red-400', hoverBg: 'hover:bg-red-500/10' },
  { type: 'idea', label: 'Idea', description: 'Capture thought', icon: Lightbulb, color: 'text-amber-400', hoverBg: 'hover:bg-amber-500/10' },
  { type: 'dump', label: 'Dump', description: 'Brain dump', icon: Zap, color: 'text-purple-400', hoverBg: 'hover:bg-purple-500/10' },
];

interface ChiefPopoutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chiefSessionId?: string;
  chiefStatus?: string;
  anchorRect?: DOMRect;
}

export function ChiefPopoutPanel({
  isOpen,
  onClose,
  chiefSessionId: _chiefSessionId,
  chiefStatus: _chiefStatus,
  anchorRect,
}: ChiefPopoutPanelProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<ActionType | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setSuccess(null);
      setHint(null);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close on the click that opens the panel
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Send message to Chief
  const sendMessage = useCallback(async (type: ActionType) => {
    // For non-drop actions without a message, show a helpful hint
    if (!message.trim() && type !== 'drop') {
      setHint(`Type a message first to send as ${type}`);
      setTimeout(() => setHint(null), 2000);
      inputRef.current?.focus();
      return;
    }

    setSending(true);
    setHint(null);
    try {
      const response = await fetch(`${API_BASE}/api/chief/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccess(type);
        setTimeout(() => {
          setSuccess(null);
          setMessage('');
          if (type !== 'say') {
            onClose();
          }
        }, 500);
      }
    } catch (err) {
      console.error('Failed to send to Chief:', err);
    } finally {
      setSending(false);
    }
  }, [message, onClose]);

  // Handle enter key in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage('say');
    }
  };

  if (!isOpen) return null;

  // Position panel to the right of the anchor
  const panelStyle: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.top,
        left: anchorRect.right + 8,
        zIndex: 100,
      }
    : {
        position: 'fixed',
        top: 80,
        left: 272, // sidebar width (256) + gap (16)
        zIndex: 100,
      };

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className="w-[400px] bg-gradient-to-b from-[var(--surface-raised)] to-[var(--surface-base)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden animate-in slide-in-from-left-2 duration-150"
    >
      {/* Minimal header - context is obvious from sidebar card */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Quick actions</span>
        <div className="flex items-center gap-1">
          <Link
            href="/desktop"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            title="Open The Desk"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick message input */}
      <div className="px-5 py-4">
        {/* Hint message */}
        {hint && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-400">{hint}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            disabled={sending}
            className="flex-1 px-4 py-2.5 text-sm bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-claude)]/50 focus:border-[var(--color-claude)]/50 disabled:opacity-50 transition-all"
          />
          <button
            onClick={() => sendMessage('say')}
            disabled={sending || !message.trim()}
            className="p-2.5 rounded-xl bg-[var(--color-claude)] text-white hover:bg-[var(--color-claude)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : success === 'say' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-5 py-4 border-t border-[var(--border-subtle)]">
        <div className="grid grid-cols-4 gap-2">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            const isActive = success === action.type;

            return (
              <button
                key={action.type}
                onClick={() => sendMessage(action.type)}
                disabled={sending}
                className={`
                  group flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl
                  transition-all text-center cursor-pointer
                  ${isActive
                    ? 'bg-green-500/15 border-green-500/40 scale-95'
                    : `bg-[var(--surface-muted)] ${action.hoverBg} hover:scale-[1.02] border-transparent hover:border-[var(--border-subtle)]`
                  }
                  border
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-95
                `}
                title={action.description}
              >
                {isActive ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Icon className={`w-3 h-3 ${action.color} transition-transform group-hover:scale-110`} />
                )}
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ChiefPopoutPanel;
