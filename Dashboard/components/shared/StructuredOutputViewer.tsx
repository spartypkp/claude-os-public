'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
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
  Wrench,
  Check,
  X,
  Brain,
  AlertCircle,
  Loader2,
  Crosshair,
  Copy,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  parseAgentOutput,
  OutputSegment,
  ToolStartSegment,
  ToolResultSegment,
  WorkerSpawnSegment,
  getToolDescription,
  getToolCategory,
} from '@/lib/parseAgentOutput';
import { getRoleConfig } from '@/lib/sessionUtils';
import { WorkerInlineCard } from './WorkerInlineCard';
import { ActiveWorker } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';

interface StructuredOutputViewerProps {
  output: string;
  isRunning?: boolean;
  role?: string; // Session role for icon/label (e.g., 'system', 'chief', 'focus')
  workers?: ActiveWorker[]; // Workers spawned by this session (for inline display)
  onSelectWorker?: (workerId: string) => void; // Callback when inline worker card is clicked
}

// Tool icon mapping
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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
};

// Category colors
const CATEGORY_COLORS = {
  read: 'var(--color-cyan)',
  write: 'var(--color-warning)',
  search: 'var(--color-info)',
  execute: 'var(--color-primary)',
  web: 'var(--color-success)',
  other: 'var(--text-tertiary)',
};

// Code block with copy button
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
          p-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-accent)] rounded text-xs transition-opacity"
        aria-label={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? <Check className="w-3 h-3 text-[var(--color-success)]" /> : <Copy className="w-3 h-3" />}
      </button>
      {language && (
        <span className="absolute top-2 left-2 text-[10px] text-[var(--text-muted)]">
          {language}
        </span>
      )}
      <pre className="font-mono text-[13px] bg-[var(--surface-base)] p-3 pt-6 rounded-lg overflow-x-auto border border-[var(--border-subtle)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Parse content to extract code blocks and render with copy buttons
