'use client';

import { Loader2, AlertCircle } from 'lucide-react';
import { getRoleConfig } from '@/lib/sessionUtils';
import type { ClaudeActivityState } from '@/hooks/useClaudeActivityState';

// Tool icons mapping - reuse from TranscriptViewer
import {
  FileText,
  FilePlus,
  FileEdit,
  Terminal,
  Search,
  Folder,
  Globe,
  Download,
  GitBranch,
  ListChecks,
  HardHat,
  Contact,
  Star,
  Network,
  Server,
  Timer,
  Activity,
  RefreshCw,
  CheckCircle,
  Bell,
  Moon,
  PieChart,
  PenLine,
  Mic,
  Code,
  BookOpen,
  Calendar,
  MessageSquare,
  Mail,
  AudioLines,
  Wrench,
} from 'lucide-react';

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Claude Code native tools
  Read: FileText,
  Write: FilePlus,
  Edit: FileEdit,
  Bash: Terminal,
  Grep: Search,
  Glob: Folder,
  WebSearch: Globe,
  WebFetch: Download,
  Task: GitBranch,
  TodoWrite: ListChecks,
  // MCP Life System
  worker: HardHat,
  contact: Contact,
  priority: Star,
  team: Network,
  service: Server,
  timer: Timer,
  status: Activity,
  reset: RefreshCw,
  done: CheckCircle,
  ping: Bell,
  night_mode_start: Moon,
  context_check: PieChart,
  log: PenLine,
  remind: Bell,
  // MCP Job Search
  mock: Mic,
  dsa: BookOpen,
  leetcode: Code,
  // MCP Apple
  calendar: Calendar,
  messages: MessageSquare,
  mail: Mail,
  // MCP Voice
  converse: AudioLines,
  // Fallback
  default: Wrench,
};

interface ClaudeActivityIndicatorProps {
  state: ClaudeActivityState;
  roleName: string;
  role?: string | null;
}

/**
 * Animated typing dots indicator
 */
function TypingDots() {
  return (
    <div className="flex gap-0.5">
      <span className="w-1 h-1 bg-gray-400 dark:bg-[#888] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-1 bg-gray-400 dark:bg-[#888] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1 h-1 bg-gray-400 dark:bg-[#888] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

/**
 * Thinking state indicator
 */
function ThinkingIndicator({ roleName, role }: { roleName: string; role?: string | null }) {
  const roleConfig = getRoleConfig(role);
  const RoleIcon = roleConfig.icon;

  return (
    <div className="flex items-center gap-2">
      <RoleIcon className={`w-4 h-4 ${roleConfig.color}`} />
      <span className="text-xs text-gray-500 dark:text-[#888]">{roleName} is thinking</span>
      <TypingDots />
    </div>
  );
}

/**
 * Tool execution indicator
 */
function ToolExecutingIndicator({ tools }: { tools: { name: string; id: string }[] }) {
  if (tools.length === 0) return null;

  const firstTool = tools[0];
  const ToolIcon = TOOL_ICONS[firstTool.name] || TOOL_ICONS.default;
  const additionalCount = tools.length - 1;

  return (
    <div className="flex items-center gap-2">
      <ToolIcon className="w-4 h-4 text-[#da7756]" />
      <span className="text-xs text-gray-500 dark:text-[#888]">
        Running {firstTool.name}...
        {additionalCount > 0 && (
          <span className="ml-1 text-gray-400 dark:text-[#777]">
            + {additionalCount} more
          </span>
        )}
      </span>
      <Loader2 className="w-3 h-3 animate-spin text-[#da7756]" />
    </div>
  );
}

/**
 * Timeout warning
 */
function TimeoutWarning() {
  return (
    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[10px]">
        No response for 30s - Claude may be stuck. Try interrupting (Esc)
      </span>
    </div>
  );
}

/**
 * Main activity indicator component - shows Claude's current state
 * Rendered inline within the transcript, appears after the last message
 */
export function ClaudeActivityIndicator({ state, roleName, role }: ClaudeActivityIndicatorProps) {
  // Don't show indicator when idle or complete
  if (state.type === 'idle' || state.type === 'complete') {
    return null;
  }

  return (
    <div className="px-3 py-2.5 bg-gray-50/50 dark:bg-[#252525] rounded-lg border border-gray-200/50 dark:border-[#333] animate-in fade-in duration-200">
      {state.type === 'thinking' && <ThinkingIndicator roleName={roleName} role={role} />}
      {state.type === 'tool_executing' && <ToolExecutingIndicator tools={state.tools} />}
      {state.type === 'timeout' && <TimeoutWarning />}
    </div>
  );
}

export default ClaudeActivityIndicator;
