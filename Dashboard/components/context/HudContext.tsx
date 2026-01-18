'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { StagedItem } from '@/lib/types';
import { fetchStage, dismissStagedItem } from '@/lib/api';

interface HudState {
  items: StagedItem[];
  isOpen: boolean;
  currentIndex: number;
  loading: boolean;
  error: string | null;
}

interface HudContextValue extends HudState {
  open: () => void;
  close: () => void;
  toggle: () => void;
  dismiss: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  goToIndex: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
  refresh: () => Promise<void>;
}

const HudContext = createContext<HudContextValue | null>(null);

// Jan 2026: Stage endpoint doesn't exist, so no polling needed
// When stage endpoint is implemented, add SSE event for stage.updated
const AUTO_OPEN_DELAY = 500; // 500ms delay before auto-opening

export function HudProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<StagedItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous count for auto-open detection
  const prevCountRef = useRef(0);
  const autoOpenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark as mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch staged items
  const refresh = useCallback(async () => {
    try {
      const data = await fetchStage();
      const prevCount = prevCountRef.current;
      const newCount = data.items.length;

      setItems(data.items);
      setError(null);

      // Auto-open if new items arrived (and wasn't already open)
      if (newCount > prevCount && prevCount >= 0 && !isOpen) {
        // Clear any existing timeout
        if (autoOpenTimeoutRef.current) {
          clearTimeout(autoOpenTimeoutRef.current);
        }
        // Delay auto-open
        autoOpenTimeoutRef.current = setTimeout(() => {
          setIsOpen(true);
          setCurrentIndex(0); // Show newest first
        }, AUTO_OPEN_DELAY);
      }

      prevCountRef.current = newCount;

      // Reset current index if out of bounds
      if (currentIndex >= newCount && newCount > 0) {
        setCurrentIndex(newCount - 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch staged content');
    } finally {
      setLoading(false);
    }
  }, [isOpen, currentIndex]);

  // Initial load only - no polling (endpoint doesn't exist)
  // Jan 2026: When stage endpoint is implemented, use SSE events instead of polling
  useEffect(() => {
    if (!mounted) return;

    refresh();
    return () => {
      if (autoOpenTimeoutRef.current) {
        clearTimeout(autoOpenTimeoutRef.current);
      }
    };
  }, [mounted, refresh]);

  // Keyboard shortcuts (only after mount)
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Backtick to toggle
      if (e.key === '`') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        return;
      }

      // Only handle navigation when open
      if (!isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      // Arrow keys to navigate
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex(prev => Math.max(0, prev - 1));
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex(prev => Math.min(items.length - 1, prev + 1));
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mounted, isOpen, items.length]);

  // Dismiss a single item
  const dismiss = useCallback(async (id: string) => {
    try {
      await dismissStagedItem(id);
      setItems(prev => {
        const newItems = prev.filter(item => item.id !== id);
        // Adjust current index if needed
        if (currentIndex >= newItems.length && newItems.length > 0) {
          setCurrentIndex(newItems.length - 1);
        }
        // Close panel if no items left
        if (newItems.length === 0) {
          setIsOpen(false);
        }
        prevCountRef.current = newItems.length;
        return newItems;
      });
    } catch (err) {
      console.error('Failed to dismiss item:', err);
    }
  }, [currentIndex]);

  // Dismiss all items
  const dismissAll = useCallback(async () => {
    try {
      await Promise.all(items.map(item => dismissStagedItem(item.id)));
      setItems([]);
      setCurrentIndex(0);
      setIsOpen(false);
      prevCountRef.current = 0;
    } catch (err) {
      console.error('Failed to dismiss all items:', err);
    }
  }, [items]);

  // Navigation functions
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(items.length - 1, index)));
  }, [items.length]);
  const goNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(items.length - 1, prev + 1));
  }, [items.length]);
  const goPrev = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const value: HudContextValue = {
    items,
    isOpen,
    currentIndex,
    loading,
    error,
    open,
    close,
    toggle,
    dismiss,
    dismissAll,
    goToIndex,
    goNext,
    goPrev,
    refresh,
  };

  return (
    <HudContext.Provider value={value}>
      {children}
    </HudContext.Provider>
  );
}

export function useHud() {
  const context = useContext(HudContext);
  if (!context) {
    throw new Error('useHud must be used within a HudProvider');
  }
  return context;
}

export default HudContext;
