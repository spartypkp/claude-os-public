'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface HelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      { keys: ['1'], description: 'Desktop' },
      { keys: ['2'], description: 'Calendar' },
      { keys: ['3'], description: 'Claude' },
      { keys: ['4'], description: 'System' },
    ],
  },
  {
    category: 'Memory View',
    items: [
      { keys: ['t'], description: 'Memory tiers' },
      { keys: ['f'], description: 'Friction' },
    ],
  },
  {
    category: 'Quick Actions',
    items: [
      { keys: ['⌘', 'K'], description: 'Command palette' },
      { keys: ['c'], description: 'Specialists' },
      { keys: ['?'], description: 'Keyboard shortcuts' },
      { keys: ['`'], description: 'Toggle HUD' },
      { keys: ['Esc'], description: 'Close panels/modals' },
    ],
  },
  {
    category: 'HUD',
    items: [
      { keys: ['`'], description: 'Toggle HUD panel' },
      { keys: ['←'], description: 'Previous item' },
      { keys: ['→'], description: 'Next item' },
      { keys: ['Esc'], description: 'Close HUD' },
    ],
  },
  {
    category: 'List Navigation',
    items: [
      { keys: ['j'], description: 'Move down' },
      { keys: ['k'], description: 'Move up' },
      { keys: ['Enter'], description: 'Select item' },
      { keys: ['/'], description: 'Focus search' },
    ],
  },
  {
    category: 'Desktop View',
    items: [
      { keys: ['j'], description: 'Scroll down (expanded)' },
      { keys: ['k'], description: 'Scroll up (expanded)' },
      { keys: ['g', 'g'], description: 'Go to top' },
      { keys: ['G'], description: 'Go to bottom' },
      { keys: ['Esc'], description: 'Close expanded file' },
    ],
  },
  {
    category: 'Activity View',
    items: [
      { keys: ['j'], description: 'Move down' },
      { keys: ['k'], description: 'Move up' },
      { keys: ['a'], description: 'Acknowledge task' },
      { keys: ['s'], description: 'Snooze task' },
      { keys: ['x'], description: 'Cancel task' },
    ],
  },
];

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="
        fixed inset-0 z-[var(--z-modal)]
        bg-black/60 backdrop-blur-sm
        flex items-center justify-center
        animate-fade-in
      "
    >
      <div
        className="
          bg-[var(--surface-overlay)] border border-[var(--border-default)]
          rounded-xl shadow-2xl
          w-full max-w-2xl max-h-[80vh]
          overflow-hidden
          animate-scale-in
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-64px)]">
          <div className="grid grid-cols-2 gap-8">
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-[var(--text-secondary)]">
                        {item.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((key, j) => (
                          <span key={j}>
                            <kbd className="kbd">{key}</kbd>
                            {j < item.keys.length - 1 && (
                              <span className="text-xs text-[var(--text-muted)] mx-0.5">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <p className="text-xs text-[var(--text-muted)]">
            Press <kbd className="kbd">?</kbd> to toggle this help overlay
          </p>
        </div>
      </div>
    </div>
  );
}

export default HelpOverlay;
