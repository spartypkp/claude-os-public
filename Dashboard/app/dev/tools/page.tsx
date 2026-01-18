'use client';

import { ToolChip } from '@/components/transcript/tools/ToolChip';
import { useState } from 'react';
import {
  FileText, FilePlus, FileEdit, Terminal, Search, Folder, Globe, Download,
  GitBranch, ListChecks, HardHat, Contact, Star, Network, Server, Timer,
  Radio, RefreshCw, CheckCircle, Bell, Moon, PieChart, PenLine,
  Mic, BookOpen, Code, Calendar, MessageSquare, Mail, AudioLines
} from 'lucide-react';

/**
 * Dev Tools Preview Page
 *
 * Preview all ClaudePanel tool renderings with mock data.
 * Useful for iterating on tool UI/UX without needing real Claude conversations.
 */

// Tool categories with their tools and mock data
const TOOL_CATEGORIES = {
  'Claude Code Native': [
    {
      name: 'Read',
      icon: FileText,
      color: 'var(--color-cyan)',
      mockInput: { file_path: '/path/to/claude-os/Desktop/TODAY.md' },
      mockResult: '1\t---\n2\ttype: memory\n3\t---\n4\t\n5\t# Today\n6\t\n7\t*Monday, January 13, 2026*',
    },
    {
      name: 'Write',
      icon: FilePlus,
      color: 'var(--color-warning)',
      mockInput: {
        file_path: '/path/to/claude-os/Desktop/working/new-feature.md',
        content: '# New Feature\n\nBuilding a preview page for all tool types...'
      },
      mockResult: 'File written successfully',
    },
    {
      name: 'Edit',
      icon: FileEdit,
      color: 'var(--color-warning)',
      mockInput: {
        file_path: '/path/to/claude-os/Dashboard/components/ToolChip.tsx',
        old_string: 'const collapsed = true',
        new_string: 'const collapsed = false'
      },
      mockResult: 'Edit successful',
    },
    {
      name: 'Bash',
      icon: Terminal,
      color: 'var(--color-primary)',
      mockInput: {
        command: 'cd Dashboard && npm run build',
        description: 'Build the Dashboard production bundle'
      },
      mockResult: '> Dashboard@0.1.0 build\n> next build\n\n✓ Compiled successfully',
    },
    {
      name: 'Grep',
      icon: Search,
      color: 'var(--color-info)',
      mockInput: { pattern: 'ToolChip', path: 'Dashboard/' },
      mockResult: 'Dashboard/components/transcript/tools/ToolChip.tsx\nDashboard/app/dev/tools/page.tsx',
    },
    {
      name: 'Glob',
      icon: Folder,
      color: 'var(--color-cyan)',
      mockInput: { pattern: '**/*.tsx' },
      mockResult: 'Dashboard/app/page.tsx\nDashboard/app/dev/tools/page.tsx\nDashboard/components/ToolChip.tsx',
    },
    {
      name: 'WebSearch',
      icon: Globe,
      color: 'var(--color-success)',
      mockInput: { query: 'Next.js 15 app router documentation' },
      mockResult: 'Found 10 results about Next.js app router...',
    },
    {
      name: 'WebFetch',
      icon: Download,
      color: 'var(--color-success)',
      mockInput: {
        url: 'https://nextjs.org/docs',
        prompt: 'Extract main features'
      },
      mockResult: 'Fetched and processed content from nextjs.org/docs',
    },
    {
      name: 'Task',
      icon: GitBranch,
      color: 'var(--color-primary)',
      mockInput: {
        description: 'Build dev tools page',
        subagent_type: 'Explore',
        prompt: 'Find all tool rendering components'
      },
      mockResult: 'Agent spawned successfully',
    },
    {
      name: 'TodoWrite',
      icon: ListChecks,
      color: 'var(--color-primary)',
      mockInput: {
        todos: [
          { content: 'Create dev tools page', status: 'completed' },
          { content: 'Add all tool categories', status: 'in_progress' },
          { content: 'Test with mock data', status: 'pending' },
        ]
      },
      mockResult: 'Updated 3 tasks',
    },
  ],
  'MCP Life System': [
    {
      name: 'worker',
      icon: HardHat,
      color: '#14b8a6',
      mockInput: {
        operation: 'create',
        instructions: 'Research Anthropic FDE interview process and compile key insights'
      },
      mockResult: JSON.stringify({ success: true, worker_id: 'abc12345-def6' }),
    },
    {
      name: 'contact',
      icon: Contact,
      color: '#06b6d4',
      mockInput: {
        operation: 'search',
        query: 'Alex'
      },
      mockResult: JSON.stringify({ success: true, contacts: [{ name: 'Alex Bricken', company: 'Anthropic' }] }),
    },
    {
      name: 'priority',
      icon: Star,
      color: '#f59e0b',
      mockInput: {
        operation: 'create',
        content: 'Build dev tools preview page',
        level: 'medium'
      },
      mockResult: JSON.stringify({ success: true, id: 'priority-123' }),
    },
    {
      name: 'team',
      icon: Network,
      color: '#8b5cf6',
      mockInput: {
        operation: 'spawn',
        role: 'builder',
        task: 'Build the dev tools page'
      },
      mockResult: JSON.stringify({ success: true, session_id: 'builder-abc12345' }),
    },
    {
      name: 'service',
      icon: Server,
      color: '#64748b',
      mockInput: {
        operation: 'restart',
        name: 'backend'
      },
      mockResult: 'Backend service restarted successfully',
    },
    {
      name: 'timer',
      icon: Timer,
      color: '#ec4899',
      mockInput: {
        operation: 'start',
        minutes: 25,
        label: 'Focus block'
      },
      mockResult: JSON.stringify({ success: true, timer_id: 'timer-123' }),
    },
    {
      name: 'status',
      icon: Radio,
      color: 'var(--color-claude)',
      mockInput: { text: 'Building dev tools page' },
      mockResult: 'Status updated',
    },
    {
      name: 'reset',
      icon: RefreshCw,
      color: '#f97316',
      mockInput: {
        summary: 'Dev tools page complete, ready for testing',
        path: 'Desktop/reset.md',
        reason: 'context_low'
      },
      mockResult: 'Session reset initiated',
    },
    {
      name: 'done',
      icon: CheckCircle,
      color: '#22c55e',
      mockInput: { summary: 'Dev tools preview page complete' },
      mockResult: 'Session ended successfully',
    },
    {
      name: 'ping',
      icon: Bell,
      color: '#eab308',
      mockInput: { message: 'Check on the dev tools page progress' },
      mockResult: 'Notification sent',
    },
    {
      name: 'log',
      icon: PenLine,
      color: '#64748b',
      mockInput: {
        section: 'system',
        content: 'Built dev tools preview page with all tool categories'
      },
      mockResult: 'Logged to TODAY.md',
    },
  ],
  'MCP Job Search': [
    {
      name: 'mock',
      icon: Mic,
      color: '#a855f7',
      mockInput: {
        operation: 'add',
        partner: 'Ethan',
        type: 'technical'
      },
      mockResult: JSON.stringify({ success: true, mock_id: 'mock-123' }),
    },
    {
      name: 'dsa',
      icon: BookOpen,
      color: '#8b5cf6',
      mockInput: {
        operation: 'practice',
        topic: 'Binary Trees'
      },
      mockResult: JSON.stringify({ success: true, session_id: 'dsa-session-123' }),
    },
    {
      name: 'leetcode',
      icon: Code,
      color: '#7c3aed',
      mockInput: {
        domain: 'impl',
        operation: 'start',
        problem: 226
      },
      mockResult: JSON.stringify({ success: true, attempt_id: 'attempt-123' }),
    },
  ],
  'MCP Apple': [
    {
      name: 'calendar',
      icon: Calendar,
      color: '#3b82f6',
      mockInput: {
        operation: 'create',
        title: 'Team standup',
        start_time: '2026-01-13T10:00:00',
        end_time: '2026-01-13T10:30:00'
      },
      mockResult: JSON.stringify({ success: true, event_id: 'cal-event-123' }),
    },
    {
      name: 'messages',
      icon: MessageSquare,
      color: '#22c55e',
      mockInput: {
        operation: 'send',
        phone_number: '+1234567890',
        message: 'Running 5 min late to standup'
      },
      mockResult: 'Message sent successfully',
    },
    {
      name: 'mail',
      icon: Mail,
      color: '#ef4444',
      mockInput: {
        operation: 'search',
        search_term: 'interview schedule'
      },
      mockResult: 'Found 3 emails matching "interview schedule"',
    },
  ],
  'MCP Voice': [
    {
      name: 'converse',
      icon: AudioLines,
      color: '#f97316',
      mockInput: {
        message: 'Good morning! Ready to start the day?',
        wait_for_response: true
      },
      mockResult: 'Voice conversation initiated',
    },
  ],
  'Errors': [
    {
      name: 'Read',
      icon: FileText,
      color: 'var(--color-cyan)',
      mockInput: { file_path: '/nonexistent/file.txt' },
      mockResult: 'Error: File not found at /nonexistent/file.txt',
    },
    {
      name: 'Bash',
      icon: Terminal,
      color: 'var(--color-primary)',
      mockInput: {
        command: 'npm run invalid-script',
        description: 'Run invalid npm script'
      },
      mockResult: 'Error: Script "invalid-script" not found',
    },
  ],
  'Running State': [
    {
      name: 'worker',
      icon: HardHat,
      color: '#14b8a6',
      mockInput: {
        operation: 'create',
        instructions: 'Long-running research task that takes several minutes...'
      },
      mockResult: undefined, // No result = running
    },
    {
      name: 'WebSearch',
      icon: Globe,
      color: 'var(--color-success)',
      mockInput: { query: 'Claude Code documentation 2026' },
      mockResult: undefined,
    },
  ],
};

