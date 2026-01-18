'use client';

import { useState, useRef, useEffect } from 'react';

interface SidebarTooltipProps {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SidebarTooltip({ label, children, disabled = false }: SidebarTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const showTooltip = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({ top: rect.top + rect.height / 2 });
      }
      setIsVisible(true);
    }, 200); // Small delay before showing
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={triggerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className="relative"
    >
      {children}
      {isVisible && (
        <div
          className="
            fixed left-16 z-50
            px-2.5 py-1.5 rounded-md
            bg-[var(--surface-base)] border border-[var(--border-strong)]
            shadow-lg shadow-black/10
            text-[12px] text-[var(--text-primary)] font-medium
            whitespace-nowrap
            animate-in fade-in slide-in-from-left-1 duration-150
          "
          style={{ top: position.top, transform: 'translateY(-50%)' }}
        >
          {label}
          {/* Arrow pointing left */}
          <div
            className="
              absolute -left-1.5 top-1/2 -translate-y-1/2
              w-0 h-0
              border-t-[6px] border-t-transparent
              border-r-[6px] border-r-[var(--border-strong)]
              border-b-[6px] border-b-transparent
            "
          />
          <div
            className="
              absolute -left-[5px] top-1/2 -translate-y-1/2
              w-0 h-0
              border-t-[5px] border-t-transparent
              border-r-[5px] border-r-[var(--surface-base)]
              border-b-[5px] border-b-transparent
            "
          />
        </div>
      )}
    </div>
  );
}
