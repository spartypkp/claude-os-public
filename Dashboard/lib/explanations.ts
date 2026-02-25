/**
 * Explanations for system items in Claude OS.
 * 
 * Each system item (files, apps, widgets, etc.) can have a human-readable
 * explanation that appears in a tooltip. Users can read without AI.
 */

export interface Explanation {
  title: string;
  icon: string;
  category: 'Claude System File' | 'Core Application' | 'Custom Application' | 'Desktop Widget' | 'Life Domain' | 'System';
  description: string;
  details?: string[];
  shortcuts?: { key: string; action: string }[];
}

// Lookup key format:
// - file:{filename} for system files
// - app:{appId} for core apps
// - custom:{appId} for custom apps
// - widget:{widgetType} for widgets
// - domain:{folderName} for life domains
// - ui:{componentId} for UI elements

export const EXPLANATIONS: Record<string, Explanation> = {
  // ============================================
  // CLAUDE SYSTEM FILES
  // ============================================
  'file:TODAY.md': {
    title: 'Daily Memory',
    icon: '📋',
    category: 'Claude System File',
    description: 'Your daily memory file. Claude writes observations, tracks threads, and logs events here throughout the day.',
    details: [
      'Resets each morning at 7:30 AM',
      'Archives to Workspace/logs/',
      'Sections: Context, Day Arc, Chief, System, Focus, Dump, Friction',
    ],
  },
  'file:MEMORY.md': {
    title: 'Persistent Memory',
    icon: '🧠',
    category: 'Claude System File',
    description: "Claude's long-term memory. Contains weekly threads and proven patterns about how you work.",
    details: [
      'Current State: Active threads, things you\'re waiting on',
      'Stable Patterns: Proven knowledge about you',
      'Updated by Chief during weekly review',
    ],
  },
  'file:LIFE.md': {
    title: 'Life Overview',
    icon: '🗺️',
    category: 'Claude System File',
    description: 'Auto-generated overview of your life domains. Shows status, priorities, and important contacts.',
    details: [
      'Generated from LIFE-SPEC.md files',
      'Don\'t edit directly—changes will be overwritten',
      'Updates when domain specs change',
    ],
  },
  'file:IDENTITY.md': {
    title: 'Identity',
    icon: '👤',
    category: 'Claude System File',
    description: 'Core facts about who you are. Values, background, how you work. Claude references this to understand you.',
    details: [
      'Source of truth for personal facts',
      'Updated when you share new information',
      'Informs all Claude interactions',
    ],
  },

  // ============================================
  // CORE APPLICATIONS
  // ============================================
  'app:finder': {
    title: 'Finder',
    icon: '📁',
    category: 'Core Application',
    description: 'Browse and manage Desktop files. Create folders, rename items, move to trash, and open files in editors.',
    shortcuts: [
      { key: 'Space', action: 'Quick Look preview' },
      { key: 'Enter', action: 'Rename selected' },
      { key: 'Cmd+Delete', action: 'Move to Trash' },
    ],
  },
  'app:calendar': {
    title: 'Calendar',
    icon: '📅',
    category: 'Core Application',
    description: 'View your schedule. Events sync from Apple Calendar via iCloud. Claude can add events for you.',
    details: [
      'Shows 7 days of events',
      'Click event for details',
      'Ask Claude to schedule things',
    ],
  },
  'app:contacts': {
    title: 'Contacts',
    icon: '👥',
    category: 'Core Application',
    description: 'People in your life. Search contacts, view details, and see interaction history.',
    details: [
      'Claude tracks who you interact with',
      'Notes and context for each person',
      'Pin important contacts',
    ],
  },
  'app:widgets': {
    title: 'Widget Manager',
    icon: '🧩',
    category: 'Core Application',
    description: 'Add and configure Desktop widgets. Choose from Priorities, Calendar preview, and Active Conversations.',
  },
  'app:settings': {
    title: 'Settings',
    icon: '⚙️',
    category: 'Core Application',
    description: 'Configure Claude OS. Toggle dark mode, adjust preferences.',
  },

  // ============================================
  // DESKTOP WIDGETS
  // ============================================
  'widget:priorities': {
    title: 'Priorities',
    icon: '🎯',
    category: 'Desktop Widget',
    description: 'Your active priorities for today. Claude manages these based on what you\'re working on.',
    details: [
      'Drag to reorder',
      'Click checkbox to complete',
      'Right-click for more options',
    ],
  },
  'widget:calendar': {
    title: 'Calendar Preview',
    icon: '📆',
    category: 'Desktop Widget',
    description: 'Quick view of today\'s events. Shows your schedule at a glance.',
    details: [
      'Updates in real-time',
      'Click to open full Calendar',
    ],
  },
  'widget:sessions': {
    title: 'Active Conversations',
    icon: '🤖',
    category: 'Desktop Widget',
    description: 'Shows which Claudes are currently active. Click to focus a conversation.',
    details: [
      'Chief, System, Focus, Project, Idea',
      'Click conversation to switch to it',
      'Shows current status',
    ],
  },

  // ============================================
  // UI COMPONENTS
  // ============================================
  'ui:trash': {
    title: 'Trash',
    icon: '🗑️',
    category: 'System',
    description: 'Deleted files go here. Drag files to trash or use right-click menu. Files can be restored.',
    details: [
      'Files stay for 30 days',
      'Drag files here to delete',
      'Double-click to view contents',
      'Right-click to empty',
    ],
  },
  'ui:dock': {
    title: 'Dock',
    icon: '🔲',
    category: 'System',
    description: 'Quick access to apps and active sessions. Core Apps open as windows, Custom Apps open fullscreen.',
  },
  'ui:menubar': {
    title: 'Menu Bar',
    icon: '📊',
    category: 'System',
    description: 'System status and quick actions. Shows time, Claude status, and system indicators.',
  },
  'ui:claude-panel': {
    title: 'Claude Panel',
    icon: '💬',
    category: 'System',
    description: 'Chat with your Claude team. Ask questions, give instructions, or just talk.',
    details: [
      'Click Claude icon in Dock to toggle',
      'Attach files for context',
      'Chief coordinates the team',
    ],
  },

  // ============================================
  // CUSTOM APPS (populated dynamically from APP-SPEC.md)
  // ============================================
};