// System message variants
const SYSTEM_MESSAGES = [
  {
    icon: '⎋',
    summary: 'Interrupted',
    content: '[Request interrupted by user]\n\nContinuing from previous state...',
  },
  {
    icon: '📍',
    summary: 'Ping: builder-a12',
    content: '[PING from builder] Check on the API refactor progress',
  },
  {
    icon: '↻',
    summary: 'Handoff: context_low',
    content: '[AUTO-HANDOFF] Previous session handed off\nReason: context_low\n\nRead Desktop/reset.md for context.',
  },
  {
    icon: '⏰',
    summary: 'Workers complete',
    content: '📬 Task Complete\n\nBackground workers have finished. Reports are in Desktop/sessions/.',
  },
  {
    icon: '▶',
    summary: 'Session started',
    content: 'SessionStart:startup hook success\n\nCore memory files loaded automatically.',
  },
  {
    icon: '⚙',
    summary: 'Session context loaded',
    content: '<session-role>\n# Builder\n\nYou\'re the craftsman who turns blueprints into working software...',
  },
  {
    icon: '📋',
    summary: 'System reminder',
    content: '<system-reminder>\nThis is a reminder about file discipline in Desktop/working/...',
  },
  {
    icon: '⚡',
    summary: 'Skill: playwright-skill',
    content: 'Base directory for this skill:\n$HOME/.claude/skills/playwright-skill\n\nARGUMENTS: --url http://localhost:3000',
  },
];

