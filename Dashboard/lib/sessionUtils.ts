/**
 * Shared session utilities for consistent styling across Activity pages.
 *
 * Provides role/mode configurations, icons, and helper functions
 * used by ActivityTodayView, ActivitySessionCard, and SessionDetailPage.
 */

import {
  Archive,
  BookOpen,
  Brain,
  Briefcase,
  CircleDollarSign,
  Code2,
  Crosshair,
  FolderGit2,
  GraduationCap,
  Lightbulb,
  Telescope,
  LucideIcon,
} from 'lucide-react';
import { ActiveSession, SessionRole, SessionMode } from './types';

// =========================================
// ROLE CONFIGURATION
// =========================================

// All roles use Claude's orange (#da7756). Icons differentiate roles, not colors.
const CLAUDE_COLOR = 'text-[#da7756]';
const CLAUDE_BG = 'bg-[#da7756]/10';
const CLAUDE_RING = 'ring-[#da7756]/30';

export interface RoleConfig {
  label: string;
  description?: string; // Short one-liner for spawn dropdown
  icon: LucideIcon;
  isLogo?: boolean;    // Chief uses Claude logo SVG instead of icon
  color: string;       // Tailwind text color class
  bgColor: string;     // Tailwind background color class
  ringColor: string;   // For focus/active states
}

/**
 * Single source of truth for role icons and colors.
 * All roles are orange (Claude brand). Icons distinguish roles.
 */
export const ROLE_CONFIGS: Record<string, RoleConfig> = {
  chief: {
    label: 'Chief',
    icon: Crosshair,    // Unused — Chief renders ClaudeLogo SVG
    isLogo: true,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  builder: {
    label: 'Builder',
    description: 'Code, infrastructure, debugging',
    icon: Code2,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  writer: {
    label: 'Writer',
    description: 'Writing, analysis, sustained focus',
    icon: BookOpen,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  project: {
    label: 'Project',
    description: 'External codebases and repos',
    icon: FolderGit2,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  idea: {
    label: 'Idea',
    description: 'Brainstorming, design, planning',
    icon: Lightbulb,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  researcher: {
    label: 'Researcher',
    description: 'Investigations and synthesis',
    icon: Telescope,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  curator: {
    label: 'Curator',
    description: 'Audits, organization, accuracy',
    icon: Archive,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  // Custom roles
  trainer: {
    label: 'Trainer',
    description: 'Tutoring and skill development',
    icon: GraduationCap,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  money: {
    label: 'Money',
    description: 'Trading strategies and analysis',
    icon: CircleDollarSign,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
  summarizer: {
    label: 'Memory Agent',
    icon: Brain,
    color: CLAUDE_COLOR,
    bgColor: CLAUDE_BG,
    ringColor: CLAUDE_RING,
  },
};

// Default/fallback for unknown roles
const DEFAULT_ROLE_CONFIG: RoleConfig = {
  label: 'Session',
  icon: Crosshair,
  color: CLAUDE_COLOR,
  bgColor: CLAUDE_BG,
  ringColor: CLAUDE_RING,
};

// =========================================
// MODE CONFIGURATION
// =========================================

export interface ModeConfig {
  label: string;
  color: string;       // Tailwind text color class
  bgColor: string;     // Tailwind background color class
  borderColor: string; // Tailwind border color class
  dotColor: string;    // For activity indicator dot
}

export const MODE_CONFIGS: Record<string, ModeConfig> = {
  interactive: {
    label: 'Interactive',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    dotColor: 'bg-green-400',
  },
  background: {
    label: 'Background',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    dotColor: 'bg-amber-400',
  },
  mission: {
    label: 'Mission',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    dotColor: 'bg-purple-400',
  },
};

// Default for unknown modes
const DEFAULT_MODE_CONFIG: ModeConfig = MODE_CONFIGS.interactive;

// =========================================
// HELPER FUNCTIONS
// =========================================

/**
 * Get role configuration for a session.
 * Falls back to DEFAULT_ROLE_CONFIG for unknown roles.
 */
export function getRoleConfig(role?: SessionRole | string | null): RoleConfig {
  if (role && ROLE_CONFIGS[role]) {
    return ROLE_CONFIGS[role];
  }
  // For mission names or unknown roles, return default with custom label
  if (role) {
    return {
      ...DEFAULT_ROLE_CONFIG,
      label: role,
    };
  }
  return DEFAULT_ROLE_CONFIG;
}

/**
 * Get mode configuration for a session.
 * Falls back to 'interactive' for unknown modes.
 */
export function getModeConfig(mode?: SessionMode | string | null): ModeConfig {
  if (mode && MODE_CONFIGS[mode]) {
    return MODE_CONFIGS[mode];
  }
  return DEFAULT_MODE_CONFIG;
}

/**
 * Get the display name for a session based on its role.
 */
export function getSessionDisplayName(session: ActiveSession): string {
  // Prefer new role field, fall back to legacy session_subtype
  const role = session.role || session.session_subtype;

  if (!role) return 'Claude Session';

  const config = getRoleConfig(role);
  return config.label;
}

/**
 * Get the role for a session (handles legacy field fallback).
 */
export function getSessionRole(session: ActiveSession): string | undefined {
  return session.role || session.session_subtype;
}

/**
 * Get the mode for a session (handles legacy field fallback).
 */
export function getSessionMode(session: ActiveSession): SessionMode {
  if (session.mode) return session.mode;
  if (session.session_type === 'mission') return 'mission';
  return 'interactive';
}

/**
 * Check if a session is currently active (not ended).
 */
export function isSessionActive(session: ActiveSession): boolean {
  return !session.ended_at;
}

/**
 * Calculate session duration in a human-readable format.
 */
export function getSessionDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();

  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

/**
 * Get worker statistics for a session.
 */
export function getWorkerStats(session: ActiveSession): {
  total: number;
  running: number;
  needsReview: number;
  activeCount: number;
} {
  const workers = session.workers || [];

  const running = workers.filter(w => w.status === 'running').length;
  const needsReview = workers.filter(w =>
    w.status === 'complete' ||
    w.status === 'complete_unacked' ||
    w.status === 'failed' ||
    w.status === 'failed_unacked'
  ).length;
  const activeCount = workers.filter(w =>
    w.status === 'pending' ||
    w.status === 'running' ||
    w.status === 'awaiting_clarification'
  ).length;

  return {
    total: workers.length,
    running,
    needsReview,
    activeCount,
  };
}
