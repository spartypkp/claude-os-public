'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { TranscriptEvent } from '@/hooks/useTranscriptStream';

// Debounce helper
function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  
  // Update the callback ref when it changes
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

/**
 * Cache for a single session's transcript events.
 */
interface SessionCache {
  events: TranscriptEvent[];
  lastEventUuid: string | null;
  loadedAt: number;  // Timestamp for cache invalidation
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
  isOpen: boolean;  // Panel visibility (controlled by ⌘L)
  sessionId: string | null;
  sessionRole: string | null;
}

const DRAFTS_STORAGE_KEY = 'claude-panel-drafts-v1';

interface ChatPanelContextValue extends ChatPanelState {
  openSession: (sessionId: string, role?: string) => void;
  setSession: (sessionId: string | null, role?: string | null) => void;
  closePanel: () => void;
  togglePanel: (sessionId: string, role?: string) => void;
  toggleVisibility: () => void;  // Toggle panel visibility (⌘L)
  // Session cache methods
  getSessionCache: (sessionId: string) => SessionCache | undefined;
  setSessionCache: (sessionId: string, cache: SessionCache) => void;
  appendToCache: (sessionId: string, event: TranscriptEvent) => void;
  clearSessionCache: (sessionId: string) => void;
  // Draft cache methods (per session)
  getDraft: (sessionId: string) => ChatDraft | undefined;
  setDraft: (sessionId: string, draft: ChatDraft) => void;
  clearDraft: (sessionId: string) => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChatPanelState>({
    isOpen: true,  // Default to visible (⌘L toggles)
    sessionId: null,
    sessionRole: null,
  });

  // Session caches - using ref to avoid re-renders on cache updates
  const sessionCachesRef = useRef<Map<string, SessionCache>>(new Map());
  const draftCacheRef = useRef<Map<string, ChatDraft>>(new Map());
  // Force update counter for when we need to trigger re-renders
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, ChatDraft>;
      Object.entries(parsed).forEach(([sessionId, draft]) => {
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
        draftCacheRef.current.set(sessionId, sanitized);
      });
    } catch (err) {
      console.warn('Failed to load draft cache:', err);
    }
  }, []);

  const openSession = useCallback((sessionId: string, role?: string) => {
    setState({
      isOpen: true,
      sessionId,
      sessionRole: role || null,
    });
  }, []);

  const setSession = useCallback((sessionId: string | null, role?: string | null) => {
    setState(prev => ({
      ...prev,
      sessionId,
      sessionRole: role || null,
    }));
  }, []);

  const closePanel = useCallback(() => {
    setState({
      isOpen: false,
      sessionId: null,
      sessionRole: null,
    });
  }, []);

  const togglePanel = useCallback((sessionId: string, role?: string) => {
    setState(prev => {
      // If clicking the same session that's already open, close it
      if (prev.isOpen && prev.sessionId === sessionId) {
        return {
          isOpen: false,
          sessionId: null,
          sessionRole: null,
        };
      }
      // Otherwise open this session
      return {
        isOpen: true,
        sessionId,
        sessionRole: role || null,
      };
    });
  }, []);

  const toggleVisibility = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: !prev.isOpen,
    }));
  }, []);

  // Session cache methods
  const getSessionCache = useCallback((sessionId: string): SessionCache | undefined => {
    return sessionCachesRef.current.get(sessionId);
  }, []);

  const setSessionCache = useCallback((sessionId: string, cache: SessionCache) => {
    sessionCachesRef.current.set(sessionId, cache);
    forceUpdate(n => n + 1);
  }, []);

  const appendToCache = useCallback((sessionId: string, event: TranscriptEvent) => {
    const existing = sessionCachesRef.current.get(sessionId);
    if (existing) {
      // Avoid duplicates by checking UUID
      if (event.uuid && existing.events.some(e => e.uuid === event.uuid)) {
        return;
      }
      // Create NEW cache object with NEW events array to trigger React re-renders
      // Mutating in place doesn't change reference, so useMemo/useEffect dependencies don't fire
      sessionCachesRef.current.set(sessionId, {
        events: [...existing.events, event],
        lastEventUuid: event.uuid || existing.lastEventUuid,
        loadedAt: existing.loadedAt,
      });
      forceUpdate(n => n + 1);
    }
  }, []);

  const clearSessionCache = useCallback((sessionId: string) => {
    sessionCachesRef.current.delete(sessionId);
    forceUpdate(n => n + 1);
  }, []);

  const getDraft = useCallback((sessionId: string): ChatDraft | undefined => {
    return draftCacheRef.current.get(sessionId);
  }, []);

  // Persist drafts to localStorage (expensive, so we'll debounce this)
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

  // Debounced version - only persist to localStorage every 500ms
  const debouncedPersist = useDebouncedCallback(persistDraftsToStorage, 500);

  const setDraft = useCallback((sessionId: string, draft: ChatDraft) => {
    // Update in-memory cache immediately (no lag)
    draftCacheRef.current.set(sessionId, draft);
    // Debounce the expensive localStorage write
    debouncedPersist();
  }, [debouncedPersist]);

  const clearDraft = useCallback((sessionId: string) => {
    draftCacheRef.current.delete(sessionId);
    // Use the same debounced persist
    debouncedPersist();
  }, [debouncedPersist]);

  const value: ChatPanelContextValue = {
    ...state,
    openSession,
    setSession,
    closePanel,
    togglePanel,
    toggleVisibility,
    getSessionCache,
    setSessionCache,
    appendToCache,
    clearSessionCache,
    getDraft,
    setDraft,
    clearDraft,
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
