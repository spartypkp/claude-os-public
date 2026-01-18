/**
 * DarkModeSync - Single source of truth for theme state
 *
 * Syncs darkMode from Zustand store to BOTH theme systems:
 * 1. Tailwind dark mode: 'dark' class on <html> element
 * 2. CSS variables: 'data-theme' attribute on <html> element
 *
 * This ensures all components update consistently regardless of which
 * styling approach they use (Tailwind dark: classes or CSS var()).
 */

'use client';

import { useEffect } from 'react';
import { useDarkMode } from '@/store/windowStore';

export function DarkModeSync() {
  const darkMode = useDarkMode();

  useEffect(() => {
    const root = document.documentElement;

    if (darkMode) {
      // Set both Tailwind dark class AND CSS variable data-theme
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [darkMode]);

  return null; // This component doesn't render anything
}