/**
 * Get explanation for a system item.
 * Returns undefined if item doesn't have an explanation (user files, etc.)
 */
export function getExplanation(key: string): Explanation | undefined {
  return EXPLANATIONS[key];
}

/**
 * Check if an item is a system file that has an explanation.
 */
export function isSystemFile(filename: string): boolean {
  return ['TODAY.md', 'MEMORY.md', 'LIFE.md', 'IDENTITY.md'].includes(filename);
}

/**
 * Get explanation key for a file/folder based on its characteristics.
 * Returns undefined if no explanation exists for this item.
 */
export function getExplanationKey(
  name: string,
  type: 'file' | 'directory' | 'app' | 'widget' | 'ui',
  metadata?: {
    hasAppSpec?: boolean;
    hasLifeSpec?: boolean;
    appType?: string;
    widgetType?: string;
  }
): string | undefined {
  // System files
  if (type === 'file' && isSystemFile(name)) {
    return `file:${name}`;
  }

  // Core apps
  if (type === 'app' && metadata?.appType) {
    return `app:${metadata.appType}`;
  }

  // Widgets
  if (type === 'widget' && metadata?.widgetType) {
    return `widget:${metadata.widgetType}`;
  }

  // UI components
  if (type === 'ui') {
    return `ui:${name}`;
  }

  // Custom apps (folders with APP-SPEC.md)
  if (type === 'directory' && metadata?.hasAppSpec) {
    return `custom:${name}`;
  }

  // Life domains (folders with LIFE-SPEC.md) - dynamic, no static explanation
  // Could potentially read from the LIFE-SPEC.md frontmatter

  return undefined;
}

