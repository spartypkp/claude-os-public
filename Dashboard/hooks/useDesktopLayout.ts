'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'desktop-layout-v1';

// Layout item type matching react-grid-layout expectations
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export interface WidgetState {
  id: string;
  type: 'priorities' | 'calendar';
  collapsed: boolean;
  pinned: boolean;
}

export interface DesktopLayoutState {
  version: number;
  widgets: WidgetState[];
  gridLayout: LayoutItem[];
  lastModified: string;
}

const DEFAULT_LAYOUT: DesktopLayoutState = {
  version: 1,
  widgets: [
    { id: 'priorities', type: 'priorities', collapsed: false, pinned: false },
    { id: 'calendar', type: 'calendar', collapsed: false, pinned: false },
  ],
  gridLayout: [
    { i: 'priorities', x: 0, y: 0, w: 2, h: 4, minW: 2, minH: 2 },
    { i: 'calendar', x: 0, y: 4, w: 2, h: 4, minW: 2, minH: 2 },
  ],
  lastModified: new Date().toISOString(),
};

export function useDesktopLayout() {
  const [layout, setLayout] = useState<DesktopLayoutState>(DEFAULT_LAYOUT);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DesktopLayoutState;
        // Validate version
        if (parsed.version === 1) {
          setLayout(parsed);
        }
      }
    } catch (err) {
      console.error('Failed to load desktop layout:', err);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage (debounced)
  useEffect(() => {
    if (!isLoaded) return;

    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...layout,
          lastModified: new Date().toISOString(),
        }));
      } catch (err) {
        console.error('Failed to save desktop layout:', err);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [layout, isLoaded]);

  // Update grid layout (from react-grid-layout wrapper)
  const updateGridLayout = useCallback((newLayout: LayoutItem[]) => {
    setLayout(prev => ({
      ...prev,
      gridLayout: newLayout,
    }));
  }, []);

  // Toggle widget collapse
  const toggleWidgetCollapse = useCallback((widgetId: string) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId ? { ...w, collapsed: !w.collapsed } : w
      ),
    }));
  }, []);

  // Toggle widget pin
  const toggleWidgetPin = useCallback((widgetId: string) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId ? { ...w, pinned: !w.pinned } : w
      ),
    }));
  }, []);

  // Remove widget
  const removeWidget = useCallback((widgetId: string) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.filter(w => w.id !== widgetId),
      gridLayout: prev.gridLayout.filter(l => l.i !== widgetId),
    }));
  }, []);

  // Add widget back
  const addWidget = useCallback((widgetType: 'priorities' | 'calendar') => {
    const existingWidget = layout.widgets.find(w => w.type === widgetType);
    if (existingWidget) return; // Already exists

    const widgetId = widgetType;
    const defaultLayout = widgetType === 'priorities'
      ? { i: widgetId, x: 0, y: 0, w: 2, h: 4, minW: 2, minH: 2 }
      : { i: widgetId, x: 0, y: 4, w: 2, h: 4, minW: 2, minH: 2 };

    setLayout(prev => ({
      ...prev,
      widgets: [...prev.widgets, { id: widgetId, type: widgetType, collapsed: false, pinned: false }],
      gridLayout: [...prev.gridLayout, defaultLayout],
    }));
  }, [layout.widgets]);

  // Reset to default
  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
  }, []);

  // Get widget state by ID
  const getWidgetState = useCallback((widgetId: string): WidgetState | undefined => {
    return layout.widgets.find(w => w.id === widgetId);
  }, [layout.widgets]);

  return {
    layout,
    isLoaded,
    updateGridLayout,
    toggleWidgetCollapse,
    toggleWidgetPin,
    removeWidget,
    addWidget,
    resetLayout,
    getWidgetState,
  };
}

export default useDesktopLayout;
