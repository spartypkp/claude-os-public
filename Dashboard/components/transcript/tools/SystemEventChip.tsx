'use client';

/**
 * SystemEventChip — Full-width muted bar for lifecycle/system events.
 *
 * Visually distinct from ToolChip (inline colored chips for "Claude doing work").
 * System events are: status updates, session lifecycle (reset/done), team orchestration,
 * skill invocations, plan mode, etc.
 *
 * Expandable only when a custom expanded view exists (e.g., AskUserQuestion, team).
 */

import { ChevronRight, Loader2 } from 'lucide-react';
import { getExpandedView, DefaultExpanded } from './ExpandedViews';
import { getToolOneLiner, parseToolInput, parseToolResult } from './registry';

interface SystemEventChipProps {
  toolName: string;
  formattedName: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  toolInput?: Record<string, unknown>;
  resultContent?: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SystemEventChip({
  toolName,
  formattedName,
  icon: Icon,
  color,
  toolInput,
  resultContent,
  isExpanded,
  onToggle,
}: SystemEventChipProps) {
  const isRunning = !resultContent;
  const isInteractivePrompt = formattedName === 'AskUserQuestion' && isRunning;

  // Get smart one-liner from registry
  const { text: oneLiner, showToolName, chipLabel } = getToolOneLiner(formattedName, toolInput, resultContent);
  const displayLabel = chipLabel || formattedName;

  // Check if there's a custom expanded view (not the default fallback)
  const ExpandedView = getExpandedView(formattedName);
  const hasCustomExpanded = ExpandedView !== DefaultExpanded;

  // Parse input/result for expanded view
  const parsedInput = parseToolInput(formattedName, toolInput);
  const parsedResult = parseToolResult(resultContent);

  const handleClick = () => {
    if (hasCustomExpanded) {
      onToggle();
    }
  };

  return (
    <div className="my-1.5">
      {/* Full-width muted bar — highlighted when it's an active interactive prompt */}
      <button
        onClick={handleClick}
        disabled={!hasCustomExpanded}
        className={`
          w-full flex items-center gap-2 py-1.5 px-3 rounded-lg text-left
          transition-all duration-150
          ${isInteractivePrompt
            ? 'bg-[var(--color-warning)]/8 ring-1 ring-[var(--color-warning)]/30'
            : isExpanded
              ? 'bg-[var(--surface-accent)] ring-1 ring-[var(--border-default)]'
              : 'bg-[var(--surface-subtle)] hover:bg-[var(--surface-accent)]'
          }
          ${hasCustomExpanded ? 'cursor-pointer' : 'cursor-default'}
        `}
      >
        {/* Icon */}
        <span
          className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
          style={{ color }}
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Icon className="w-3.5 h-3.5" />
          )}
        </span>

        {/* One-liner with optional tool name prefix */}
        <span className="text-[11px] text-[var(--text-muted)] truncate flex-1">
          {showToolName && oneLiner ? (
            <>
              <span className="uppercase text-[10px] tracking-wide opacity-70">{displayLabel}</span>
              {': '}
              {oneLiner}
            </>
          ) : (
            oneLiner || formattedName
          )}
        </span>

        {/* Expand chevron (only if has custom expanded view) */}
        {hasCustomExpanded && (
          <ChevronRight
            className={`w-3 h-3 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        )}
      </button>

      {/* Expanded view */}
      {isExpanded && hasCustomExpanded && (
        <div className="mt-1.5 ml-2 pl-3 border-l-2 border-[var(--border-subtle)]">
          <ExpandedView
            toolName={toolName}
            formattedName={formattedName}
            input={parsedInput}
            result={parsedResult}
            rawInput={toolInput}
            rawResult={resultContent}
          />
        </div>
      )}
    </div>
  );
}

export default SystemEventChip;
