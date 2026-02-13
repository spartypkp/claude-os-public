/**
 * System Message Detection
 *
 * Patterns for identifying and summarizing injected system messages
 * that appear as "user" messages in the transcript but are actually
 * hook injections, handoffs, worker notifications, etc.
 */

/**
 * Normalize message content that may arrive in raw API formats.
 * Handles Python list repr: [{'type': 'text', 'text': '...'}]
 */
export function normalizeMessageContent(content: string): string {
  // Python list-of-dicts format from raw transcript: [{'type': 'text', 'text': '...'}]
  const pyMatch = content.match(/^\[\{'type':\s*'text',\s*'text':\s*'([\s\S]+?)'\}\]$/);
  if (pyMatch) return pyMatch[1];
  return content;
}

/**
 * Patterns that indicate a message is a system injection, not a real user message
 */
export const SYSTEM_MESSAGE_PATTERNS = [
  '[AUTO-HANDOFF]',
  'Courtesy System Wakeup',
  '<session-mode>',
  '<session-role>',
  '---\nauto_include:',              // YAML frontmatter with auto_include (precedes session-role)
  '<system-reminder>',
  'Previous session handed off',
  'Background worker',
  '📬 Task',
  'SessionStart:',
  '[Request interrupted by user]',
  'Request interrupted by user',
  '[PING from',
  '[CLAUDE OS SYS:',               // System notifications (specialist complete, warnings, etc.)
  '[TEAM \u2192',                   // Direct team messages between sessions
  '[TEAM REQUEST:',                 // Spawn requests from non-Chief specialists
  'Base directory for this skill:',  // Skill invocation
  'ARGUMENTS:',                       // Skill arguments injection
  "You're writing a handoff document", // Memory Agent (summarizer) prompt
  '<task-notification>',              // Subagent completion result
] as const;

/**
 * Check if a "user message" is actually a system injection.
 * IMPORTANT: Only matches patterns at the START of the content to avoid
 * false positives when trigger words appear mid-message in normal text.
 */
export function isSystemMessage(content: string): boolean {
  const trimmed = content.trimStart();
  return SYSTEM_MESSAGE_PATTERNS.some(pattern => trimmed.startsWith(pattern));
}

// =============================================================================
// SPECIALIST NOTIFICATION PARSING
// =============================================================================

export interface SpecialistNotification {
  role: string;
  sessionId: string;
  passed: boolean;
  summary: string;
  workspace?: string;
}

/**
 * Parse specialist completion/failure notifications.
 *
 * Handles two formats:
 * 1. Specialist loop: "Specialist complete - builder (0212-1607-builder-83d0349e)"
 * 2. Background done: "Builder 0212-160 complete"
 */
export function parseSpecialistNotification(content: string): SpecialistNotification | null {
  // Pattern 1: "Specialist complete/FAILED - role (conversation-id)"
  const loopMatch = content.match(/Specialist (complete|FAILED) - ([\w-]+) \(([^)]+)\)/);
  if (loopMatch) {
    const passed = loopMatch[1] === 'complete';
    const role = loopMatch[2];
    const sessionId = loopMatch[3];

    // Body is after the first double-newline
    const bodyStart = content.indexOf('\n\n');
    let body = bodyStart >= 0 ? content.slice(bodyStart + 2) : '';

    // Extract workspace from end of body
    let workspace: string | undefined;
    const wsMatch = body.match(/\n\nWorkspace:\s*(.+?)\s*$/);
    if (wsMatch) {
      workspace = wsMatch[1];
      body = body.slice(0, wsMatch.index);
    }

    return { role, sessionId, passed, summary: body.trim(), workspace };
  }

  // Pattern 2: "{Role} {short_id} complete" (from notify_specialist_complete)
  const bgMatch = content.match(/\[CLAUDE OS SYS: NOTIFICATION\]:\s*(\w+) ([a-f0-9]{8}) complete/);
  if (bgMatch) {
    const role = bgMatch[1].toLowerCase();
    const sessionId = bgMatch[2];

    const bodyStart = content.indexOf('\n\n');
    const summary = bodyStart >= 0 ? content.slice(bodyStart + 2).trim() : '';

    return { role, sessionId, passed: true, summary };
  }

  return null;
}

/**
 * Check if a system message is a specialist completion notification.
 * Anchored to start of content to avoid false positives.
 */
export function isSpecialistNotification(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('Specialist complete') ||
    trimmed.startsWith('Specialist FAILED') ||
    /^\[CLAUDE OS SYS: NOTIFICATION\]:\s*\w+ [a-f0-9]{8} complete/.test(trimmed);
}

// =============================================================================
// SPECIALIST REPLY PARSING
// =============================================================================

export interface SpecialistReply {
  role: string;
  sessionId: string;
  message: string;
}

/**
 * Parse "Reply from {role} ({id}): {message}" notifications.
 * These always follow a [CLAUDE OS SYS:] prefix.
 */
