export interface CalendarEvent {
  id: string;
  summary: string;
  start_ts: string;
  end_ts: string;
  location?: string;
  description?: string;
  all_day: boolean;
  kind?: string;
  tags?: string | string[];
  calendar_id?: string;
  calendar_name?: string;
  organizer_email?: string;
  organizer_name?: string;
  status?: string;
  event_id?: string;
}

export interface AttentionItem {
  title: string;
  kind: string;
  worker_type?: string;
  severity: 'urgent' | 'high' | 'normal' | 'low';
  domain?: string;
  workspace_path?: string;
}

// =========================================
// WORKER TYPES (Background Workers - Agent SDK)
// =========================================

export interface Worker {
  id: string;
  attention_title: string;
  worker_type: string;
  status: 'running' | 'complete' | 'failed';
  domain?: string;
  created_at: string;
  completed_at?: string;
}

// Queued worker (pending/scheduled/blocked)
export interface QueuedWorker {
  id: string;
  worker_type: string;
  title: string;
  status: 'pending';
  domain?: string;
  instructions: string;
  execute_at?: string;
  depends_on: string[];
  queue_reason: 'waiting' | 'scheduled' | 'blocked';
  blocked_by?: string;
  created_at: string;
}

export interface WorkerQueueData {
  timestamp: string;
  workers: QueuedWorker[];
  total: number;
}

export interface Priorities {
  critical: string[];
  medium: string[];
  low: string[];
}

export interface DashboardData {
  timestamp: string;
  schedule: CalendarEvent[];
  attention: AttentionItem[];
  workers: Worker[];
  sessions: {
    count: number;
    active: boolean;
  };
  priorities: Priorities;
}

export interface SystemHealth {
  watcher: { status: string; uptime_seconds?: number };
  executor: { status: string; uptime_seconds?: number };
  dashboard: { status: string; uptime_seconds?: number };
}

export interface MetricsData {
  weight: Array<{ date: string; value: number }>;
  energy: Array<{ date: string; value: number }>;
  anki: Array<{ date: string; completed: boolean }>;
}

// Worker History Types
export interface HistoryWorker {
  id: string;
  worker_type: string;
  title: string;
  status: 'complete' | 'failed' | 'partial' | 'needs_clarification';
  display_status: string;
  domain?: string;
  report_summary?: string;
  created_at: string;
  completed_at?: string;
  workspace_path?: string;
}

export interface WorkerHistoryData {
  timestamp: string;
  workers: HistoryWorker[];
  total: number;
}

export interface WorkerReport {
  id: string;
  worker_type: string;
  title: string;
  status: string;
  instructions?: string;
  report_md?: string;
  report_summary?: string;
  created_at: string;
  completed_at?: string;
  workspace_path?: string;
  system_log_path?: string;
}

// Extended worker type for WorkersView that combines running and history workers
export interface WorkerViewItem {
  id: string;
  title: string;
  worker_type: string;
  status: 'running' | 'complete_unacked' | 'complete_acked' | 'failed_unacked' | 'failed_acked';
  display_status: 'running' | 'complete' | 'failed';
  domain?: string;
  report_summary?: string;
  created_at: string;
  completed_at?: string;
  workspace_path?: string;
  // For running workers - calculated elapsed time
  elapsed_ms?: number;
}

// Files View Types
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  isSystem?: boolean;  // Claude system files/folders (from API)
}

export interface FileContent {
  path: string;
  content: string;
  type: 'markdown' | 'text' | 'code';
  mtime: string;  // ISO timestamp for conflict detection
}

