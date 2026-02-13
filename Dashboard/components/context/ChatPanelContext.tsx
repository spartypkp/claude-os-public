'use client';

/**
 * ChatPanelContext - Conversation-first panel state
 *
 * Tracks which conversation is selected and panel visibility.
 * Transcript cache moved to useConversation hook (keyed by conversation_id).
 *
 * Mental model: Conversation is what users see. Session is internal.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

// Debounce helper
function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useMemo(() => {
    const debouncedFn = (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    };
    return debouncedFn as T;
  }, [delay]);
}

interface ChatDraft {
  inputValue: string;
  attachments: ChatDraftAttachment[];
}

interface ChatDraftAttachment {
  path: string;
  name: string;
  size: number | null;
  previewOpen: boolean;
  previewContent?: string | null;
  imported?: boolean;
  error?: string | null;
}

interface ChatPanelState {
  isOpen: boolean;
  conversationId: string | null;
  conversationRole: string | null;
}

const DRAFTS_STORAGE_KEY = 'claude-panel-drafts-v2';

interface SessionCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[];
  lastEventUuid: string | null;
  loadedAt: number;
}

interface ChatPanelContextValue extends ChatPanelState {
  // Conversation management
  openConversation: (conversationId: string, role?: string) => void;
  openSession: (sessionId: string, role?: string) => void;
  setConversation: (conversationId: string | null, role?: string | null) => void;
  closePanel: () => void;
  togglePanel: (conversationId: string, role?: string) => void;
  toggleVisibility: () => void;

  // Draft cache (per conversation)
  getDraft: (conversationId: string) => ChatDraft | undefined;
  setDraft: (conversationId: string, draft: ChatDraft) => void;
  clearDraft: (conversationId: string) => void;

  // Session transcript cache
  getSessionCache: (sessionId: string) => SessionCache | undefined;
  setSessionCache: (sessionId: string, cache: SessionCache) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appendToCache: (sessionId: string, event: any) => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChatPanelState>({
    isOpen: true,
    conversationId: null,
    conversationRole: null,
  });

  const draftCacheRef = useRef<Map<string, ChatDraft>>(new Map());
  const sessionCacheRef = useRef<Map<string, SessionCache>>(new Map());

  // Load drafts from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, ChatDraft>;
      Object.entries(parsed).forEach(([convId, draft]) => {
        const sanitized: ChatDraft = {
          inputValue: draft.inputValue || '',
          attachments: (draft.attachments || []).map((attachment) => ({
            path: attachment.path,
            name: attachment.name,
            size: attachment.size ?? null,
            previewOpen: false,
            previewContent: null,
            imported: attachment.imported ?? false,
            error: null,
          })),
        };
        draftCacheRef.current.set(convId, sanitized);
      });
    } catch (err) {
      console.warn('Failed to load draft cache:', err);
    }
  }, []);

  // Conversation methods
  const openConversation = useCallback((conversationId: string, role?: string) => {
    setState({
      isOpen: true,
      conversationId,
      conversationRole: role || null,
    });
  }, []);

  const setConversation = useCallback((conversationId: string | null, role?: string | null) => {
    setState(prev => ({
      ...prev,
      conversationId,
      conversationRole: role || null,
    }));
  }, []);

  const closePanel = useCallback(() => {
    setState({
      isOpen: false,
      conversationId: null,
      conversationRole: null,
    });
  }, []);

  const togglePanel = useCallback((conversationId: string, role?: string) => {
    setState(prev => {
      if (prev.isOpen && prev.conversationId === conversationId) {
        return {
          isOpen: false,
          conversationId: null,
          conversationRole: null,
        };
      }
      return {
        isOpen: true,
        conversationId,
        conversationRole: role || null,
      };
    });
  }, []);

  const toggleVisibility = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: !prev.isOpen,
    }));
  }, []);

  // Draft methods
  const getDraft = useCallback((conversationId: string): ChatDraft | undefined => {
    return draftCacheRef.current.get(conversationId);
  }, []);

  const persistDraftsToStorage = useCallback(() => {
    try {
      const serializable: Record<string, ChatDraft> = {};
      draftCacheRef.current.forEach((value, key) => {
        serializable[key] = {
          inputValue: value.inputValue,
          attachments: value.attachments.map((attachment) => ({
            path: attachment.path,
            name: attachment.name,
            size: attachment.size,
            previewOpen: false,
            previewContent: null,
            imported: attachment.imported ?? false,
            error: null,
          })),
        };
      });
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(serializable));
    } catch (err) {
      console.warn('Failed to persist draft cache:', err);
    }
  }, []);

  const debouncedPersist = useDebouncedCallback(persistDraftsToStorage, 500);

  const setDraft = useCallback((conversationId: string, draft: ChatDraft) => {
    draftCacheRef.current.set(conversationId, draft);
    debouncedPersist();
  }, [debouncedPersist]);

  const clearDraft = useCallback((conversationId: string) => {
    draftCacheRef.current.delete(conversationId);
    debouncedPersist();
  }, [debouncedPersist]);

  // Session cache methods
  const getSessionCache = useCallback((sessionId: string): SessionCache | undefined => {
    return sessionCacheRef.current.get(sessionId);
  }, []);

  const setSessionCache = useCallback((sessionId: string, cache: SessionCache) => {
    sessionCacheRef.current.set(sessionId, cache);
  }, []);

  const appendToCache = useCallback((sessionId: string, event: unknown) => {
    const existing = sessionCacheRef.current.get(sessionId);
    if (existing) {
      existing.events.push(event);
    }
  }, []);

  // openSession is an alias for openConversation
  const openSession = useCallback((sessionId: string, role?: string) => {
    setState({
      isOpen: true,
      conversationId: sessionId,
      conversationRole: role || null,
    });
  }, []);

  const value: ChatPanelContextValue = {
    ...state,
    openConversation,
    openSession,
    setConversation,
    closePanel,
    togglePanel,
    toggleVisibility,
    getDraft,
    setDraft,
    clearDraft,
    getSessionCache,
    setSessionCache,
    appendToCache,
  };

  return (
    <ChatPanelContext.Provider value={value}>
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  const context = useContext(ChatPanelContext);
  if (!context) {
    throw new Error('useChatPanel must be used within a ChatPanelProvider');
  }
  return context;
}

export default ChatPanelContext;
