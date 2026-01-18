'use client';

import { ReactNode } from 'react';
import {
  Pin,
  X,
  GripVertical,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
}

interface DesktopWidgetProps {
  config: WidgetConfig;
  collapsed?: boolean;
  pinned?: boolean;
  onCollapse?: () => void;
  onClose?: () => void;
  onPin?: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DesktopWidget({
  config,
  collapsed = false,
  pinned = false,
  onCollapse,
  onClose,
  onPin,
  headerExtra,
  children,
  className = '',
}: DesktopWidgetProps) {
  const Icon = config.icon;

  return (
    <div
      className={`
        flex flex-col rounded-xl border border-[var(--border-subtle)]
        bg-[var(--surface-raised)] shadow-sm overflow-hidden
        transition-all duration-200
        ${collapsed ? 'h-auto' : 'h-full'}
        ${className}
      `}
    >
      {/* Header - drag handle */}
      <div className="widget-header flex items-center gap-2 px-3 py-2 bg-[var(--surface-muted)] border-b border-[var(--border-subtle)] cursor-move select-none">
        {/* Drag handle indicator */}
        <GripVertical className="w-3 h-3 text-[var(--text-muted)] opacity-50" />

        {/* Icon */}
        <Icon className="w-4 h-4 text-[var(--color-claude)]" />

        {/* Title */}
        <span className="flex-1 text-xs font-medium text-[var(--text-secondary)]">
          {config.title}
        </span>

        {/* Header extra (like counts) */}
        {headerExtra}

        {/* Controls */}
        <div className="flex items-center gap-0.5">
          {onPin && (
            <button
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              className={`p-1 rounded transition-colors ${
                pinned
                  ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
              }`}
              title={pinned ? 'Unpin' : 'Pin position'}
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
          {onCollapse && (
            <button
              onClick={(e) => { e.stopPropagation(); onCollapse(); }}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </button>
          )}
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Close widget"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      )}

      {/* Collapsed preview */}
      {collapsed && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--text-muted)] bg-[var(--surface-base)]">
          Click to expand
        </div>
      )}
    </div>
  );
}

export default DesktopWidget;