export function parseSpecialistReply(content: string): SpecialistReply | null {
  // Match Reply from after [CLAUDE OS SYS: ...]: prefix
  const match = content.match(/\[CLAUDE OS SYS:[^\]]*\]:\s*Reply from (\w[\w-]*) \(([^)]+)\):\s*([\s\S]+)/);
  if (!match) return null;
  return {
    role: match[1].toLowerCase(),
    sessionId: match[2],
    message: match[3].trim(),
  };
}

/**
 * Check if a system message is a specialist reply.
 * Anchored to start of content to avoid false positives.
 */
export function isSpecialistReply(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('[CLAUDE OS SYS:') && trimmed.includes('Reply from ');
}

// =============================================================================
// TEAM MESSAGE PARSING
// =============================================================================

export interface TeamMessage {
  sourceRole: string;
  targetRole: string;
  message: string;
}

/**
 * Check if a system message is a direct team message.
 * Format: [TEAM → Target] from Source: message
 */
export function isTeamMessage(content: string): boolean {
  return content.trimStart().startsWith('[TEAM \u2192');
}

/**
 * Parse a team message into structured parts.
 * Format: [TEAM → Target] from Source: message
 */
export function parseTeamMessage(content: string): TeamMessage | null {
  const match = content.match(/\[TEAM \u2192 ([\w-]+)\] from ([\w-]+):\s*([\s\S]+)/);
  if (!match) return null;
  return {
    targetRole: match[1].toLowerCase(),
    sourceRole: match[2].toLowerCase(),
    message: match[3].trim(),
  };
}

export interface TeamRequest {
  requestingRole: string;
  requestedRole: string;
  purpose: string;
}

/**
 * Check if a system message is a team spawn request.
 * Format: [TEAM REQUEST: Role wants OtherRole for "purpose"]
 */
export function isTeamRequest(content: string): boolean {
  return content.trimStart().startsWith('[TEAM REQUEST:');
}

/**
 * Parse a team spawn request into structured parts.
 * Format: [TEAM REQUEST: Role wants OtherRole for "purpose"]
 */
export function parseTeamRequest(content: string): TeamRequest | null {
  const match = content.match(/\[TEAM REQUEST:\s*([\w-]+) wants ([\w-]+) for "([^"]+)"\]/);
  if (!match) return null;
  return {
    requestingRole: match[1].toLowerCase(),
    requestedRole: match[2].toLowerCase(),
    purpose: match[3],
  };
}

// =============================================================================
// TASK NOTIFICATION PARSING (Subagent completion results)
// =============================================================================

export interface TaskNotification {
  taskId: string;
  status: 'completed' | 'failed' | string;
  summary: string;
  result: string;
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
}

/**
 * Check if a system message is a subagent task notification.
 */
export function isTaskNotification(content: string): boolean {
  return content.trimStart().startsWith('<task-notification>');
}

/**
 * Parse a task notification into structured parts.
 */
export function parseTaskNotification(content: string): TaskNotification | null {
  const idMatch = content.match(/<task-id>([\s\S]*?)<\/task-id>/);
  const statusMatch = content.match(/<status>([\s\S]*?)<\/status>/);
  const summaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/);
  const resultMatch = content.match(/<result>([\s\S]*?)<\/result>/);
  const tokensMatch = content.match(/total_tokens:\s*(\d+)/);
  const toolsMatch = content.match(/tool_uses:\s*(\d+)/);
  const durationMatch = content.match(/duration_ms:\s*(\d+)/);

  if (!summaryMatch) return null;

  return {
    taskId: idMatch?.[1]?.trim() || '',
    status: statusMatch?.[1]?.trim() || 'completed',
    summary: summaryMatch[1].trim(),
    result: resultMatch?.[1]?.trim() || '',
    totalTokens: tokensMatch ? parseInt(tokensMatch[1]) : undefined,
    toolUses: toolsMatch ? parseInt(toolsMatch[1]) : undefined,
    durationMs: durationMatch ? parseInt(durationMatch[1]) : undefined,
  };
}

// =============================================================================
// SYSTEM MESSAGE SUMMARIZATION
// =============================================================================

export interface SystemMessageSummary {
  icon: string;
  summary: string;
}

/**
 * Extract a concise summary from system message content.
 * Uses startsWith checks where possible to avoid mid-content false matches.
 */
