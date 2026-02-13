'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useCallback } from 'react';
import { useWindowStore, CoreAppType } from '@/store/windowStore';

interface ApplicationShellProps {
  children: ReactNode;
  title: string;
  icon?: ReactNode;
  /** Optional sub-navigation to render in the header */
  subNav?: ReactNode;
  /** If set, this Core App can toggle to windowed mode (green button enabled) */
  appType?: CoreAppType;
  /** When true, content area uses overflow-hidden with no padding. For canvas-based apps (React Flow, etc.) */
  fullBleed?: boolean;
}

/**
 * ApplicationShell - Wraps fullscreen app routes with window chrome.
 * 
 * Provides:
 * - Traffic light buttons (close/minimize → Desktop)
 * - App title and icon
 * - Optional sub-navigation area
 * - Consistent styling across all apps
 * - Green button for Core Apps: toggles to windowed mode
 */
export function ApplicationShell({ children, title, icon, subNav, appType, fullBleed }: ApplicationShellProps) {
  const router = useRouter();
  const { openAppWindow } = useWindowStore();

  const handleClose = useCallback(() => {
    router.push('/desktop');
  }, [router]);

  const handleWindowedMode = useCallback(() => {
    if (appType) {
      // Navigate to Desktop and open as window
      router.push('/desktop');
      // Small delay to ensure we're on Desktop before opening window
      setTimeout(() => {
        openAppWindow(appType);
      }, 100);
    }
  }, [router, appType, openAppWindow]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#1e1e1e]">
      {/* Window Header - matches DesktopWindow chrome */}
      <div className="flex items-center h-8 px-3 border-b border-gray-200 dark:border-[#3a3a3a] bg-gray-50 dark:bg-[#2d2d2d] shrink-0">
        {/* Traffic Lights */}
        <div className="flex items-center gap-2 mr-4">
          {/* Close - red */}
          <button
            onClick={handleClose}
            className="group w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all flex items-center justify-center"
            title="Close (go to Desktop)"
          >
            <span className="text-[8px] text-black/60 opacity-0 group-hover:opacity-100">×</span>
          </button>
          {/* Minimize - yellow (same as close for now) */}
          <button
            onClick={handleClose}
            className="group w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 transition-all flex items-center justify-center"
            title="Minimize (go to Desktop)"
          >
            <span className="text-[8px] text-black/60 opacity-0 group-hover:opacity-100">−</span>
          </button>
          {/* Windowed mode - green (only for Core Apps with appType) */}
          {appType ? (
            <button
              onClick={handleWindowedMode}
              className="group w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 transition-all flex items-center justify-center"
              title="Switch to windowed mode"
            >
              <span className="text-[8px] text-black/60 opacity-0 group-hover:opacity-100">↙</span>
            </button>
          ) : (
            <div className="w-3 h-3 rounded-full bg-[#28c840] opacity-50" title="Fullscreen only" />
          )}
        </div>

        {/* App Title */}
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-gray-500 dark:text-[#888]">
              {icon}
            </span>
          )}
          <span className="text-xs font-medium text-gray-700 dark:text-[#b0b0b0] truncate">
            {title}
          </span>
        </div>

        {/* Sub-navigation (tabs) - pushed to the right or centered */}
        {subNav && (
          <div className="ml-6 flex-1">
            {subNav}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className={fullBleed ? "flex-1 overflow-hidden" : "flex-1 overflow-auto pb-20"}>
        {children}
      </div>
    </div>
  );
}

export default ApplicationShell;