export default function DevToolsPage() {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (key: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--surface-base)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-xl font-semibold">Tool Preview Dev Page</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Preview all ClaudePanel tool renderings with mock data
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tool Categories */}
        <div className="space-y-8">
          {Object.entries(TOOL_CATEGORIES).map(([category, tools]) => (
            <div key={category} className="space-y-4">
              {/* Category Header */}
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium text-[var(--text-primary)]">{category}</h2>
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </div>

              {/* Tools Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tools.map((tool, idx) => {
                  const key = `${category}-${tool.name}-${idx}`;
                  return (
                    <div
                      key={key}
                      className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)]"
                    >
                      {/* Tool Info */}
                      <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2">
                          <tool.icon className="w-4 h-4" style={{ color: tool.color }} />
                          <span className="font-mono text-sm font-medium">{tool.name}</span>
                        </div>
                      </div>

                      {/* Tool Chip */}
                      <ToolChip
                        toolName={tool.name}
                        formattedName={tool.name}
                        icon={tool.icon}
                        color={tool.color}
                        toolInput={tool.mockInput}
                        resultContent={tool.mockResult}
                        isExpanded={expandedTools.has(key)}
                        onToggle={() => toggleTool(key)}
                      />

                      {/* Mock Data Preview */}
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                          View mock data
                        </summary>
                        <div className="mt-2 space-y-2">
                          <div>
                            <div className="text-[var(--text-muted)] mb-1">Input:</div>
                            <pre className="bg-[var(--surface-muted)] p-2 rounded text-[10px] overflow-x-auto">
                              {JSON.stringify(tool.mockInput, null, 2)}
                            </pre>
                          </div>
                          {tool.mockResult !== undefined && (
                            <div>
                              <div className="text-[var(--text-muted)] mb-1">Result:</div>
                              <pre className="bg-[var(--surface-muted)] p-2 rounded text-[10px] overflow-x-auto">
                                {tool.mockResult}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* System Messages Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">System Messages</h2>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SYSTEM_MESSAGES.map((msg, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)]"
                >
                  {/* System Message Preview */}
                  <div className="flex items-start gap-2 py-1 px-2 rounded-md bg-[var(--surface-muted)] text-[11px] text-[var(--text-muted)]">
                    <span className="flex-shrink-0">{msg.icon}</span>
                    <span className="flex-1">{msg.summary}</span>
                  </div>

                  {/* Full Content */}
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                      View full content
                    </summary>
                    <pre className="mt-2 bg-[var(--surface-muted)] p-2 rounded text-[10px] overflow-x-auto whitespace-pre-wrap">
                      {msg.content}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
