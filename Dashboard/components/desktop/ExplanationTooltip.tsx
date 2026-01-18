'use client';

import { Explanation } from '@/lib/explanations';
import { HelpCircle, MessageCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ExplanationTooltipProps {
  explanation: Explanation;
  /** Position to show tooltip near */
  anchorRect?: DOMRect;
  /** Callback when "Ask Chief" is clicked */
  onAskChief?: () => void;
  /** Callback to close the tooltip */
  onClose: () => void;
}

export function ExplanationTooltip({
  explanation,
  anchorRect,
  onAskChief,
  onClose,
}: ExplanationTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Position tooltip near anchor, avoiding screen edges
  useEffect(() => {
    if (!anchorRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;

    let x = anchorRect.right + 8;
    let y = anchorRect.top;

    // If would go off right edge, show on left
    if (x + tooltipRect.width > window.innerWidth - padding) {
      x = anchorRect.left - tooltipRect.width - 8;
    }

    // If would go off bottom, move up
    if (y + tooltipRect.height > window.innerHeight - padding) {
      y = window.innerHeight - tooltipRect.height - padding;
    }

    // If would go off top, move down
    if (y < padding) {
      y = padding;
    }

    setPosition({ x, y });
  }, [anchorRect]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={tooltipRef}
      className="
        fixed z-[10000] w-80
        bg-white dark:bg-[#1e1e22]
        border border-gray-200 dark:border-white/10
        rounded-xl shadow-2xl shadow-black/20 dark:shadow-black/50
        overflow-hidden
        animate-in fade-in slide-in-from-left-2 duration-200
      "
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xl">{explanation.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {explanation.title}
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {explanation.category}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      <div className="px-4 py-3">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {explanation.description}
        </p>
      </div>

      {/* Details */}
      {explanation.details && explanation.details.length > 0 && (
        <div className="px-4 pb-3">
          <ul className="space-y-1">
            {explanation.details.map((detail, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
              >
                <span className="text-gray-400 dark:text-gray-500 mt-0.5">•</span>
                {detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Shortcuts */}
      {explanation.shortcuts && explanation.shortcuts.length > 0 && (
        <div className="px-4 pb-3 pt-2 border-t border-gray-100 dark:border-white/5">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Shortcuts
          </p>
          <div className="space-y-1">
            {explanation.shortcuts.map((shortcut, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">{shortcut.action}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 font-mono text-[10px]">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ask Chief button */}
      {onAskChief && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
          <button
            onClick={onAskChief}
            className="
              w-full flex items-center justify-center gap-2
              px-3 py-2 rounded-lg
              bg-[#DA7756] hover:bg-[#C15F3C]
              text-white text-sm font-medium
              transition-colors
            "
          >
            <MessageCircle className="w-4 h-4" />
            Ask Chief to explain more
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Small question mark badge that indicates an item has an explanation.
 * Shows on hover, click opens the full tooltip.
 */
interface QuestionMarkBadgeProps {
  explanation: Explanation;
  /** Additional class names */
  className?: string;
  /** Position: where to show the badge relative to parent */
  position?: 'top-right' | 'bottom-right';
  /** Callback when "Ask Chief" is clicked */
  onAskChief?: () => void;
}

export function QuestionMarkBadge({
  explanation,
  className = '',
  position = 'top-right',
  onAskChief,
}: QuestionMarkBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | undefined>();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (badgeRef.current) {
      setAnchorRect(badgeRef.current.getBoundingClientRect());
    }
    setShowTooltip(true);
  }, []);

  const positionClasses = {
    'top-right': '-top-1 -right-1',
    'bottom-right': '-bottom-1 -right-1',
  };

  return (
    <>
      <button
        ref={badgeRef}
        onClick={handleClick}
        className={`
          absolute ${positionClasses[position]}
          w-4 h-4 rounded-full
          bg-blue-500 hover:bg-blue-600
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-all duration-150
          shadow-sm
          z-10
          ${className}
        `}
        title="Click to learn more"
      >
        <HelpCircle className="w-3 h-3 text-white" />
      </button>

      {showTooltip && (
        <ExplanationTooltip
          explanation={explanation}
          anchorRect={anchorRect}
          onAskChief={onAskChief}
          onClose={() => setShowTooltip(false)}
        />
      )}
    </>
  );
}

export default ExplanationTooltip;