function parseContentWithCodeBlocks(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match ```language\ncode\n``` or just ```\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before the code block - render as markdown
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push(
          <div key={`text-${lastIndex}`} className="[&_p]:!my-0 [&_p]:!leading-snug [&_h1]:!my-1 [&_h2]:!my-1 [&_h3]:!my-1 [&_ul]:!my-0 [&_ol]:!my-0 [&_li]:!my-0">
            <ReactMarkdown>{textBefore}</ReactMarkdown>
          </div>
        );
      }
    }

    const language = match[1] || undefined;
    const code = match[2];
    parts.push(
      <CodeBlock key={`code-${match.index}`} code={code} language={language} />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last code block - render as markdown
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (remaining.trim()) {
      parts.push(
        <div key={`text-${lastIndex}`} className="[&_p]:!my-0 [&_p]:!leading-snug [&_h1]:!my-1 [&_h2]:!my-1 [&_h3]:!my-1 [&_ul]:!my-0 [&_ol]:!my-0 [&_li]:!my-0">
          <ReactMarkdown>{remaining}</ReactMarkdown>
        </div>
      );
    }
  }

  // If no code blocks, render entire content as markdown
  if (parts.length === 0) {
    return [
      <div key="content" className="[&_p]:!my-0 [&_p]:!leading-snug [&_h1]:!my-1 [&_h2]:!my-1 [&_h3]:!my-1 [&_ul]:!my-0 [&_ol]:!my-0 [&_li]:!my-0">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    ];
  }

  return parts;
}

export function StructuredOutputViewer({ output, isRunning = false, role, workers, onSelectWorker }: StructuredOutputViewerProps) {
  // Get role config for icon and label
  const roleConfig = getRoleConfig(role);
  const RoleIcon = roleConfig.icon;
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Parse the output
  const parsed = useMemo(() => parseAgentOutput(output), [output]);

  // Enrich segments with worker_spawn events by detecting mcp__life__worker_create tool results
  const enrichedSegments = useMemo(() => {
    const segments = [...parsed.segments];
    const workerSpawns: WorkerSpawnSegment[] = [];

    // Find all worker_create tool results and create worker_spawn segments
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.type === 'tool_result') {
        const result = segment as ToolResultSegment;
        // Check if this is a worker_create result
        if (result.output && result.output.includes('worker_id')) {
          try {
            // Try to parse the output as JSON to get worker_id
            const match = result.output.match(/"worker_id":\s*"([^"]+)"/);
            if (match) {
              const workerId = match[1];
              const worker = workers?.find(w => w.id === workerId);

              workerSpawns.push({
                id: `worker-spawn-${workerId}`,
                timestamp: segment.timestamp + 1, // Just after the tool result
                type: 'worker_spawn',
                workerId,
                title: worker?.title,
                status: worker?.status,
                createdAt: worker?.created_at,
              });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // Add worker spawns to segments and re-sort by timestamp
    if (workerSpawns.length > 0) {
      segments.push(...workerSpawns);
      segments.sort((a, b) => a.timestamp - b.timestamp);
    }

    return segments;
  }, [parsed.segments, workers]);

  // Toggle tool expansion
  const toggleTool = (id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };


  // Group segments into conversation turns with tool groups
  // Track showHeader for message grouping (same sender within 60s = grouped)
  const conversationTurns = useMemo(() => {
    const turns: Array<{
      type: 'user' | 'assistant' | 'tool_group' | 'error' | 'progress' | 'worker_spawn';
      items: OutputSegment[];
      toolCount?: number;
      showHeader: boolean;
      timestamp?: number;
    }> = [];

    let currentToolGroup: OutputSegment[] = [];

    const flushToolGroup = () => {
      if (currentToolGroup.length > 0) {
        turns.push({
          type: 'tool_group',
          items: [...currentToolGroup],
          toolCount: currentToolGroup.filter(s => s.type === 'tool_start').length,
          showHeader: false, // Tool groups don't have headers
        });
        currentToolGroup = [];
      }
    };

    // Helper to determine if we should show header for a message turn
    const shouldShowHeader = (
      type: 'user' | 'assistant',
      timestamp: number
    ): boolean => {
      // Find the last message turn of the same type (ignoring tool_groups between)
      let lastSameTypeTurn: (typeof turns)[number] | null = null;
      let sawToolGroup = false;

      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        if (turn.type === 'tool_group') {
          sawToolGroup = true;
          continue;
        }
        if (turn.type === type) {
          lastSameTypeTurn = turn;
          break;
        }
        // Different message type found - always show header
        if (turn.type === 'user' || turn.type === 'assistant') {
          return true;
        }
      }

      // No previous turn of same type - show header
      if (!lastSameTypeTurn) return true;

      // Tool group between messages - show header (breaks the group)
      if (sawToolGroup) return true;

      // Check time gap (60 seconds = 60000ms)
      const lastTimestamp = lastSameTypeTurn.timestamp || 0;
      if (timestamp - lastTimestamp > 60000) return true;

      return false;
    };

    for (const segment of enrichedSegments) {
      if (segment.type === 'user') {
        flushToolGroup();
        const showHeader = shouldShowHeader('user', segment.timestamp);
        turns.push({ type: 'user', items: [segment], showHeader, timestamp: segment.timestamp });
      } else if (segment.type === 'text') {
        flushToolGroup();
        // Check if last turn was also assistant text, merge them
        const lastTurn = turns[turns.length - 1];
        if (lastTurn && lastTurn.type === 'assistant') {
          lastTurn.items.push(segment);
        } else {
          const showHeader = shouldShowHeader('assistant', segment.timestamp);
          turns.push({ type: 'assistant', items: [segment], showHeader, timestamp: segment.timestamp });
        }
      } else if (segment.type === 'thinking') {
        // Include thinking in assistant turn
        flushToolGroup();
        const lastTurn = turns[turns.length - 1];
        if (lastTurn && lastTurn.type === 'assistant') {
          lastTurn.items.push(segment);
        } else {
          const showHeader = shouldShowHeader('assistant', segment.timestamp);
          turns.push({ type: 'assistant', items: [segment], showHeader, timestamp: segment.timestamp });
        }
      } else if (segment.type === 'tool_start' || segment.type === 'tool_result') {
        currentToolGroup.push(segment);
      } else if (segment.type === 'worker_spawn') {
        flushToolGroup();
        turns.push({ type: 'worker_spawn', items: [segment], showHeader: false, timestamp: segment.timestamp });
      } else if (segment.type === 'error') {
        flushToolGroup();
        turns.push({ type: 'error', items: [segment], showHeader: false });
      } else if (segment.type === 'progress') {
        flushToolGroup();
        turns.push({ type: 'progress', items: [segment], showHeader: false });
      }
    }

    flushToolGroup();
    return turns;
  }, [enrichedSegments]);

  // Empty state
  if (parsed.segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
        {isRunning ? (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-xl bg-[var(--color-primary)]/10">
              <RoleIcon className="w-6 h-6 text-[var(--color-primary)]" />
            </div>
            <span className="text-sm">{roleConfig.label} Claude thinking...</span>
          </div>
        ) : (
          <span className="text-sm">No messages yet</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col pt-2 pb-8">
      {conversationTurns.map((turn, idx) => {
        // Tight spacing - minimal gaps between all elements
        const marginClass = turn.showHeader ? 'mt-1.5 first:mt-0' : 'mt-0.5';

        if (turn.type === 'user') {
          const content = (turn.items[0] as any).content;
          return (
            <div key={`user-${idx}`} className={marginClass}>
              <UserMessage content={content} showHeader={turn.showHeader} />
            </div>
          );
        }

        if (turn.type === 'assistant') {
          const textContent = turn.items
            .filter(s => s.type === 'text')
            .map(s => (s as any).content)
            .join('\n\n');
          const thinkingContent = turn.items
            .filter(s => s.type === 'thinking')
            .map(s => (s as any).content)
            .join('\n\n');

          // Check if we should skip header because a preceding tool_group already showed it
          const prevTurn = conversationTurns[idx - 1];
          const prevPrevTurn = conversationTurns[idx - 2];
          const toolGroupAlreadyShowedHeader =
            prevTurn?.type === 'tool_group' && prevPrevTurn?.type === 'user';
          const effectiveShowHeader = turn.showHeader && !toolGroupAlreadyShowedHeader;

          return (
            <div key={`assistant-${idx}`} className={marginClass}>
              <AssistantMessage
                content={textContent}
                thinking={thinkingContent}
                isRunning={isRunning && idx === conversationTurns.length - 1}
                showHeader={effectiveShowHeader}
                roleIcon={RoleIcon}
                roleLabel={roleConfig.label}
              />
            </div>
          );
        }

        if (turn.type === 'tool_group') {
          // Check if previous turn was a user message - if so, show Claude header
          const prevTurn = conversationTurns[idx - 1];
          const showClaudeHeader = prevTurn?.type === 'user';

          return (
            <div key={`tools-${idx}`} className="mt-1 first:mt-0">
              {showClaudeHeader && (
                <div className="flex gap-2 items-start mb-1">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    <div className="p-1.5 rounded-lg bg-[var(--color-primary)]/10">
                      <RoleIcon className="w-4 h-4 text-[var(--color-primary)]" />
                    </div>
                  </div>
                  <div className="text-xs font-medium text-[var(--color-primary)] pt-1.5">
                    {roleConfig.label} Claude
                  </div>
                </div>
              )}
              <ToolGroup
                items={turn.items}
                expandedTools={expandedTools}
                onToggleTool={toggleTool}
                isRunning={isRunning}
              />
            </div>
          );
        }

        if (turn.type === 'worker_spawn') {
          const spawn = turn.items[0] as WorkerSpawnSegment;
          return (
            <div key={`worker-${spawn.workerId}`} className="mt-1.5 first:mt-0">
              <WorkerInlineCard
                workerId={spawn.workerId}
                title={spawn.title}
                status={spawn.status}
                createdAt={spawn.createdAt}
                onClick={onSelectWorker ? () => onSelectWorker(spawn.workerId) : undefined}
              />
            </div>
          );
        }

        if (turn.type === 'error') {
          return (
            <div key={`error-${idx}`} className="mt-1.5 first:mt-0">
              <ErrorBlock message={(turn.items[0] as any).message} />
            </div>
          );
        }

        if (turn.type === 'progress') {
          const p = turn.items[0] as any;
          return (
            <div key={`progress-${idx}`} className="mt-1.5 first:mt-0">
              <ProgressBlock
                step={p.step}
                total={p.total}
                description={p.description}
              />
            </div>
          );
        }

        return null;
      })}


    </div>
  );
}

// User message - right aligned like a chat app
function UserMessage({ content, showHeader = true }: { content: string; showHeader?: boolean }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        {showHeader && (
          <div className="text-xs font-medium text-[var(--text-muted)] mb-0.5 text-right">You</div>
        )}
        <div className={`bg-[var(--color-primary)] text-white px-3 py-2 text-sm leading-normal whitespace-pre-wrap break-words ${
          showHeader ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-r-md'
        }`}>
          {content}
        </div>
      </div>
    </div>
  );
}

// Assistant message - Claude's response
function AssistantMessage({
  content,
  thinking,
  isRunning,
  showHeader = true,
  roleIcon: RoleIcon,
  roleLabel,
}: {
  content: string;
  thinking?: string;
  isRunning?: boolean;
  showHeader?: boolean;
  roleIcon?: LucideIcon;
  roleLabel?: string;
}) {
  const [showThinking, setShowThinking] = useState(false);

  // Fallback to default icon if not provided
  const Icon = RoleIcon || Crosshair;
  const label = roleLabel ? `${roleLabel} Claude` : 'Claude';

  const parsedContent = useMemo(() => parseContentWithCodeBlocks(content), [content]);

  return (
    <div className="flex gap-2 items-start">
      {/* Icon column - empty spacer when header hidden to maintain alignment */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        {showHeader && (
          <div className={`p-1.5 rounded-lg bg-[var(--color-primary)]/10 ${isRunning ? 'animate-pulse' : ''}`}>
            <Icon className="w-4 h-4 text-[var(--color-primary)]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="text-xs font-medium text-[var(--color-primary)] mb-0.5">{label}</div>
        )}

        {/* Thinking toggle */}
        {thinking && (
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-1 transition-colors"
          >
            <Brain className="w-3 h-3" />
            {showThinking ? 'Hide thinking' : 'Show thinking'}
            <ChevronDown className={`w-3 h-3 transition-transform ${showThinking ? 'rotate-180' : ''}`} />
          </button>
        )}

        {/* Thinking content */}
        {showThinking && thinking && (
          <div className="mb-2 p-2 bg-[var(--surface-muted)] rounded-lg border border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-tertiary)] italic whitespace-pre-wrap leading-normal">
              {thinking}
            </p>
          </div>
        )}

        {/* Main content */}
        {content && (
          <div className="text-sm leading-normal text-[var(--text-secondary)] whitespace-pre-wrap break-words">
            {parsedContent}
          </div>
        )}
      </div>
    </div>
  );
}

// Tool group - always expanded inline
function ToolGroup({
  items,
  expandedTools,
  onToggleTool,
  isRunning,
}: {
  items: OutputSegment[];
  expandedTools: Set<string>;
  onToggleTool: (id: string) => void;
  isRunning: boolean;
}) {
  // Pair tool_start with tool_result
  const toolPairs: Array<{ start: ToolStartSegment; result?: ToolResultSegment }> = [];

  for (const item of items) {
    if (item.type === 'tool_start') {
      toolPairs.push({ start: item as ToolStartSegment });
    } else if (item.type === 'tool_result') {
      const result = item as ToolResultSegment;
      const pair = toolPairs.find(p => p.start.toolId === result.toolId);
      if (pair) {
        pair.result = result;
      }
    }
  }

  return (
    <div className="pl-11 space-y-0.5 border-l-2 border-[var(--border-subtle)] ml-4">
      {toolPairs.map(({ start, result }) => (
        <ToolRow
          key={start.id}
          start={start}
          result={result}
          isExpanded={expandedTools.has(start.id)}
          onToggle={() => onToggleTool(start.id)}
          isRunning={isRunning && !result}
        />
      ))}
    </div>
  );
}

// Compact tool row
function ToolRow({
  start,
  result,
  isExpanded,
  onToggle,
  isRunning,
}: {
  start: ToolStartSegment;
  result?: ToolResultSegment;
  isExpanded: boolean;
  onToggle: () => void;
  isRunning: boolean;
}) {
  const Icon = TOOL_ICONS[start.name] || Wrench;
  const category = getToolCategory(start.name);
  const color = CATEGORY_COLORS[category];
  const description = getToolDescription(start.name, start.input);

  return (
    <div className="py-1">
      <button
        onClick={onToggle}
        className="w-full text-left group flex items-center gap-2"
      >
        <span style={{ color }} className="flex-shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </span>

        <span
          className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: `${color}15`, color }}
        >
          {start.name}
        </span>

        <span className="text-xs text-[var(--text-tertiary)] truncate flex-1">
          {description}
        </span>

        {isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-[var(--color-primary)] flex-shrink-0" />
        ) : result ? (
          result.success ? (
            <Check className="w-3 h-3 text-[var(--color-success)] flex-shrink-0" />
          ) : (
            <X className="w-3 h-3 text-[var(--color-error)] flex-shrink-0" />
          )
        ) : null}

        {result?.durationMs !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)] tabular-nums flex-shrink-0">
            {result.durationMs}ms
          </span>
        )}

        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-2 ml-5 space-y-2 text-xs">
          {/* Input */}
          {Object.keys(start.input).length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Input
              </div>
              <pre className="font-mono text-[var(--text-tertiary)] bg-[var(--surface-base)] p-2 rounded overflow-x-auto text-[11px]">
                {JSON.stringify(start.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {result?.output && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Output
              </div>
              <pre className="font-mono text-[var(--text-tertiary)] bg-[var(--surface-base)] p-2 rounded overflow-x-auto max-h-32 overflow-y-auto text-[11px]">
                {result.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Error block component - inline with chat messages
function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex gap-3 items-start pl-11">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-error-dim)] border border-[var(--color-error)]/20 rounded-lg">
        <AlertCircle className="w-4 h-4 text-[var(--color-error)] flex-shrink-0" />
        <p className="text-sm text-[var(--color-error)]">{message}</p>
      </div>
    </div>
  );
}

// Progress block component - inline with chat messages
function ProgressBlock({
  step,
  total,
  description,
}: {
  step: number;
  total?: number;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 pl-11">
      {total && (
        <div className="w-20 h-1.5 bg-[var(--surface-accent)] rounded-full overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-[var(--color-primary)] transition-all duration-300"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      )}
      <span className="text-xs text-[var(--text-muted)]">
        {total ? `${step}/${total}` : `Step ${step}`}
      </span>
      <span className="text-xs text-[var(--text-secondary)]">{description}</span>
    </div>
  );
}

export default StructuredOutputViewer;
