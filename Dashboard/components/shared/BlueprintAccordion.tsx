'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarTooltip } from '@/components/core/SidebarTooltip';
import type { AppBadge } from '@/lib/appRegistry';

export interface BlueprintView {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  badgeType?: 'info' | 'warning' | 'error';
}

export interface Blueprint {
  id: string;
  name: string;
  icon: React.ReactNode;
  views: BlueprintView[];
  status?: {
    label: string;
    badge?: number;
    badgeType?: 'info' | 'warning' | 'error';
  };
  /** Optional async function to fetch dynamic badge */
  getBadge?: () => Promise<AppBadge> | AppBadge;
}

interface BlueprintAccordionProps {
  blueprint: Blueprint;
  expanded: boolean;
  onToggle: () => void;
  isCollapsed?: boolean;
}

export function BlueprintAccordion({
  blueprint,
  expanded,
  onToggle,
  isCollapsed = false,
}: BlueprintAccordionProps) {
  const pathname = usePathname();
  const [dynamicBadge, setDynamicBadge] = useState<AppBadge | null>(null);

  // Fetch dynamic badge if getBadge is provided
  useEffect(() => {
    if (blueprint.getBadge) {
      const fetchBadge = async () => {
        try {
          const badge = await blueprint.getBadge!();
          setDynamicBadge(badge);
        } catch {
          // Ignore badge fetch errors
        }
      };
      fetchBadge();
    }
  }, [blueprint.getBadge]);

  // Use dynamic badge if available, otherwise fall back to static status
  const statusLabel = dynamicBadge?.label || blueprint.status?.label || '';

  // Check if any view in this blueprint is active
  const isAnyViewActive = blueprint.views.some(view =>
    pathname === view.href || pathname?.startsWith(view.href + '/')
  );

  if (isCollapsed) {
    // Collapsed: show just the blueprint icon with tooltip
    return (
      <SidebarTooltip label={blueprint.name}>
        <button
          onClick={onToggle}
          className={`
            w-full flex items-center justify-center p-2 rounded
            transition-colors duration-75
            ${isAnyViewActive
              ? 'bg-[var(--surface-accent)] text-[var(--color-claude)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
            }
          `}
        >
          <span className="flex-shrink-0">{blueprint.icon}</span>
          {blueprint.status?.badge && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--color-warning)]" />
          )}
        </button>
      </SidebarTooltip>
    );
  }

  return (
    <div className="mb-1">
      {/* Blueprint Header - clickable accordion toggle */}
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center gap-2 px-3 py-2 rounded-lg
          text-sm font-medium transition-colors
          ${isAnyViewActive
            ? 'text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }
          hover:bg-[var(--surface-muted)]/50
        `}
      >
        {/* Expand/Collapse indicator */}
        <span className="text-[var(--text-muted)]">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>

        {/* Icon */}
        <span className={isAnyViewActive ? 'text-[var(--color-claude)]' : 'text-[var(--color-claude)]/70'}>
          {blueprint.icon}
        </span>

        {/* Name */}
        <span className="flex-1 text-left text-[13px]">{blueprint.name}</span>

        {/* Status badge */}
        {statusLabel && (
          <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
            {statusLabel}
          </span>
        )}
      </button>

      {/* Expanded Views */}
      {expanded && (
        <div className="ml-3 pl-3 border-l border-[var(--border-subtle)]">
          {blueprint.views.map((view) => {
            const isActive = pathname === view.href ||
              (view.id !== 'overview' && pathname?.startsWith(view.href + '/'));

            return (
              <Link
                key={view.id}
                href={view.href}
                className={`
                  flex items-center gap-2 px-2 py-1.5 rounded text-[12px]
                  transition-colors duration-75
                  ${isActive
                    ? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                <span className={`flex-shrink-0 ${isActive ? 'text-[var(--color-claude)]' : 'text-[var(--color-claude)]/50'}`}>
                  {view.icon}
                </span>
                <span className="flex-1">{view.label}</span>
                {view.badge !== undefined && view.badge > 0 && (
                  <span className={`
                    text-[9px] min-w-[16px] h-[16px] flex items-center justify-center rounded-full font-medium tabular-nums
                    ${view.badgeType === 'warning'
                      ? 'bg-amber-500/20 text-amber-500'
                      : view.badgeType === 'error'
                      ? 'bg-red-500/20 text-red-500'
                      : 'bg-[var(--color-claude)]/20 text-[var(--color-claude)]'
                    }
                  `}>
                    {view.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BlueprintAccordion;
