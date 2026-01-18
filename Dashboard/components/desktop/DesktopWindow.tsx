'use client';

import { ReactNode, useCallback, useState, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import { HelpCircle } from 'lucide-react';
import { useWindowStore, WindowState } from '@/store/windowStore';
import { getExplanation, isSystemFile } from '@/lib/explanations';
import { ExplanationTooltip } from './ExplanationTooltip';

interface DesktopWindowProps {
  window: WindowState;
  children: ReactNode;
}

/**
 * Mac-style floating window with traffic light buttons.
 * 
 * Core Apps (Finder, Calendar, etc.) are ONLY windows on the Desktop.
 * They do NOT have routes - the Desktop IS the OS.
 * 
 * - Red button: Close window
 * - Yellow button: Minimize (currently closes)
 * - Green button: Toggle maximize (fills viewport vs. original size)
 */
export function DesktopWindow({ window: win, children }: DesktopWindowProps) {
  const { closeWindow, focusWindow, moveWindow, resizeWindow, minimizeWindow, getZIndex } = useWindowStore();
  
  // Track if window is maximized and store original dimensions
  const [isMaximized, setIsMaximized] = useState(false);
  const [originalBounds, setOriginalBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  
  // Explanation tooltip state
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationAnchor, setExplanationAnchor] = useState<DOMRect | undefined>();
  
  // Check if this window shows a system file that has an explanation
  const explanation = useMemo(() => {
    if (!win.filePath) return undefined;
    const fileName = win.filePath.split('/').pop() || '';
    if (isSystemFile(fileName)) {
      return getExplanation(`file:${fileName}`);
    }
    return undefined;
  }, [win.filePath]);
  
  const handleShowExplanation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const button = e.currentTarget as HTMLElement;
    setExplanationAnchor(button.getBoundingClientRect());
    setShowExplanation(true);
  }, []);
  
  const handleAskChief = useCallback(() => {
    // Dispatch event for chat panel
    window.dispatchEvent(new CustomEvent('ask-chief', {
      detail: {
        path: win.filePath,
        itemName: explanation?.title || win.title,
      }
    }));
    setShowExplanation(false);
  }, [win.filePath, win.title, explanation]);

  const handleDragStop = useCallback(
    (_e: unknown, d: { x: number; y: number }) => {
      // If maximized and user drags, unmaximize
      if (isMaximized) {
        setIsMaximized(false);
      }
      moveWindow(win.id, d.x, d.y);
    },
    [win.id, moveWindow, isMaximized]
  );

  const handleResizeStop = useCallback(
    (
      _e: unknown,
      _dir: unknown,
      ref: HTMLElement,
      _delta: unknown,
      position: { x: number; y: number }
    ) => {
      // If maximized and user resizes, unmaximize
      if (isMaximized) {
        setIsMaximized(false);
      }
      resizeWindow(win.id, ref.offsetWidth, ref.offsetHeight);
      moveWindow(win.id, position.x, position.y);
    },
    [win.id, resizeWindow, moveWindow, isMaximized]
  );

  const handleClick = useCallback(() => {
    focusWindow(win.id);
  }, [win.id, focusWindow]);

  const handleMaximize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isMaximized && originalBounds) {
      // Restore to original size
      moveWindow(win.id, originalBounds.x, originalBounds.y);
      resizeWindow(win.id, originalBounds.width, originalBounds.height);
      setIsMaximized(false);
      setOriginalBounds(null);
    } else {
      // Save current bounds and maximize
      setOriginalBounds({ x: win.x, y: win.y, width: win.width, height: win.height });
      
      // Get Desktop bounds (accounting for menubar and dock)
      // Menubar is ~32px, dock area is ~80px from bottom
      const maxWidth = window.innerWidth - 40; // 20px padding on each side
      const maxHeight = window.innerHeight - 130; // Menubar + dock + padding
      
      moveWindow(win.id, 20, 40);
      resizeWindow(win.id, maxWidth, maxHeight);
      setIsMaximized(true);
    }
  }, [isMaximized, originalBounds, win, moveWindow, resizeWindow]);

  const zIndex = getZIndex(win.id);

  if (win.minimized) {
    return null; // For now, just hide minimized windows
  }

  return (
    <Rnd
      position={{ x: win.x, y: win.y }}
      size={{ width: win.width, height: win.height }}
      minWidth={300}
      minHeight={200}
      bounds="parent"
      dragHandleClassName="window-drag-handle"
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      onMouseDown={handleClick}
      style={{ zIndex }}
      className="absolute"
      // Disable drag/resize when maximized for smoother UX
      disableDragging={isMaximized}
      enableResizing={!isMaximized}
    >
      <div
        className="
          flex flex-col h-full rounded-xl overflow-hidden
          bg-[var(--surface-raised)] border border-[var(--border-default)]
          shadow-2xl shadow-black/20
        "
        onClick={handleClick}
      >
        {/* Title Bar with Traffic Lights */}
        <div className="window-drag-handle flex items-center h-8 px-3 bg-[var(--surface-base)] border-b border-[var(--border-subtle)] cursor-move select-none">
          {/* Traffic Lights (Mac style - LEFT side) */}
          <div className="flex items-center gap-2 mr-4">
            {/* Close - Red */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeWindow(win.id);
              }}
              className="
                w-3 h-3 rounded-full bg-[#ff5f57]
                hover:brightness-110 transition-all
                flex items-center justify-center group
              "
              title="Close"
            >
              <span className="text-[8px] text-black/60 opacity-0 group-hover:opacity-100">
                ×
              </span>
            </button>

            {/* Minimize - Yellow */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                minimizeWindow(win.id);
              }}
              className="
                w-3 h-3 rounded-full bg-[#febc2e]
                hover:brightness-110 transition-all
                flex items-center justify-center group
              "
              title="Minimize to Dock"
            >
              <span className="text-[8px] text-black/60 opacity-0 group-hover:opacity-100">
                −
              </span>
            </button>

            {/* Maximize - Green */}
            <button
              onClick={handleMaximize}
              className="
                w-3 h-3 rounded-full bg-[#28c840]
                hover:brightness-110 transition-all
                flex items-center justify-center group
              "
              title={isMaximized ? "Restore" : "Maximize"}
            >
              <span className="text-[8px] text-black/60 opacity-0 group-hover:opacity-100">
                {isMaximized ? '−' : '+'}
              </span>
            </button>
          </div>

          {/* Title */}
          <div className="flex-1 text-center">
            <span className="text-xs text-[var(--text-secondary)] font-medium truncate">
              {win.title}
            </span>
          </div>

          {/* Help button for system files */}
          <div className="w-12 flex justify-end">
            {explanation && (
              <button
                onClick={handleShowExplanation}
                className="
                  w-5 h-5 rounded-full
                  bg-blue-500 hover:bg-blue-600
                  flex items-center justify-center
                  transition-colors
                "
                title="What is this file?"
              >
                <HelpCircle className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        </div>
        
        {/* Explanation Tooltip */}
        {showExplanation && explanation && (
          <ExplanationTooltip
            explanation={explanation}
            anchorRect={explanationAnchor}
            onClose={() => setShowExplanation(false)}
            onAskChief={handleAskChief}
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-[var(--surface-raised)]">
          {children}
        </div>
      </div>
    </Rnd>
  );
}

export default DesktopWindow;