// Contacts View Types
export interface Contact {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface ContactDetail {
  id: string;
  name: string;
  description: string;
  tags: string[];
  content: string;  // Full markdown body of the contact file
}

// Improvements View Types
export type ImprovementStatus = 'active' | 'backlog' | 'completed' | 'wontfix';
export type ImprovementCategory = 'bug' | 'feature' | 'ux' | 'research' | 'cleanup' | 'unclear';
export type ImprovementPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface Improvement {
  id: string;
  title: string;
  description?: string;
  status: ImprovementStatus;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  domain?: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ImprovementsCounts {
  active: number;
  backlog: number;
  completed: number;
  wontfix: number;
}

export interface ImprovementsResponse {
  items: Improvement[];
  counts: ImprovementsCounts;
}

// Stage View Types
export interface StagedItem {
  id: string;
  title: string;
  content_type: 'markdown' | 'mermaid' | 'file' | 'comparison';
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface StageData {
  items: StagedItem[];
  count: number;
}

// Email View Types
export interface Email {
  id: number;
  date: string;
  timestamp: number;
  subject: string;
  from: string;
  from_email: string;
  read: boolean;
  account: string;
  mailbox: string;
  content?: string;
}

export interface EmailDetail extends Email {
  content: string;
}

export interface EmailsResponse {
  emails: Email[];
  count: number;
}

export interface EmailAccount {
  uuid: string;
  email: string;
  name: string;
}

export interface EmailAccountsResponse {
  accounts: EmailAccount[];
  count: number;
}

export interface UnreadCountResponse {
  total: number;
  by_account: Record<string, number>;
  by_mailbox: Record<string, number>;
}

export interface ContactEmailsResponse {
  emails: Email[];
  count: number;
  contact_email: string;
}

// iMessage View Types
export interface IMessageConversation {
  chat_id: number;
  handle_id: string;
  contact_name: string | null;
  display_name: string;
  service: string;
  last_message_date: string;
  last_message_timestamp: number;
  message_count: number;
  unread_count: number;
}

export interface IMessage {
  message_id: number;
  date: string;
  timestamp: number;
  is_from_me: boolean;
  is_read: boolean;
  has_attachment: boolean;
  service: string;
  handle_id: string;
}

export interface IMessagesConversationsResponse {
  conversations: IMessageConversation[];
  count: number;
}

export interface IMessagesUnreadResponse {
  total: number;
  by_conversation: Record<string, number>;
}

export interface IMessagesConversationResponse {
  messages: IMessage[];
  count: number;
  chat_id: number;
}

// =========================================
// SYSTEM VIEW TYPES
// =========================================

export type SystemStatus = 'ok' | 'warning' | 'error' | 'offline';

export interface SystemHealthData {
  backend: {
    api: SystemStatus;
    watcher: SystemStatus;
    watcher_detail?: string;
    executor: SystemStatus;
    executor_detail?: string;
    mission_scheduler?: SystemStatus;
    mission_scheduler_detail?: string;
  };
  database: {
    status: SystemStatus;
    size?: string;
    wal_status: SystemStatus;
    wal_size?: string;
  };
  integrations: {
    apple_calendar: { status: SystemStatus; detail?: string };
    life_mcp: { status: SystemStatus; detail?: string };
    apple_mcp: { status: SystemStatus; detail?: string };
    mail_access: { status: SystemStatus; detail?: string };
  };
  watcher_modules: Array<{
    name: string;
    status: SystemStatus;
    detail?: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
  }>;
}

export interface SystemDocFile {
  path: string;
  name: string;
  lines?: number;
  exists: boolean;
}

export interface SystemDocsData {
  system_prompts: SystemDocFile[];
  roles: SystemDocFile[];
  modes: SystemDocFile[];
  system_specs: SystemDocFile[];
  application_specs: SystemDocFile[];
}

export interface SystemMetricsData {
  workers: {
    last_24h: number;
    last_7d: number;
    last_30d: number;
    total: number;
    success_rate: number;
    avg_duration_minutes: number;
    by_type: Record<string, number>;
  };
  database: {
    size_bytes: number;
    wal_size_bytes: number;
    tables: Record<string, number>;
  };
  recent_failures: Array<{
    id: string;
    type: string;
    failed_at: string;
    reason?: string;
  }>;
}

// Life-focused metrics (not DevOps)
export interface MetricsOverviewData {
  drift_days: number | null;  // Days since last critical priority completed
  completion_rates: {
    critical: number;
    medium: number;
    low: number;
  };
  claude_time_today: number;  // Hours
  worker_success_rate: number;  // Percentage
  priorities_today: {
    critical: { total: number; completed: number };
    medium: { total: number; completed: number };
    low: { total: number; completed: number };
  };
}

// Pattern analysis metrics
export interface MetricsPatternsData {
  work_rhythm: Array<{ day: number; hour: number; count: number }>;
  session_stats: Record<string, {
    count: number;
    avg_duration_mins: number;
    workers_spawned: number;
  }>;
  app_distribution: Array<{ app: string; minutes: number; percentage: number }>;
  weekly_comparison: {
    this_week: { sessions: number; workers: number; priorities_completed: number };
    last_week: { sessions: number; workers: number; priorities_completed: number };
  };
}

export interface SystemConfigData {
  watcher: {
    modules: Record<string, boolean>;
  };
  executor: {
    poll_interval_sec: number;
    batch_size: number;
    check_interval_sec: number;
  };
  sms: {
    enabled: boolean;
    quiet_hours?: { start: string; end: string };
  };
  schema: {
    tables: Array<{
      name: string;
      columns: Array<{
        name: string;
        type: string;
        pk?: boolean;
      }>;
    }>;
    migrations?: Array<{
      name: string;
      applied: boolean;
    }>;
  };
}

// Mission System Types
export interface Mission {
  id: string;
  name: string;
  description: string;
  prompt_path: string;
  recurring: number;
  next_run: string;
  last_run?: string;
  last_status?: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  scheduled_time: string;
}

export interface RunningMission {
  id: string;
  mission_type: string;
  prompt_file?: string;
  started_at: string;
  status: string;
}

export interface RecentExecution {
  id: string;
  mission_type: string;
  prompt_file?: string;
  started_at: string;
  ended_at?: string;
  status: string;
  transcript_path?: string;
  duration_minutes?: number;
}

export interface MissionsResponse {
  scheduled: Mission[];
  running: RunningMission[];
  history: RecentExecution[];
}

// Life Task Types
export interface LifeTask {
  filename: string;
  title: string;
  type: string;
  status: string;
  answered: boolean;
  created_at: string;
  file_path: string;
}

export interface LifeTasksResponse {
  items: LifeTask[];
  total: number;
  pending_count: number;
  answered_count: number;
}

// Block and Memory Types (for Claude view)
export interface BlockData {
  filename: string;
  started: string;
  ended?: string;
  description: string;
  summary?: string;
  files_touched: string[];
}

/**
 * 2-Tier Memory System:
 * 1. TODAY.md (daily) - daily memory, friction, handoffs
 * 2. MEMORY.md (persistent) - Current State (weekly) + Stable Patterns (permanent)
 *
 * Optional: Workspace/working/*.md for deep work scratchpads
 */
export interface MemoryData {
  today: {
    memory_section: string;
    friction_section: string;
    open_loops: string;
  };
  weekly: {
    content: string;
    waiting_on: string;
    current_state: string;
    active_threads: string;
  };
  longterm: {
    content: string;
  };
}

// =========================================
// CLAUDE ACTIVITY TYPES (for dynamic sidebar)
// =========================================

// Session types for classification
export type SessionType = 'interactive' | 'mission';
export type SessionSubtype = 'main' | 'system' | 'focus' | 'custom' | string;

// Active worker (background worker spawned by a session)
export interface ActiveWorker {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'awaiting_clarification' | 'complete' | 'complete_unacked' | 'failed' | 'failed_unacked';
  title: string;
  created_at: string;
}

// Session role/mode taxonomy
export type SessionRole = 'chief' | 'builder' | 'project' | 'deep-work' | 'idea' | string; // string for mission names
export type SessionMode = 'interactive' | 'background' | 'mission';

// Session state for activity indicators
export type SessionState = 'idle' | 'active' | 'tool_active' | 'ended' | null;

// Last tool used by a session (for sidebar display)
export interface LastTool {
  name: string;
  preview: string;
  timestamp?: number;
}

// Active Claude session (Claude Code CLI instance)
export interface ActiveSession {
  session_id: string;
  // Role and mode (set at spawn via env vars)
  role?: SessionRole;
  mode?: SessionMode;
  // Type classification (legacy - use role/mode instead)
  session_type: SessionType;
  session_subtype?: SessionSubtype;
  // For mission sessions - link to execution record
  mission_execution_id?: string;
  // Conversation tracking (Jan 2026) - stable ID across session resets
  conversation_id?: string;
  parent_session_id?: string;  // Lineage - previous session after reset
  // Lifecycle timestamps
  started_at: string;
  last_seen_at: string;
  ended_at?: string;
  end_reason?: 'exit' | 'crash' | 'timeout' | 'killed';
  // Current activity state
  current_state?: SessionState;  // idle, active, tool_active
  last_tool?: LastTool;  // Most recent tool for sidebar display
  // Context
  cwd?: string;
  tmux_pane?: string;
  // Enrichment (optional)
  description?: string;
  status_text?: string;  // What the session is currently working on
  // Nested workers spawned by this session
  workers: ActiveWorker[];
}

// Active mission (running mission execution)
export interface ActiveMission {
  id: string;
  name: string;
  type: string;
  prompt_file?: string;
  started_at: string;
  status: string;
  // Link to session (bidirectional)
  session_id?: string;
  workers: ActiveWorker[];
}

// Conversation = logical grouping of sessions by conversation_id
// One conversation may have multiple sessions (from resets)
export interface ActiveConversation {
  conversation_id: string;
  role: SessionRole;
  mode: SessionMode;
  // Latest session data
  latest_session_id: string;
  description?: string;
  status_text?: string;
  current_state?: SessionState;
  last_tool?: LastTool;
  // Timeline
  started_at: string;  // First session in conversation
  last_seen_at: string;  // Most recent activity
  ended_at?: string;  // If conversation is ended
  // Sessions in this conversation (for debugging/detail view)
  session_count: number;
  sessions: ActiveSession[];
  // Workers across all sessions in this conversation
  workers: ActiveWorker[];
}

export interface ClaudeActivityData {
  sessions: ActiveSession[];
  missions: ActiveMission[];
  error?: string;
}

// New format for conversation-grouped activity
export interface ClaudeConversationData {
  conversations: ActiveConversation[];
  missions: ActiveMission[];
  error?: string;
}
