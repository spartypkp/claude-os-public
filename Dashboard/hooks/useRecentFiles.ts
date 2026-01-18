'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'life-portal-recent-files';
const MAX_RECENT_FILES = 8;

export interface RecentFile {
  path: string;
  name: string;
  viewedAt: number;
}

/**
 * Hook for managing recently viewed files in localStorage
 * Used to show quick access to recently opened files in route viewers
 */
export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentFile[];
        setRecentFiles(parsed);
      }
    } catch (err) {
      console.error('Failed to load recent files:', err);
    }
  }, []);

  // Save to localStorage whenever recentFiles changes
  const saveToStorage = useCallback((files: RecentFile[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    } catch (err) {
      console.error('Failed to save recent files:', err);
    }
  }, []);

  // Add a file to recent list (or move to top if already exists)
  const addRecentFile = useCallback((path: string) => {
    const name = path.split('/').pop() || path;

    setRecentFiles(prev => {
      // Remove if already exists
      const filtered = prev.filter(f => f.path !== path);

      // Add to front with current timestamp
      const updated: RecentFile[] = [
        { path, name, viewedAt: Date.now() },
        ...filtered,
      ].slice(0, MAX_RECENT_FILES);

      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Remove a file from recent list
  const removeRecentFile = useCallback((path: string) => {
    setRecentFiles(prev => {
      const updated = prev.filter(f => f.path !== path);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Clear all recent files
  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear recent files:', err);
    }
  }, []);

  return {
    recentFiles,
    addRecentFile,
    removeRecentFile,
    clearRecentFiles,
  };
}
