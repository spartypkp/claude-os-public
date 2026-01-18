/**
 * Agent Output Parser
 *
 * Parses structured output from the Claude Agent SDK into displayable segments.
 * The executor now emits JSON lines with structured events for real-time rendering.
 *
 * Output format (JSONL - one JSON object per line):
 * {"type": "user", "content": "..."}     // User message
 * {"type": "text", "content": "..."}     // Claude's response
 * {"type": "thinking", "content": "..."}
 * {"type": "tool_start", "name": "Read", "id": "toolu_xxx", "input": {...}}
 * {"type": "tool_result", "id": "toolu_xxx", "success": true, "output": "...", "duration_ms": 123}
 * {"type": "error", "message": "..."}
 * {"type": "progress", "step": 3, "total": 10, "description": "..."}
 */

export type OutputSegmentType =
  | 'user'
  | 'text'
  | 'thinking'
  | 'tool_start'
  | 'tool_result'
  | 'error'
  | 'progress'
  | 'worker_spawn';

export interface BaseSegment {
  id: string;
  timestamp: number;
}

export interface UserSegment extends BaseSegment {
  type: 'user';
  content: string;
}

export interface TextSegment extends BaseSegment {
  type: 'text';
  content: string;
}

export interface ThinkingSegment extends BaseSegment {
  type: 'thinking';
  content: string;
}

export interface ToolStartSegment extends BaseSegment {
  type: 'tool_start';
  name: string;
  toolId: string;
  input: Record<string, unknown>;
}

export interface ToolResultSegment extends BaseSegment {
  type: 'tool_result';
  toolId: string;
  success: boolean;
  output: string;
  durationMs?: number;
}

export interface ErrorSegment extends BaseSegment {
  type: 'error';
  message: string;
}

export interface ProgressSegment extends BaseSegment {
  type: 'progress';
  step: number;
  total?: number;
  description: string;
}

export interface WorkerSpawnSegment extends BaseSegment {
  type: 'worker_spawn';
  workerId: string;
  // Enriched from workers[] array at render time
  title?: string;
  status?: string;
  createdAt?: string;
}

export type OutputSegment =
  | UserSegment
  | TextSegment
  | ThinkingSegment
  | ToolStartSegment
  | ToolResultSegment
  | ErrorSegment
  | ProgressSegment
  | WorkerSpawnSegment;

export interface ParsedOutput {
  segments: OutputSegment[];
  currentTool: ToolStartSegment | null;
  toolCount: number;
  errorCount: number;
  progress: ProgressSegment | null;
}

/**
 * Parse structured JSONL output from the executor
 */
export function parseAgentOutput(rawOutput: string): ParsedOutput {
  const segments: OutputSegment[] = [];
  let currentTool: ToolStartSegment | null = null;
  let toolCount = 0;
  let errorCount = 0;
  let progress: ProgressSegment | null = null;

  if (!rawOutput || rawOutput.trim() === '') {
    return { segments, currentTool, toolCount, errorCount, progress };
  }

  const lines = rawOutput.split('\n');
  let segmentId = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to parse as JSON (structured output)
    if (trimmed.startsWith('{')) {
      try {
        const event = JSON.parse(trimmed);
        const id = `seg-${segmentId++}`;
        const timestamp = event.timestamp || Date.now();

        switch (event.type) {
          case 'user':
            if (event.content?.trim()) {
              segments.push({
                id,
                timestamp,
                type: 'user',
                content: event.content,
              });
            }
            break;

          case 'text':
            if (event.content?.trim()) {
              segments.push({
                id,
                timestamp,
                type: 'text',
                content: event.content,
              });
            }
            break;

          case 'thinking':
            if (event.content?.trim()) {
              segments.push({
                id,
                timestamp,
                type: 'thinking',
                content: event.content,
              });
            }
            break;

          case 'tool_start':
            const toolStart: ToolStartSegment = {
              id,
              timestamp,
              type: 'tool_start',
              name: event.name || 'Unknown',
              toolId: event.id || id,
              input: event.input || {},
            };
            segments.push(toolStart);
            currentTool = toolStart;
            toolCount++;
            break;

          case 'tool_result':
            segments.push({
              id,
              timestamp,
              type: 'tool_result',
              toolId: event.id || '',
              success: event.success !== false,
              output: event.output || '',
              durationMs: event.duration_ms,
            });
            currentTool = null;
            break;

          case 'error':
            segments.push({
              id,
              timestamp,
              type: 'error',
              message: event.message || 'Unknown error',
            });
            errorCount++;
            break;

          case 'progress':
            const progressSeg: ProgressSegment = {
              id,
              timestamp,
              type: 'progress',
              step: event.step || 0,
              total: event.total,
              description: event.description || '',
            };
            segments.push(progressSeg);
            progress = progressSeg;
            break;
        }
      } catch {
        // Not valid JSON, treat as plain text
        segments.push({
          id: `seg-${segmentId++}`,
          timestamp: Date.now(),
          type: 'text',
          content: trimmed,
        });
      }
    } else {
      // Plain text line - fallback for non-structured output
      segments.push({
        id: `seg-${segmentId++}`,
        timestamp: Date.now(),
        type: 'text',
        content: trimmed,
      });
    }
  }

  // Sort segments by timestamp to ensure correct chronological order
  // This is important because the Stop hook captures text after tools have already
  // been recorded, but assigns timestamps that place text before tools
  segments.sort((a, b) => a.timestamp - b.timestamp);

  return { segments, currentTool, toolCount, errorCount, progress };
}

