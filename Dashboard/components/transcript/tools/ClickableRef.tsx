'use client';

import { useCallback } from 'react';
import { useWindowStore } from '@/store/windowStore';
import { useChatPanel } from '@/components/context/ChatPanelContext';
import type { CoreAppType } from '@/store/windowStore';

/**
 * Hook for opening items in the desktop environment.
 * Smart routing based on content type.
 */
export function useOpenInDesktop() {
  const { openWindow, openAppWindow } = useWindowStore();
  const { openSession } = useChatPanel();

  /**
   * Open a file - decides between document viewer vs Finder
   * @param path - File path (can be relative to Desktop or absolute)
   * @param preferFinder - Force open in Finder instead of viewer
   */
  const openFile = useCallback((path: string, preferFinder = false) => {
    if (!path) return;
    
    // Normalize path - ensure it starts with Desktop/ if relative
    const normalizedPath = path.startsWith('/') 
      ? path 
      : path.startsWith('Desktop/') 
        ? path 
        : `Desktop/${path}`;
    
    const fileName = path.split('/').pop() || 'File';
    const isDirectory = !fileName.includes('.') || fileName.endsWith('/');
    
    // Directories always open in Finder
    if (isDirectory || preferFinder) {
      // Get parent directory for Finder
      const parts = normalizedPath.replace(/^Desktop\//, '').split('/');
      const dirPath = parts.slice(0, -1).join('/') || '';
      openAppWindow('finder', dirPath);
    } else {
      // Files open in document viewer
      openWindow(normalizedPath, fileName);
    }
  }, [openWindow, openAppWindow]);

  /**
   * Open Finder at a specific directory
   */
  const openInFinder = useCallback((dirPath?: string) => {
    const normalized = dirPath?.replace(/^Desktop\//, '') || '';
    openAppWindow('finder', normalized);
  }, [openAppWindow]);

  /**
   * Open a core app
   */
  const openApp = useCallback((appType: CoreAppType) => {
    openAppWindow(appType);
  }, [openAppWindow]);

  /**
   * Open Contacts app (optionally search for a contact)
   */
  const openContact = useCallback((contactName?: string) => {
    // TODO: Could pass search query to contacts app
    openAppWindow('contacts');
  }, [openAppWindow]);

  /**
   * Open Email app
   */
  const openEmail = useCallback(() => {
    openAppWindow('email');
  }, [openAppWindow]);

  /**
   * Open Calendar app
   */
  const openCalendar = useCallback(() => {
    openAppWindow('calendar');
  }, [openAppWindow]);

  /**
   * Open Missions app
   */
  const openMissions = useCallback(() => {
    openAppWindow('missions');
  }, [openAppWindow]);

  /**
   * Switch to a session in Claude Panel
   */
  const switchSession = useCallback((sessionId: string, role?: string) => {
    openSession(sessionId, role || 'builder');
  }, [openSession]);

  return {
    openFile,
    openInFinder,
    openApp,
    openContact,
    openEmail,
    openCalendar,
    openMissions,
    switchSession,
  };
}

/**
 * Reference types that can be clicked
 */
type RefType = 'file' | 'directory' | 'contact' | 'email' | 'calendar' | 'mission' | 'session' | 'worker';

interface ClickableRefProps {
  /** Type of reference */
  type: RefType;
  /** The value (path, name, ID, etc.) */
  value: string;
  /** Optional secondary value (e.g., role for sessions) */
  secondary?: string;
  /** Display text (defaults to value) */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Force open in Finder for files */
  preferFinder?: boolean;
}

/**
 * Clickable reference component.
 * Click to open the referenced item in the appropriate app.
 */
export function ClickableRef({
  type,
  value,
  secondary,
  children,
  className = '',
  preferFinder = false,
}: ClickableRefProps) {
  const { 
    openFile, 
    openInFinder, 
    openContact, 
    openEmail, 
    openCalendar, 
    openMissions,
    switchSession,
  } = useOpenInDesktop();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    switch (type) {
      case 'file':
        openFile(value, preferFinder);
        break;
      case 'directory':
        openInFinder(value);
        break;
      case 'contact':
        openContact(value);
        break;
      case 'email':
        openEmail();
        break;
      case 'calendar':
        openCalendar();
        break;
      case 'mission':
        openMissions();
        break;
      case 'session':
        switchSession(value, secondary);
        break;
      case 'worker':
        // TODO: Navigate to worker details
        break;
    }
  }, [type, value, secondary, preferFinder, openFile, openInFinder, openContact, openEmail, openCalendar, openMissions, switchSession]);

  return (
    <span
      onClick={handleClick}
      className={`
        cursor-pointer hover:underline decoration-dotted underline-offset-2
        hover:text-[#da7756] transition-colors
        ${className}
      `}
      title={`Open ${type}: ${value}`}
    >
      {children || value}
    </span>
  );
}

/**
 * Extract clickable file path from a string.
 * Returns the path if found, null otherwise.
 */
export function extractFilePath(text: string): string | null {
  if (!text) return null;
  
  // Common path patterns
  const patterns = [
    // Absolute paths
    /\/[\w\-./]+\.\w+/,
    // Desktop-relative paths
    /Desktop\/[\w\-./]+/,
    // Relative paths with extension
    /[\w\-./]+\.\w{1,10}/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  
  return null;
}

/**
 * Check if a path looks like a viewable file (vs directory or search pattern)
 */
export function isViewableFile(path: string): boolean {
  if (!path) return false;
  
  // Has a file extension
  const hasExtension = /\.\w{1,10}$/.test(path);
  
  // Not a glob pattern
  const isGlob = path.includes('*') || path.includes('?');
  
  // Not a directory indicator
  const isDir = path.endsWith('/');
  
  return hasExtension && !isGlob && !isDir;
}

export default ClickableRef;

