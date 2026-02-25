/**
 * System Message Detection
 *
 * Patterns for identifying and summarizing injected system messages
 * that appear as "user" messages in the transcript but are actually
 * hook injections, handoffs, worker notifications, etc.
 *
 * Message taxonomy:
 *   [SYSTEM:TYPE]  — System-generated notifications, warnings, team messages
 *   [CONTEXT:App]  — Context injections from AttachToChat (email, calendar, etc.)
 *
 * Legacy format [CLAUDE OS SYS: TYPE] kept as fallback for existing transcripts.
 *
 * Icon keys (returned by summarizeSystemMessage) map to Lucide components
 * in TranscriptViewer.tsx via SYSTEM_ICON_MAP.
 */

/**
 * Normalize message content that may arrive in raw API formats.
 * Handles Python list repr: [{'type': 'text', 'text': '...'}]
 */
export function normalizeMessageContent(content: string): string {
  // Python list-of-dicts format from raw transcript: [{'type': 'text', 'text': '...'}]
  // Handle both single and double quoted variants, and truncated content
  const pyMatch = content.match(/^\[\{'type':\s*'text',\s*'text':\s*'([\s\S]+?)'\}\]$/)
    || content.match(/^\[\{"type":\s*"text",\s*"text":\s*"([\s\S]+?)"\}\]$/)
    || content.match(/^\[\{'type':\s*'text',\s*'text':\s*'([\s\S]+)$/);
  if (pyMatch) return pyMatch[1];
  // Strip leading timestamp prefix: [2026-02-22 17:45:35] — injected by hooks/workers
  const tsMatch = content.match(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*/);
  if (tsMatch) return content.slice(tsMatch[0].length);
  return content;
}

/**
 * Patterns that indicate a message is a system injection, not a real user message.
 * Checked via startsWith against trimmed content.
 */
export const SYSTEM_MESSAGE_PATTERNS = [
  // New standardized prefixes
  '[SYSTEM:',           // All system messages
  '[CONTEXT:',          // Context injections from AttachToChat
  // Legacy patterns (fallback for existing transcripts)
  '[AUTO-HANDOFF]',
  'Courtesy System Wakeup',
  '<session-mode>',
  '<session-role>',
  '---\nauto_include:',              // YAML frontmatter with auto_include (precedes session-role)
  '<system-reminder>',
  'Previous session handed off',
  'Background worker',
  'SessionStart:',
  '[Request interrupted by user]',
  'Request interrupted by user',
  '[CLAUDE OS SYS:',               // Legacy system notifications
  '[TEAM \u2192',                   // Legacy team messages
  '[TEAM REQUEST:',                 // Legacy spawn requests
  'Specialist complete',            // Legacy specialist completion
  'Specialist FAILED',              // Legacy specialist failure
  'Base directory for this skill:',  // Skill invocation
  'ARGUMENTS:',                       // Skill arguments injection
  '---\nname:',                        // SKILL.md frontmatter (content block extraction)
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
// NEW FORMAT DETECTION
// =============================================================================

/** Extract type from [SYSTEM:TYPE] prefix. Returns null if not a match. */
export function parseSystemPrefix(content: string): { type: string; body: string } | null {
  const match = content.trimStart().match(/^\[SYSTEM:([\w-]+)\]\s*([\s\S]*)/);
  if (!match) return null;
  return { type: match[1], body: match[2] };
}

/** Extract app name from [CONTEXT:App] prefix. Returns null if not a match. */
export function parseContextPrefix(content: string): { app: string; body: string } | null {
  const match = content.trimStart().match(/^\[CONTEXT:(\w+)\]\s*([\s\S]*)/);
  if (!match) return null;
  return { app: match[1], body: match[2] };
}

/** Check if content is a [CONTEXT:App] message. */
export function isContextMessage(content: string): boolean {
  return content.trimStart().startsWith('[CONTEXT:');
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
 * Handles formats:
 * 1. New: "[SYSTEM:SPECIALIST] complete - builder (0212-1607-builder-83d0349e)"
 * 2. Legacy loop: "Specialist complete - builder (0212-1607-builder-83d0349e)"
 * 3. Legacy bg: "[CLAUDE OS SYS: NOTIFICATION]: Builder 0212-160 complete"
 * 4. New bg via send_system_message: "[SYSTEM:NOTIFY] Builder 0212-160 complete"
 */
export function parseSpecialistNotification(content: string): SpecialistNotification | null {
  // Pattern 1 (new): "[SYSTEM:SPECIALIST] complete/FAILED - role (conversation-id)"
  const newMatch = content.match(/\[SYSTEM:SPECIALIST\] (complete|FAILED) - ([\w-]+) \(([^)]+)\)/);
  if (newMatch) {
    const passed = newMatch[1] === 'complete';
    const role = newMatch[2];
    const sessionId = newMatch[3];
    const bodyStart = content.indexOf('\n\n');
    let body = bodyStart >= 0 ? content.slice(bodyStart + 2) : '';
    let workspace: string | undefined;
    const wsMatch = body.match(/\n\nWorkspace:\s*(.+?)\s*$/);
    if (wsMatch) {
      workspace = wsMatch[1];
      body = body.slice(0, wsMatch.index);
    }
    return { role, sessionId, passed, summary: body.trim(), workspace };
  }

  // Pattern 2 (legacy loop): "Specialist complete/FAILED - role (conversation-id)"
  const loopMatch = content.match(/Specialist (complete|FAILED) - ([\w-]+) \(([^)]+)\)/);
  if (loopMatch) {
    const passed = loopMatch[1] === 'complete';
    const role = loopMatch[2];
    const sessionId = loopMatch[3];
    const bodyStart = content.indexOf('\n\n');
    let body = bodyStart >= 0 ? content.slice(bodyStart + 2) : '';
    let workspace: string | undefined;
    const wsMatch = body.match(/\n\nWorkspace:\s*(.+?)\s*$/);
    if (wsMatch) {
      workspace = wsMatch[1];
      body = body.slice(0, wsMatch.index);
    }
    return { role, sessionId, passed, summary: body.trim(), workspace };
  }

  // Pattern 3 (legacy bg): "[CLAUDE OS SYS: NOTIFICATION]: Role shortId complete"
  const bgMatch = content.match(/\[CLAUDE OS SYS: NOTIFICATION\]:\s*(\w+) ([a-f0-9]{8}) complete/);
  if (bgMatch) {
    const role = bgMatch[1].toLowerCase();
    const sessionId = bgMatch[2];
    const bodyStart = content.indexOf('\n\n');
    const summary = bodyStart >= 0 ? content.slice(bodyStart + 2).trim() : '';
    return { role, sessionId, passed: true, summary };
  }

  // Pattern 4 (new bg): "[SYSTEM:NOTIFY] Role shortId complete"
  const newBgMatch = content.match(/\[SYSTEM:NOTIFY\]\s*(\w+) ([a-f0-9]{8}) complete/);
  if (newBgMatch) {
    const role = newBgMatch[1].toLowerCase();
    const sessionId = newBgMatch[2];
    const bodyStart = content.indexOf('\n\n');
    const summary = bodyStart >= 0 ? content.slice(bodyStart + 2).trim() : '';
    return { role, sessionId, passed: true, summary };
  }

  return null;
}

/**
 * Check if a system message is a specialist completion notification.
 */
export function isSpecialistNotification(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('[SYSTEM:SPECIALIST]') ||
    trimmed.startsWith('Specialist complete') ||
    trimmed.startsWith('Specialist FAILED') ||
    /^\[CLAUDE OS SYS: NOTIFICATION\]:\s*\w+ [a-f0-9]{8} complete/.test(trimmed) ||
    /^\[SYSTEM:NOTIFY\]\s*\w+ [a-f0-9]{8} complete/.test(trimmed);
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
 * Handles both new [SYSTEM:NOTIFY] and legacy [CLAUDE OS SYS:] prefix.
 */
export function parseSpecialistReply(content: string): SpecialistReply | null {
  // New format: [SYSTEM:NOTIFY] Reply from role (id): message
  const newMatch = content.match(/\[SYSTEM:NOTIFY\]\s*Reply from (\w[\w-]*) \(([^)]+)\):\s*([\s\S]+)/);
  if (newMatch) {
    return {
      role: newMatch[1].toLowerCase(),
      sessionId: newMatch[2],
      message: newMatch[3].trim(),
    };
  }
  // Legacy format: [CLAUDE OS SYS: ...]: Reply from role (id): message
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
 */
export function isSpecialistReply(content: string): boolean {
  const trimmed = content.trimStart();
  return (trimmed.startsWith('[SYSTEM:NOTIFY]') && trimmed.includes('Reply from ')) ||
    (trimmed.startsWith('[CLAUDE OS SYS:') && trimmed.includes('Reply from '));
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
 * New: [SYSTEM:TEAM] from Source (conv_id) → Target: message
 * Legacy: [TEAM → Target] from Source: message
 */
export function isTeamMessage(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('[SYSTEM:TEAM]') || trimmed.startsWith('[TEAM \u2192');
}

/**
 * Parse a team message into structured parts.
 */
export function parseTeamMessage(content: string): TeamMessage | null {
  // New format: [SYSTEM:TEAM] from Source (conv_id) → Target: message
  const newMatch = content.match(/\[SYSTEM:TEAM\] from ([\w-]+) \([^)]*\) \u2192 ([\w-]+):\s*([\s\S]+)/);
  if (newMatch) {
    return {
      sourceRole: newMatch[1].toLowerCase(),
      targetRole: newMatch[2].toLowerCase(),
      message: newMatch[3].trim(),
    };
  }
  // Legacy format: [TEAM → Target] from Source: message
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
 * New: [SYSTEM:TEAM-REQUEST] Role wants OtherRole for "purpose"
 * Legacy: [TEAM REQUEST: Role wants OtherRole for "purpose"]
 */
export function isTeamRequest(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('[SYSTEM:TEAM-REQUEST]') || trimmed.startsWith('[TEAM REQUEST:');
}

/**
 * Parse a team spawn request into structured parts.
 */
export function parseTeamRequest(content: string): TeamRequest | null {
  // New format: [SYSTEM:TEAM-REQUEST] Role wants OtherRole for "purpose"
  const newMatch = content.match(/\[SYSTEM:TEAM-REQUEST\]\s*([\w-]+) wants ([\w-]+) for "([^"]+)"/);
  if (newMatch) {
    return {
      requestingRole: newMatch[1].toLowerCase(),
      requestedRole: newMatch[2].toLowerCase(),
      purpose: newMatch[3],
    };
  }
  // Legacy format: [TEAM REQUEST: Role wants OtherRole for "purpose"]
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
  /** Lucide icon key (maps to component in renderer) or 'dot' for default */
  icon: string;
  summary: string;
}

/**
 * Extract a concise summary from system message content.
 * Icon values are Lucide component keys (e.g., 'clock', 'bell', 'alert-triangle')
 * that map to actual components via SYSTEM_ICON_MAP in TranscriptViewer.tsx.
 */
export function summarizeSystemMessage(content: string): SystemMessageSummary {
  const trimmed = content.trimStart();

  // ─── New format: [SYSTEM:TYPE] ───
  const systemParsed = parseSystemPrefix(trimmed);
  if (systemParsed) {
    const { type, body } = systemParsed;
    const typeIcons: Record<string, string> = {
      'WAKE': 'clock',
      'CRON': 'timer',
      'EVENT': 'calendar',
      'LATE': 'clock',
      'FORCE-HANDOFF': 'alert-triangle',
      'HANDOFF': 'refresh-cw',
      'NOTIFY': 'bell',
      'WARNING': 'alert-triangle',
      'ACTION': 'zap',
      'INFO': 'info',
      'TEAM': 'arrow-right',
      'TEAM-REQUEST': 'user-plus',
      'SPECIALIST': 'check',
    };
    const icon = typeIcons[type] || 'dot';

    // Special handling for specific types
    if (type === 'WAKE') return { icon, summary: 'Wake' };
    if (type === 'SPECIALIST') {
      const parsed = parseSpecialistNotification(trimmed);
      if (parsed) {
        const status = parsed.passed ? 'complete' : 'FAILED';
        return { icon: parsed.passed ? 'check' : 'x-circle', summary: `${parsed.role} ${status}` };
      }
    }
    if (type === 'TEAM') {
      const parsed = parseTeamMessage(trimmed);
      if (parsed) return { icon, summary: `${parsed.sourceRole}: ${parsed.message.slice(0, 50)}` };
    }
    if (type === 'TEAM-REQUEST') {
      const parsed = parseTeamRequest(trimmed);
      if (parsed) return { icon, summary: `${parsed.requestingRole} wants ${parsed.requestedRole}` };
    }
    if (type === 'WARNING') {
      const contextMatch = body.match(/Context at (\d+)%/);
      if (contextMatch) return { icon: 'alert-triangle', summary: `Context ${contextMatch[1]}%` };
    }
    if (type === 'NOTIFY') {
      const replyMatch = body.match(/Reply from (\w+) \(([^)]+)\):\s*(.+)/);
      if (replyMatch) return { icon: 'message-circle', summary: `${replyMatch[1]}: ${replyMatch[3].slice(0, 50)}` };
      if (body.includes('Consider setting a session status')) return { icon: 'info', summary: 'Status reminder' };
    }
    if (type === 'INFO') {
      if (body.includes('Consider setting a session status')) return { icon: 'info', summary: 'Status reminder' };
      if (body.includes('Session context loaded')) return { icon: 'play', summary: 'Session started' };
    }

    return { icon, summary: body.split('\n')[0].slice(0, 60) || type };
  }

  // ─── [CONTEXT:App] ───
  const contextParsed = parseContextPrefix(trimmed);
  if (contextParsed) {
    return {
      icon: 'external-link',
      summary: `${contextParsed.app}: ${contextParsed.body.split('\n')[0].slice(0, 50)}`,
    };
  }

  // ─── Legacy patterns (fallback) ───

  // User interrupt
  if (trimmed.startsWith('Request interrupted by user') || trimmed.startsWith('[Request interrupted by user]')) {
    return { icon: 'x-circle', summary: 'Interrupted' };
  }

  // Legacy team message
  if (trimmed.startsWith('[TEAM \u2192')) {
    const parsed = parseTeamMessage(trimmed);
    if (parsed) return { icon: 'arrow-right', summary: `${parsed.sourceRole}: ${parsed.message.slice(0, 50)}` };
    return { icon: 'arrow-right', summary: 'Team message' };
  }

  // Legacy team spawn request
  if (trimmed.startsWith('[TEAM REQUEST:')) {
    const parsed = parseTeamRequest(trimmed);
    if (parsed) return { icon: 'user-plus', summary: `${parsed.requestingRole} wants ${parsed.requestedRole}` };
    return { icon: 'user-plus', summary: 'Spawn request' };
  }

  // Handoff
  if (trimmed.startsWith('[AUTO-HANDOFF]')) {
    const reasonMatch = content.match(/Reason:\s*(\w+)/);
    const reason = reasonMatch ? reasonMatch[1] : 'handoff';
    return { icon: 'refresh-cw', summary: `Handoff: ${reason}` };
  }

  // Worker completion
  if (trimmed.startsWith('Courtesy System Wakeup')) {
    return { icon: 'clock', summary: 'Workers complete' };
  }

  // Session start with context
  if (trimmed.startsWith('SessionStart:')) {
    return { icon: 'play', summary: 'Session started' };
  }

  // Session mode/role injection
  if (trimmed.startsWith('<session-mode>') || trimmed.startsWith('<session-role>') || trimmed.startsWith('---\nauto_include:')) {
    const roleMatch = content.match(/# (\w[\w\s-]*)/);
    const roleName = roleMatch ? roleMatch[1].trim() : '';
    const modeMatch = content.match(/# \w+:\s*(Interactive|Preparation|Implementation|Verification)/i)
      || content.match(/mode[:\s]+(interactive|preparation|implementation|verification)/i);
    const mode = modeMatch ? modeMatch[1] : '';
    const descMatch = content.match(/<session-description>\s*([\s\S]*?)\s*<\/session-description>/);
    const description = descMatch ? descMatch[1].trim().split('\n')[0].slice(0, 80) : '';
    const parts = [roleName || 'Session'].filter(Boolean);
    if (mode) parts.push(mode.toLowerCase());
    if (description) parts.push(`\u2014 ${description}`);
    return { icon: 'play', summary: parts.join(' ') };
  }

  // Task notification (subagent result)
  if (trimmed.startsWith('<task-notification>')) {
    const parsed = parseTaskNotification(trimmed);
    if (parsed) {
      const statusMark = parsed.status === 'completed' ? '\u2713' : '\u2717';
      return { icon: 'zap', summary: `${statusMark} ${parsed.summary.slice(0, 60)}` };
    }
    return { icon: 'zap', summary: 'Agent result' };
  }

  // System reminder
  if (trimmed.startsWith('<system-reminder>')) {
    return { icon: 'info', summary: 'System reminder' };
  }

  // Background worker
  if (trimmed.startsWith('Background worker')) {
    return { icon: 'refresh-cw', summary: 'Background worker update' };
  }

  // Memory Agent (summarizer) prompt
  if (trimmed.startsWith("You're writing a handoff document")) {
    return { icon: 'brain', summary: 'Memory Agent prompt' };
  }

  // Skill invocation (all variants)
  if (trimmed.startsWith('Base directory for this skill:') || trimmed.startsWith('ARGUMENTS:')) {
    const pathMatch = content.match(/skills\/([^\/\n]+)/);
    const skillName = pathMatch ? pathMatch[1] : 'skill';
    return { icon: 'zap', summary: `Skill: ${skillName}` };
  }
  if (trimmed.startsWith('---\nname:')) {
    const nameMatch = trimmed.match(/^---\nname:\s*(.+)/);
    const skillName = nameMatch ? nameMatch[1].trim() : 'skill';
    return { icon: 'zap', summary: `Skill: ${skillName}` };
  }

  // Legacy [CLAUDE OS SYS:] messages
  if (trimmed.startsWith('[CLAUDE OS SYS:')) {
    const contextMatch = content.match(/Context at (\d+)%/);
    if (contextMatch) return { icon: 'alert-triangle', summary: `Context ${contextMatch[1]}%` };
    const replyMatch = content.match(/Reply from (\w+) \(([^)]+)\):\s*(.+)/);
    if (replyMatch) return { icon: 'message-circle', summary: `${replyMatch[1]}: ${replyMatch[3].slice(0, 50)}` };
    if (content.includes('Consider setting a session status')) return { icon: 'info', summary: 'Status reminder' };
    const catMatch = content.match(/\[CLAUDE OS SYS:\s*(\w+)\]:\s*([^\n]+)/);
    if (catMatch) {
      const category = catMatch[1];
      const title = catMatch[2].slice(0, 60);
      const icons: Record<string, string> = { WARNING: 'alert-triangle', NOTIFICATION: 'bell', ACTION: 'zap', INFO: 'info' };
      return { icon: icons[category] || 'dot', summary: title };
    }
  }

  // Legacy specialist complete (no prefix)
  if (trimmed.startsWith('Specialist complete') || trimmed.startsWith('Specialist FAILED')) {
    const parsed = parseSpecialistNotification(trimmed);
    if (parsed) {
      const status = parsed.passed ? 'complete' : 'FAILED';
      return { icon: parsed.passed ? 'check' : 'x-circle', summary: `${parsed.role} ${status}` };
    }
  }

  // Default
  return { icon: 'dot', summary: 'System message' };
}