/**
 * Get a human-readable description of a tool
 */
export function getToolDescription(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
      const filePath = input.file_path as string;
      return filePath ? `Reading ${getFilename(filePath)}` : 'Reading file';

    case 'Write':
      const writePath = input.file_path as string;
      return writePath ? `Writing ${getFilename(writePath)}` : 'Writing file';

    case 'Edit':
      const editPath = input.file_path as string;
      return editPath ? `Editing ${getFilename(editPath)}` : 'Editing file';

    case 'Bash':
      const cmd = input.command as string;
      return cmd ? `Running: ${truncate(cmd, 40)}` : 'Running command';

    case 'Grep':
      const pattern = input.pattern as string;
      return pattern ? `Searching for "${truncate(pattern, 30)}"` : 'Searching files';

    case 'Glob':
      const globPattern = input.pattern as string;
      return globPattern ? `Finding files: ${globPattern}` : 'Finding files';

    case 'WebSearch':
      const query = input.query as string;
      return query ? `Searching: "${truncate(query, 40)}"` : 'Web search';

    case 'WebFetch':
      const url = input.url as string;
      return url ? `Fetching ${truncate(url, 40)}` : 'Fetching URL';

    case 'Task':
      const taskType = input.subagent_type as string;
      return taskType ? `Spawning ${taskType} agent` : 'Spawning agent';

    case 'TodoWrite':
      return 'Updating task list';

    default:
      return `Using ${name}`;
  }
}

/**
 * Get icon name for a tool
 */
export function getToolIcon(name: string): string {
  switch (name) {
    case 'Read':
      return 'FileText';
    case 'Write':
      return 'FilePlus';
    case 'Edit':
      return 'FileEdit';
    case 'Bash':
      return 'Terminal';
    case 'Grep':
      return 'Search';
    case 'Glob':
      return 'Folder';
    case 'WebSearch':
      return 'Globe';
    case 'WebFetch':
      return 'Download';
    case 'Task':
      return 'GitBranch';
    case 'TodoWrite':
      return 'ListChecks';
    default:
      return 'Wrench';
  }
}

/**
 * Get the category/color for a tool
 */
export function getToolCategory(name: string): 'read' | 'write' | 'search' | 'execute' | 'web' | 'other' {
  switch (name) {
    case 'Read':
      return 'read';
    case 'Write':
    case 'Edit':
      return 'write';
    case 'Grep':
    case 'Glob':
      return 'search';
    case 'Bash':
    case 'Task':
      return 'execute';
    case 'WebSearch':
    case 'WebFetch':
      return 'web';
    default:
      return 'other';
  }
}

// Helpers
function getFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
