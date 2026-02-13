'use client';

import { ChevronRight, ExternalLink, Loader2, X, Zap } from 'lucide-react';
import { getToolOneLiner, parseToolInput, parseToolResult } from './registry';
import { getExpandedView } from './ExpandedViews';
import { useOpenInDesktop, isViewableFile } from './ClickableRef';

// File operations that should click-to-open (not expand)
const FILE_OPERATION_TOOLS = ['Read', 'Write', 'Edit', 'read_file', 'write', 'edit'];
const SEARCH_TOOLS = ['Grep', 'Glob', 'grep', 'glob', 'codebase_search', 'file_search'];
const CONTACT_TOOLS = ['contact', 'contact_search', 'contact_view', 'contact_update'];
const CALENDAR_TOOLS = ['calendar', 'calendar_create', 'calendar_list', 'calendar_delete', 'local_calendar'];

// Subagent tools that get the rich chip treatment
const SUBAGENT_TOOLS = ['Task', 'TaskOutput', 'TaskStop'];

/** Color map for subagent types — shared with claude-code expanded views */
export const AGENT_COLORS: Record<string, string> = {
  'Bash': 'var(--color-primary)',
  'general-purpose': '#8b5cf6',
  'Explore': 'var(--color-cyan)',
  'Plan': '#f59e0b',
  'web-research': 'var(--color-success)',
  'test-runner': '#ef4444',
  'error-investigate': '#ef4444',
  'dependency-trace': '#06b6d4',
  'codebase-map': '#3b82f6',
  'context-find': '#06b6d4',
  'recall': '#8b5cf6',
  'file-organize': '#64748b',
  'doc-update': '#64748b',
  'memory-helper': '#f59e0b',
  'contact-updater': '#06b6d4',
  'meeting-prep': '#3b82f6',
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
}: ToolChipProps) {
  const { openFile, openInFinder, openContact, openCalendar } = useOpenInDesktop();

  const isRunning = !resultContent;
  const hasError = resultContent?.toLowerCase().includes('error') ||
                   resultContent?.toLowerCase().includes('failed');

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
  const isSubagent = SUBAGENT_TOOLS.includes(formattedName);

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

  // Shared chip wrapper classes
  const chipClasses = `
    group inline-flex items-center gap-1.5 py-1 px-2 rounded-md text-left
    transition-all duration-150
    ${isExpanded
      ? 'bg-[var(--surface-accent)] ring-1 ring-[var(--border-default)]'
      : 'bg-[var(--surface-base)] hover:bg-[var(--surface-accent)]'
    }
    ${hasError ? 'ring-1 ring-[var(--color-error)]/30' : ''}
  `;

  // ─── Subagent chip: agent-type pill + badges + description ──────────────
  if (isSubagent) {
    const agentType = toolInput?.subagent_type ? String(toolInput.subagent_type) : '';
    const description = toolInput?.description ? String(toolInput.description) : '';
    const model = toolInput?.model ? String(toolInput.model) : '';
    const runInBg = Boolean(toolInput?.run_in_background);
    const agentColor = AGENT_COLORS[agentType] || '#8b5cf6';

    return (
      <div className="my-1">
        <button onClick={onToggle} className={chipClasses}>
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{
              backgroundColor: `color-mix(in srgb, ${agentColor} 15%, transparent)`,
              color: agentColor,
            }}
          >
            {isRunning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
            {agentType || 'Subagent'}
          </span>
          {model && (
            <span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded flex-shrink-0">
              {model}
            </span>
          )}
          {runInBg && (
            <span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded flex-shrink-0">
              bg
            </span>
          )}
          {description && (
            <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[180px]">
              {description}
            </span>
          )}
          {hasError && <X className="w-3 h-3 text-[var(--color-error)] flex-shrink-0" />}
          <ChevronRight className={`w-3 h-3 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
        {expandedView}
      </div>
    );
  }

  // ─── Standard chip: icon + one-liner ───────────────────────────────────
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
        <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[250px] font-mono">
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
            <ExternalLink className="w-3 h-3 text-[var(--text-muted)] hover:text-[#da7756]" />
          </span>
        )}
        {isFileOperation && !isRunning && (
          <ExternalLink className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[#da7756] flex-shrink-0" />
        )}
        {!isFileOperation && (
          <ChevronRight className={`w-3 h-3 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {expandedView}
    </div>
  );
}

export default ToolChip;