export function summarizeSystemMessage(content: string): SystemMessageSummary {
  const trimmed = content.trimStart();

  // User interrupt
  if (trimmed.startsWith('Request interrupted by user') || trimmed.startsWith('[Request interrupted by user]')) {
    return { icon: '⎋', summary: 'Interrupted' };
  }

  // Team message (direct communication between sessions)
  if (trimmed.startsWith('[TEAM \u2192')) {
    const parsed = parseTeamMessage(trimmed);
    if (parsed) {
      return { icon: '\u2192', summary: `${parsed.sourceRole}: ${parsed.message.slice(0, 50)}` };
    }
    return { icon: '\u2192', summary: 'Team message' };
  }

  // Team spawn request
  if (trimmed.startsWith('[TEAM REQUEST:')) {
    const parsed = parseTeamRequest(trimmed);
    if (parsed) {
      return { icon: '\u270B', summary: `${parsed.requestingRole} wants ${parsed.requestedRole}` };
    }
    return { icon: '\u270B', summary: 'Spawn request' };
  }

  // Ping from another session
  if (trimmed.startsWith('[PING from')) {
    const sessionMatch = trimmed.match(/\[PING from (\w+)\]/);
    const sessionId = sessionMatch ? sessionMatch[1].slice(0, 8) : 'session';
    return { icon: '📍', summary: `Ping: ${sessionId}` };
  }

  // Handoff
  if (trimmed.startsWith('[AUTO-HANDOFF]')) {
    const reasonMatch = content.match(/Reason:\s*(\w+)/);
    const reason = reasonMatch ? reasonMatch[1] : 'handoff';
    return { icon: '↻', summary: `Handoff: ${reason}` };
  }

  // Worker completion
  if (trimmed.startsWith('Courtesy System Wakeup') || trimmed.startsWith('📬 Task')) {
    return { icon: '⏰', summary: 'Workers complete' };
  }

  // Session start with context
  if (trimmed.startsWith('SessionStart:')) {
    return { icon: '▶', summary: 'Session started' };
  }

  // Session mode/role injection — parse for meaningful metadata
  // Also catches YAML frontmatter (---\nauto_include:) that wraps session-role
  if (trimmed.startsWith('<session-mode>') || trimmed.startsWith('<session-role>') || trimmed.startsWith('---\nauto_include:')) {
    // Extract role from <session-role> tag content
    const roleMatch = content.match(/# (\w[\w\s-]*)/);
    const roleName = roleMatch ? roleMatch[1].trim() : '';

    // Detect mode from content
    const modeMatch = content.match(/# \w+:\s*(Interactive|Preparation|Implementation|Verification)/i)
      || content.match(/mode[:\s]+(interactive|preparation|implementation|verification)/i);
    const mode = modeMatch ? modeMatch[1] : '';

    // Extract description if present
    const descMatch = content.match(/<session-description>\s*([\s\S]*?)\s*<\/session-description>/);
    const description = descMatch ? descMatch[1].trim().split('\n')[0].slice(0, 80) : '';

    // Build summary
    const parts = [roleName || 'Session'].filter(Boolean);
    if (mode) parts.push(mode.toLowerCase());
    if (description) parts.push(`— ${description}`);

    return { icon: '▶', summary: parts.join(' ') };
  }

  // Task notification (subagent result)
  if (trimmed.startsWith('<task-notification>')) {
    const parsed = parseTaskNotification(trimmed);
    if (parsed) {
      const statusIcon = parsed.status === 'completed' ? '✓' : '✗';
      return { icon: '⚡', summary: `${statusIcon} ${parsed.summary.slice(0, 60)}` };
    }
    return { icon: '⚡', summary: 'Agent result' };
  }

  // System reminder
  if (trimmed.startsWith('<system-reminder>')) {
    return { icon: '📋', summary: 'System reminder' };
  }

  // Background worker
  if (trimmed.startsWith('Background worker')) {
    return { icon: '🔄', summary: 'Background worker update' };
  }

  // Memory Agent (summarizer) prompt
  if (trimmed.startsWith("You're writing a handoff document")) {
    return { icon: '🧠', summary: 'Memory Agent prompt' };
  }

  // Skill invocation
  if (trimmed.startsWith('Base directory for this skill:') || trimmed.startsWith('ARGUMENTS:')) {
    // Try to extract skill name from path like ".../skills/playwright-skill"
    const pathMatch = content.match(/skills\/([^\/\n]+)/);
    const skillName = pathMatch ? pathMatch[1] : 'skill';
    return { icon: '⚡', summary: `Skill: ${skillName}` };
  }

  // [CLAUDE OS SYS:] messages — specialist completions handled separately in TranscriptViewer
  if (trimmed.startsWith('[CLAUDE OS SYS:')) {
    // Context warnings
    const contextMatch = content.match(/Context at (\d+)%/);
    if (contextMatch) {
      return { icon: '⚠', summary: `Context ${contextMatch[1]}%` };
    }

    // Reply from specialist
    const replyMatch = content.match(/Reply from (\w+) \(([^)]+)\):\s*(.+)/);
    if (replyMatch) {
      return { icon: '💬', summary: `${replyMatch[1]}: ${replyMatch[3].slice(0, 50)}` };
    }

    // Status reminder
    if (content.includes('Consider setting a session status')) {
      return { icon: '📋', summary: 'Status reminder' };
    }

    // Generic SYS category extraction
    const catMatch = content.match(/\[CLAUDE OS SYS:\s*(\w+)\]:\s*([^\n]+)/);
    if (catMatch) {
      const category = catMatch[1];
      const title = catMatch[2].slice(0, 60);
      const icons: Record<string, string> = {
        WARNING: '⚠',
        NOTIFICATION: '📣',
        ACTION: '⚡',
        INFO: 'ℹ',
      };
      return { icon: icons[category] || '•', summary: title };
    }
  }

  // Default
  return { icon: '•', summary: 'System message' };
}
