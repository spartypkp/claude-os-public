'use client';

import {
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Terminal,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getToolOneLiner, parseToolInput, parseToolResult } from './registry';
import { getExpandedView } from './ExpandedViews';
import { useOpenInDesktop, isViewableFile } from './ClickableRef';
import { isErrorResult } from './shared';

// File operations that should click-to-open (not expand)
const FILE_OPERATION_TOOLS = ['Read', 'Write', 'Edit', 'read_file', 'write', 'edit'];
const SEARCH_TOOLS = ['Grep', 'Glob', 'grep', 'glob', 'codebase_search', 'file_search'];
const CONTACT_TOOLS = ['contact', 'contact_search', 'contact_view', 'contact_update'];
const CALENDAR_TOOLS = ['calendar', 'calendar_create', 'calendar_list', 'calendar_delete', 'local_calendar'];

/** Uniform agent color — all agents share this */
export const AGENT_COLOR = 'var(--color-info)';

/** Icon map for subagent types */
export const AGENT_ICONS: Record<string, LucideIcon> = {
  'Bash': Terminal,
  'general-purpose': Zap,
  'Explore': Search,
  'Plan': Workflow,
  'web-research': Globe,
};

/** Agent category — determines badges and behavior */
export type AgentCategory = 'background' | 'foreground' | 'system';
export const AGENT_CATEGORIES: Record<string, AgentCategory> = {
  // Background agents (no MCP)
  'Explore': 'background',
  'web-research': 'background',
  // System built-ins
  'general-purpose': 'system',
  'Bash': 'system',
  'Plan': 'system',
};

interface ToolChipProps {
  toolName: string;
  formattedName: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  toolInput?: Record<string, unknown>;
  resultContent?: string;
  isExpanded: boolean;
  onToggle: () => void;
  /** Compact mode — smaller sizes for embedding in MiniTranscript */
  compact?: boolean;
}

/**
 * ToolChip - Clean, minimal tool display
 *
 * Routes to one of two layouts:
 * - Subagent chip: agent-type pill + model badge + description
 * - Standard chip: icon square + one-liner + optional tool name badge
 *
 * File tools (Read/Write/Edit) click-to-open instead of expanding.
 */
