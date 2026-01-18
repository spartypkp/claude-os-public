/**
 * System Message Detection
 *
 * Patterns for identifying and summarizing injected system messages
 * that appear as "user" messages in the transcript but are actually
 * hook injections, handoffs, worker notifications, etc.
 */

/**
 * Patterns that indicate a message is a system injection, not a real user message
 */
export const SYSTEM_MESSAGE_PATTERNS = [
  '[AUTO-HANDOFF]',
  'Courtesy System Wakeup',
  '<session-mode>',
  '<session-role>',
  '<system-reminder>',
  'Previous session handed off',
  'Background worker',
  '📬 Task',
  'SessionStart:',
  '[Request interrupted by user]',
  'Request interrupted by user',
  '[PING from',
  'Base directory for this skill:',  // Skill invocation
  'ARGUMENTS:',                       // Skill arguments injection
] as const;

/**
 * Check if a "user message" is actually a system injection
 */
export function isSystemMessage(content: string): boolean {
  return SYSTEM_MESSAGE_PATTERNS.some(pattern => content.includes(pattern));
}

export interface SystemMessageSummary {
  icon: string;
  summary: string;
}

/**
 * Extract a concise summary from system message content
 */
export function summarizeSystemMessage(content: string): SystemMessageSummary {
  // User interrupt
  if (content.includes('Request interrupted by user') || content.includes('[Request interrupted by user]')) {
    return { icon: '⎋', summary: 'Interrupted' };
  }

  // Ping from another session
  if (content.includes('[PING from')) {
    const sessionMatch = content.match(/\[PING from (\w+)\]/);
    const sessionId = sessionMatch ? sessionMatch[1].slice(0, 8) : 'session';
    return { icon: '📍', summary: `Ping: ${sessionId}` };
  }

  // Handoff
  if (content.includes('[AUTO-HANDOFF]')) {
    const reasonMatch = content.match(/Reason:\s*(\w+)/);
    const reason = reasonMatch ? reasonMatch[1] : 'handoff';
    return { icon: '↻', summary: `Handoff: ${reason}` };
  }

  // Worker completion
  if (content.includes('Courtesy System Wakeup') || content.includes('📬 Task')) {
    return { icon: '⏰', summary: 'Workers complete' };
  }

  // Session start with context
  if (content.includes('SessionStart:')) {
    return { icon: '▶', summary: 'Session started' };
  }

  // Session mode/role injection
  if (content.includes('<session-mode>') || content.includes('<session-role>')) {
    return { icon: '⚙', summary: 'Session context loaded' };
  }

  // System reminder
  if (content.includes('<system-reminder>')) {
    return { icon: '📋', summary: 'System reminder' };
  }

  // Background worker
  if (content.includes('Background worker')) {
    return { icon: '🔄', summary: 'Background worker update' };
  }

  // Skill invocation
  if (content.includes('Base directory for this skill:')) {
    // Try to extract skill name from path like ".../skills/playwright-skill"
    const pathMatch = content.match(/skills\/([^\/\n]+)/);
    const skillName = pathMatch ? pathMatch[1] : 'skill';
    return { icon: '⚡', summary: `Skill: ${skillName}` };
  }

  // Default
  return { icon: '•', summary: 'System message' };
}
