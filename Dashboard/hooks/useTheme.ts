'use client';

import { useCallback } from 'react';
import { useDarkMode, useAppearanceActions } from '@/store/windowStore';

// Theme type for backward compatibility (system mode no longer supported)
export type Theme = 'light' | 'dark';

/**
 * Hook for managing theme preference.
 *
 * This hook is now a thin wrapper around windowStore for backward compatibility.
 * The source of truth is windowStore.darkMode, which is synced to both:
 * - Tailwind dark mode (class on <html>)
 * - CSS variables (data-theme attribute on <html>)
 *
 * DarkModeSync component handles the actual DOM updates.
 */
export function useTheme() {
  const darkMode = useDarkMode();
  const { toggleDarkMode } = useAppearanceActions();

  // Derive theme values from windowStore
  const resolvedTheme: 'light' | 'dark' = darkMode ? 'dark' : 'light';
  const theme: Theme = resolvedTheme;

  // Set theme by updating windowStore
  const setTheme = useCallback((newTheme: Theme) => {
    const wantsDark = newTheme === 'dark';
    // Only toggle if we need to change
    if (darkMode !== wantsDark) {
      toggleDarkMode();
    }
  }, [darkMode, toggleDarkMode]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    toggleDarkMode();
  }, [toggleDarkMode]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
}