export function ToolChip({
  toolName,
  formattedName,
  icon: Icon,
  color,
  toolInput,
  resultContent,
  isExpanded,
  onToggle,
  compact = false,
}: ToolChipProps) {
  const { openFile, openInFinder, openContact, openCalendar } = useOpenInDesktop();

  const isRunning = resultContent === undefined || resultContent === null;
  const hasError = isErrorResult(resultContent);

  // Get smart one-liner from registry
  const { text: oneLiner, showToolName, chipLabel } = getToolOneLiner(formattedName, toolInput, resultContent);
  const displayLabel = chipLabel || formattedName;

  // Parse input/result for expanded view
  const parsedInput = parseToolInput(formattedName, toolInput);
  const parsedResult = parseToolResult(resultContent);

  // Get appropriate expanded view component
  const ExpandedView = getExpandedView(formattedName);

  // Determine tool type
  const isFileOperation = FILE_OPERATION_TOOLS.includes(formattedName) || FILE_OPERATION_TOOLS.includes(toolName);
  const isSearchTool = SEARCH_TOOLS.includes(formattedName) || SEARCH_TOOLS.includes(toolName);
  const isContactTool = CONTACT_TOOLS.some(t => formattedName.includes(t) || toolName.includes(t));
  const isCalendarTool = CALENDAR_TOOLS.some(t => formattedName.includes(t) || toolName.includes(t));

  // Extract file path from input
  const filePath = parsedInput.filePath ||
                   parsedInput.path ||
                   (toolInput?.file_path as string) ||
                   (toolInput?.target_file as string) ||
                   (toolInput?.path as string);

  // File operations click-to-open instead of expanding
  const canClickToOpen = !isRunning && !hasError && isFileOperation && filePath;

  // Other tools can show "open" button
  const canShowOpenButton = !isRunning && !hasError && !isFileOperation && (
    (isSearchTool && filePath) ||
    isContactTool ||
    isCalendarTool
  );

  // Main button click handler
  const handleMainClick = () => {
    if (canClickToOpen) {
      openFile(filePath, !isViewableFile(filePath));
    } else if (isFileOperation) {
      return;
    } else {
      onToggle();
    }
  };

  // Handle open action for search/contact/calendar tools
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSearchTool && filePath) {
      openInFinder(filePath.split('/').slice(0, -1).join('/'));
    } else if (isContactTool) {
      const contactName = parsedInput.contactName || parsedInput.contactQuery;
      openContact(contactName);
    } else if (isCalendarTool) {
      openCalendar();
    }
  };

  // Shared expanded view rendering
  const expandedView = isExpanded && !isFileOperation && (
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
  );

  // ─── Compact mode: smaller sizes, no expanded view, for MiniTranscript ─
  if (compact) {
    return (
      <div className="my-0.5">
        <button
          onClick={handleMainClick}
          className={`group inline-flex items-center gap-1 py-0.5 px-1.5 rounded text-left transition-all duration-150 hover:bg-[var(--surface-accent)] ${canClickToOpen ? 'cursor-pointer' : ''} ${hasError ? 'bg-[var(--color-error)]/5' : ''}`}
          title={canClickToOpen ? `Open ${filePath}` : undefined}
        >
          <span
            className="flex items-center justify-center w-3.5 h-3.5 rounded flex-shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
          >
            {isRunning ? <Loader2 className="w-2 h-2 animate-spin" /> : <Icon className="w-2 h-2" />}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] truncate max-w-[280px] font-mono">
            {showToolName && oneLiner ? (
              <>
                <span className="text-[var(--text-muted)] uppercase text-[9px] tracking-wide">{displayLabel}</span>
                {': '}
                {oneLiner}
              </>
            ) : (
              oneLiner || formattedName
            )}
          </span>
          {hasError && <X className="w-2 h-2 text-[var(--color-error)] flex-shrink-0" />}
          {isFileOperation && !isRunning && (
            <ExternalLink className="w-2 h-2 text-[var(--text-muted)] group-hover:text-[var(--color-claude)] flex-shrink-0" />
          )}
        </button>
      </div>
    );
  }

  // ─── Standard chip: icon + one-liner ───────────────────────────────────
  const chipClasses = `
    group inline-flex items-center gap-1.5 py-1 px-2 rounded-md text-left
    transition-all duration-150
    ${isExpanded
      ? 'bg-[var(--surface-accent)] ring-1 ring-[var(--border-default)]'
      : 'bg-[var(--surface-base)] hover:bg-[var(--surface-accent)]'
    }
    ${hasError ? 'ring-1 ring-[var(--color-error)]/50 bg-[var(--color-error)]/5' : ''}
  `;

  return (
    <div className="my-1">
      <button
        onClick={handleMainClick}
        className={`${chipClasses} ${canClickToOpen ? 'cursor-pointer' : ''}`}
        title={canClickToOpen ? `Open ${filePath}` : undefined}
      >
        <span
          className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
        >
          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
        </span>
        <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[350px] font-mono">
          {showToolName && oneLiner ? (
            <>
              <span className="text-[var(--text-muted)] uppercase text-[10px] tracking-wide">{displayLabel}</span>
              {': '}
              {oneLiner}
            </>
          ) : (
            oneLiner || formattedName
          )}
        </span>
        {hasError && <X className="w-3 h-3 text-[var(--color-error)] flex-shrink-0" />}
        {canShowOpenButton && (
          <span
            onClick={handleOpen}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--surface-muted)] rounded transition-opacity"
            title={isSearchTool ? 'Show in Finder' : isContactTool ? 'Open in Contacts' : isCalendarTool ? 'Open in Calendar' : 'Open'}
          >
            <ExternalLink className="w-3 h-3 text-[var(--text-muted)] hover:text-[var(--color-claude)]" />
          </span>
        )}
        {isFileOperation && !isRunning && (
          <ExternalLink className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--color-claude)] flex-shrink-0" />
        )}
      </button>
      {expandedView}
    </div>
  );
}

export default ToolChip;
