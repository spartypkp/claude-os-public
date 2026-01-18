'use client';

import { ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';
import { getToolOneLiner, parseToolInput, parseToolResult } from './registry';
import { getExpandedView } from './ExpandedViews';
import { useOpenInDesktop, isViewableFile } from './ClickableRef';

// File operations that should click-to-open (not expand)
const FILE_OPERATION_TOOLS = ['Read', 'Write', 'Edit', 'read_file', 'write', 'edit'];
const SEARCH_TOOLS = ['Grep', 'Glob', 'grep', 'glob', 'codebase_search', 'file_search'];
const CONTACT_TOOLS = ['contact', 'contact_search', 'contact_view', 'contact_update'];
const CALENDAR_TOOLS = ['calendar', 'calendar_create', 'calendar_list', 'calendar_delete', 'local_calendar'];
const SESSION_TOOLS = ['session_spawn', 'session_peek', 'team'];

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
 * Uses the tool registry for smart one-liners and custom expanded views.
 * File tools have a clickable "open" button to view in Desktop.
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
  const { text: oneLiner, showToolName } = getToolOneLiner(formattedName, toolInput, resultContent);
  
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
  const isSessionTool = SESSION_TOOLS.some(t => formattedName.includes(t) || toolName.includes(t));

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
      // File operations: open directly
      openFile(filePath, !isViewableFile(filePath));
    } else if (isFileOperation) {
      // File operations: never expand, even on error (errors shown inline)
      return;
    } else {
      // Other tools: toggle expanded view
      onToggle();
    }
  };

  // Handle open action for search/contact/calendar tools
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isSearchTool && filePath) {
      // Search result - open in Finder to show location
      openInFinder(filePath.split('/').slice(0, -1).join('/'));
    } else if (isContactTool) {
      const contactName = parsedInput.contactName || parsedInput.contactQuery;
      openContact(contactName);
    } else if (isCalendarTool) {
      openCalendar();
    }
  };
  
  return (
    <div className="my-1">
      {/* Collapsed chip */}
      <button
        onClick={handleMainClick}
        className={`
          group inline-flex items-center gap-1.5 py-1 px-2 rounded-md text-left
          transition-all duration-150
          ${isExpanded
            ? 'bg-[var(--surface-accent)] ring-1 ring-[var(--border-default)]'
            : 'bg-[var(--surface-base)] hover:bg-[var(--surface-accent)]'
          }
          ${hasError ? 'ring-1 ring-[var(--color-error)]/30' : ''}
          ${canClickToOpen ? 'cursor-pointer' : ''}
        `}
        title={canClickToOpen ? `Open ${filePath}` : undefined}
      >
        {/* Icon with subtle background */}
        <span
          className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
        >
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Icon className="w-3 h-3" />
          )}
        </span>

        {/* One-liner text */}
        <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[220px] font-mono">
          {oneLiner || formattedName}
        </span>

        {/* Tool name badge (when shown) */}
        {showToolName && oneLiner && (
          <span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded flex-shrink-0">
            {formattedName}
          </span>
        )}

        {/* Error indicator */}
        {hasError && (
          <X className="w-3 h-3 text-[var(--color-error)] flex-shrink-0" />
        )}

        {/* Open in Desktop button (for search/contact/calendar tools only) */}
        {canShowOpenButton && (
          <span
            onClick={handleOpen}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--surface-muted)] rounded transition-opacity"
            title={isSearchTool ? 'Show in Finder' : isContactTool ? 'Open in Contacts' : isCalendarTool ? 'Open in Calendar' : 'Open'}
          >
            <ExternalLink className="w-3 h-3 text-[var(--text-muted)] hover:text-[#da7756]" />
          </span>
        )}

        {/* Click-to-open indicator for file operations */}
        {isFileOperation && !isRunning && (
          <ExternalLink className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[#da7756] flex-shrink-0" />
        )}

        {/* Expand indicator (only for non-file-operations) */}
        {!isFileOperation && (
          <ChevronRight
            className={`w-3 h-3 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        )}
      </button>

      {/* Expanded view (never for file operations) */}
      {isExpanded && !isFileOperation && (
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

export default ToolChip;

