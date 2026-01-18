'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useHud } from '@/components/context/HudContext';
import { HudCard } from './HudCard';

// The actual panel content - separated to prevent conditional hook issues
function HudPanelContent() {
  const {
    items,
    currentIndex,
    close,
    dismiss,
    dismissAll,
    goNext,
    goPrev,
    goToIndex,
  } = useHud();

  const currentItem = items[currentIndex];
  const totalItems = items.length;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      close();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end p-6"
    >
      {/* Panel container */}
      <div
        className="w-full max-w-xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card content */}
        {currentItem && (
          <HudCard
            item={currentItem}
            onDismiss={() => dismiss(currentItem.id)}
          />
        )}

        {/* Navigation bar - only show if multiple items */}
        {totalItems > 1 && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center transition-all
                ${currentIndex === 0
                  ? 'text-[var(--text-disabled)] cursor-not-allowed'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                }
              `}
              title="Previous (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1.5">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => goToIndex(index)}
                  className={`
                    w-2 h-2 rounded-full transition-all
                    ${index === currentIndex
                      ? 'bg-[var(--color-primary)] w-4'
                      : 'bg-[var(--text-disabled)] hover:bg-[var(--text-muted)]'
                    }
                  `}
                  title={`Go to item ${index + 1}`}
                />
              ))}
            </div>

            <button
              onClick={goNext}
              disabled={currentIndex === totalItems - 1}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center transition-all
                ${currentIndex === totalItems - 1
                  ? 'text-[var(--text-disabled)] cursor-not-allowed'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                }
              `}
              title="Next (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between px-2">
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {currentIndex + 1} of {totalItems}
          </span>

          {totalItems > 1 && (
            <button
              onClick={dismissAll}
              className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <X className="w-3 h-3" />
              Dismiss all
            </button>
          )}

          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
            <kbd className="kbd text-[10px]">`</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Portal wrapper component - handles client-side mounting
export function HudPanel() {
  const { items, isOpen } = useHud();
  const [mounted, setMounted] = useState(false);

  // Only render on client after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldShow = isOpen && items.length > 0;

  // Don't render anything on server or if not showing
  if (!mounted || !shouldShow) {
    return null;
  }

  // Use React Portal to render at document.body level
  // This isolates the overlay from the component tree and prevents
  // React reconciliation issues with parent re-renders
  return createPortal(
    <HudPanelContent />,
    document.body
  );
}

export default HudPanel;
