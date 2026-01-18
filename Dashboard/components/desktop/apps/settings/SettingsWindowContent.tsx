'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sun,
  Moon,
  Check,
  Server,
  Keyboard,
  Info,
  Settings2,
  Bell,
  Clock,
  Database,
  Zap,
  Eye,
  RefreshCw,
  Loader2,
  AlertCircle,
  Cpu,
  ChevronDown,
  RotateCcw,
  Crown,
  Wrench,
  Target,
  Code2,
  Lightbulb,
  Bot,
  Palette,
  Sparkles,
  Users,
  Mail,
  Calendar,
  MessageSquare,
  UserCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { useDarkMode, useAppearanceActions } from '@/store/windowStore';

// Claude OS themed colors (matching Finder)
const CLAUDE_CORAL = '#DA7756';
const CLAUDE_CORAL_DARK = '#C15F3C';
const CLAUDE_CORAL_LIGHT = '#E8A088';

type SettingsTab = 'accounts' | 'system' | 'models' | 'appearance' | 'shortcuts' | 'about';

interface SystemConfig {
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
    quiet_hours: { start: string; end: string } | null;
  };
  schema: {
    tables: { name: string; columns: { name: string; type: string; pk: boolean }[] }[];
    migrations: { name: string; applied: boolean }[];
  };
}

interface SystemInfo {
  os: {
    system: string;
    release: string;
    version: string;
    machine: string;
  };
  python: {
    version: string;
    executable: string;
  };
  engine: {
    version: string;
    port: number;
    repo_root: string;
    db_path: string;
  };
  timestamp: string;
}

interface ShortcutGroup {
  [key: string]: { key: string; action: string }[];
}

interface AboutInfo {
  name: string;
  version: string;
  description: string;
  repository: string;
  author: string;
  ai_partner: string;
  built_with: string[];
}

interface AvailableModel {
  alias: string;
  name: string;
  full: string;
  tier: string;
}

interface ModelConfig {
  config: Record<string, string>;
  defaults: Record<string, string>;
  available: AvailableModel[];
}

interface Role {
  slug: string;
  name: string;
  auto_include: string[];
  content: string;
  is_protected: boolean;
  modes: string[];
  display: {
    icon?: string;
    color?: string;
    description?: string;
  };
}

interface AccountCapabilities {
  email: { read: boolean; send: boolean; draft: boolean };
  calendar: { read: boolean; create: boolean; delete: boolean };
  contacts: { read: boolean; modify: boolean };
  messages: { read: boolean; send: boolean };
}

interface UnifiedAccount {
  id: string;
  email: string;
  display_name: string | null;
  account_type: string;
  is_claude_account: boolean;
  is_primary: boolean;
  is_enabled: boolean;
  capabilities: AccountCapabilities;
  discovered_via: string | null;
  last_verified_at: string | null;
}

// Map icon names to Lucide icon components
const ICON_MAP: Record<string, typeof Crown> = {
  crown: Crown,
  wrench: Wrench,
  target: Target,
  'code-2': Code2,
  lightbulb: Lightbulb,
  bot: Bot,
};

const ACCENT_COLORS = [
  { name: 'Claude Coral', value: 'hsl(16, 67%, 55%)' },
  { name: 'Ocean Blue', value: '#3b82f6' },
  { name: 'Royal Purple', value: '#8b5cf6' },
  { name: 'Emerald', value: '#22c55e' },
  { name: 'Sunset Orange', value: '#f97316' },
  { name: 'Hot Pink', value: '#ec4899' },
  { name: 'Electric Cyan', value: '#06b6d4' },
];

const SIDEBAR_ITEMS: { id: SettingsTab; label: string; icon: typeof Server }[] = [
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'system', label: 'System', icon: Server },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

// Claude logo SVG path
function ClaudeLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
    </svg>
  );
}

/**
 * macOS-style Settings content with Claude branding.
 * Matches the Finder aesthetic.
 */
export function SettingsWindowContent() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('accounts');
  const [accentColor, setAccentColor] = useState('hsl(16, 67%, 55%)');

  // Theme from windowStore (single source of truth)
  const darkMode = useDarkMode();
  const { toggleDarkMode } = useAppearanceActions();

  // API data
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutGroup | null>(null);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved accent color (theme is managed by windowStore via DarkModeSync)
  useEffect(() => {
    const savedAccent = localStorage.getItem('accentColor');
    if (savedAccent) setAccentColor(savedAccent);
  }, []);

  // Apply accent color
  useEffect(() => {
    document.documentElement.style.setProperty('--color-primary', accentColor);
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  // Fetch system data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [configRes, infoRes, shortcutsRes, aboutRes, modelsRes, rolesRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/api/system/config`),
        fetch(`${API_BASE}/api/settings/system-info`),
        fetch(`${API_BASE}/api/settings/keyboard-shortcuts`),
        fetch(`${API_BASE}/api/settings/about`),
        fetch(`${API_BASE}/api/settings/models`),
        fetch(`${API_BASE}/api/roles/`),
        fetch(`${API_BASE}/api/settings/accounts`),
      ]);

      if (configRes.ok) {
        setSystemConfig(await configRes.json());
      }
      if (modelsRes.ok) {
        setModelConfig(await modelsRes.json());
      }
      if (infoRes.ok) {
        setSystemInfo(await infoRes.json());
      }
      if (shortcutsRes.ok) {
        setShortcuts(await shortcutsRes.json());
      }
      if (aboutRes.ok) {
        setAboutInfo(await aboutRes.json());
      }
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        if (rolesData.success) {
          setRoles(rolesData.roles);
        }
      }
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(accountsData.accounts || []);
      }
    } catch (err) {
      setError('Failed to load system data');
      console.error('Settings fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F5] dark:bg-[#1e1e1e] select-none">
      {/* macOS-style Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-b from-[#E8E8E8] to-[#D4D4D4] dark:from-[#3d3d3d] dark:to-[#323232] border-b border-[#B8B8B8] dark:border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center shadow-sm">
            <Settings2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-[#1D1D1F] dark:text-white">Settings</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-1.5 rounded-md bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a] hover:bg-white/80 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#4A4A4A] dark:text-[#c0c0c0] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Claude OS branded */}
        <div className="w-48 flex-shrink-0 bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl border-r border-[#D1D1D1] dark:border-[#3a3a3a] overflow-y-auto">
          {/* Claude branding header */}
          <div className="px-3 py-2.5 border-b border-[#D1D1D1] dark:border-[#3a3a3a]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center">
                <ClaudeLogo className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#DA7756]">Preferences</div>
                <div className="text-[9px] text-[#8E8E93]">Claude OS</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-2 space-y-0.5">
            {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${
                    isActive
                      ? 'bg-[#DA7756] text-white'
                      : 'hover:bg-black/5 dark:hover:bg-white/10 text-[#1D1D1F] dark:text-[#E5E5E5]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#DA7756]'}`} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-white dark:bg-[#1e1e1e]">
          {activeTab === 'accounts' && (
            <AccountsTab
              accounts={accounts}
              loading={loading}
              onRefresh={fetchData}
            />
          )}
          {activeTab === 'system' && (
            <SystemTab
              config={systemConfig}
              loading={loading}
              error={error}
              onRefresh={fetchData}
            />
          )}
          {activeTab === 'models' && (
            <ModelsTab
              modelConfig={modelConfig}
              roles={roles}
              loading={loading}
              onUpdate={async (role, model) => {
                try {
                  const res = await fetch(`${API_BASE}/api/settings/models/${role}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model }),
                  });
                  if (res.ok) {
                    const updated = await fetch(`${API_BASE}/api/settings/models`);
                    if (updated.ok) {
                      setModelConfig(await updated.json());
                    }
                  }
                } catch (err) {
                  console.error('Failed to update model:', err);
                }
              }}
              onReset={async (role) => {
                try {
                  const res = await fetch(`${API_BASE}/api/settings/models/${role}`, {
                    method: 'DELETE',
                  });
                  if (res.ok) {
                    const updated = await fetch(`${API_BASE}/api/settings/models`);
                    if (updated.ok) {
                      setModelConfig(await updated.json());
                    }
                  }
                } catch (err) {
                  console.error('Failed to reset model:', err);
                }
              }}
            />
          )}
          {activeTab === 'appearance' && (
            <AppearanceTab
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              accentColor={accentColor}
              setAccentColor={setAccentColor}
            />
          )}
          {activeTab === 'shortcuts' && (
            <ShortcutsTab shortcuts={shortcuts} loading={loading} />
          )}
          {activeTab === 'about' && (
            <AboutTab about={aboutInfo} systemInfo={systemInfo} loading={loading} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Reusable Components - macOS Style
// ============================================

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Server; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-3 flex items-center gap-2 px-1">
        <Icon className="w-3.5 h-3.5 text-[#DA7756]" />
        {title}
      </h4>
      <div className="rounded-lg bg-[#F5F5F5] dark:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#3a3a3a] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ 
  label, 
  value, 
  valueColor,
  isFirst = false,
  isLast = false,
}: { 
  label: string; 
  value: React.ReactNode;
  valueColor?: 'success' | 'muted' | 'coral';
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const colorClass = valueColor === 'success' 
    ? 'text-green-500' 
    : valueColor === 'coral'
    ? 'text-[#DA7756]'
    : 'text-[#8E8E93]';
  
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 ${!isLast ? 'border-b border-[#E5E5E5] dark:border-[#3a3a3a]' : ''}`}>
      <span className="text-[13px] text-[#1D1D1F] dark:text-[#E5E5E5]">{label}</span>
      <span className={`text-[13px] font-medium ${colorClass}`}>{value}</span>
    </div>
  );
}

// ============================================
// System Tab
// ============================================

function SystemTab({ 
  config, 
  loading, 
  error,
  onRefresh,
}: { 
  config: SystemConfig | null; 
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8E8E93]">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">{error}</p>
        <button 
          onClick={onRefresh} 
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#DA7756] rounded-md hover:bg-[#C15F3C] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const modules = config?.watcher.modules ? Object.entries(config.watcher.modules) : [];

  return (
    <div className="p-5">
      <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-5">System Configuration</h3>

      {/* Watcher Modules */}
      <Section title="Background Watchers" icon={Eye}>
        {modules.map(([mod, enabled], idx) => (
          <SettingRow
            key={mod}
            label={mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            value={enabled ? 'Active' : 'Disabled'}
            valueColor={enabled ? 'success' : 'muted'}
            isFirst={idx === 0}
            isLast={idx === modules.length - 1}
          />
        ))}
      </Section>

      {/* Executor Settings */}
      <Section title="Worker Executor" icon={Zap}>
        <SettingRow label="Poll Interval" value={`${config?.executor.poll_interval_sec}s`} isFirst />
        <SettingRow label="Batch Size" value={config?.executor.batch_size} />
        <SettingRow label="Check Interval" value={`${config?.executor.check_interval_sec}s`} isLast />
      </Section>

      {/* SMS Settings */}
      <Section title="Notifications" icon={Bell}>
        <SettingRow 
          label="SMS Notifications" 
          value={config?.sms.enabled ? 'Enabled' : 'Disabled'} 
          valueColor={config?.sms.enabled ? 'success' : 'muted'}
          isFirst
          isLast={!config?.sms.quiet_hours}
        />
        {config?.sms.quiet_hours && (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Clock className="w-4 h-4 text-[#8E8E93]" />
            <span className="text-[13px] text-[#1D1D1F] dark:text-[#E5E5E5]">
              Quiet Hours: <span className="text-[#DA7756] font-medium">{config.sms.quiet_hours.start} – {config.sms.quiet_hours.end}</span>
            </span>
          </div>
        )}
      </Section>

      {/* Database */}
      <Section title="Database Schema" icon={Database}>
        <div className="px-3 py-3">
          <p className="text-xs text-[#8E8E93] mb-3">
            {config?.schema.tables.length} tables • {config?.schema.migrations.length} migrations
          </p>
          <div className="flex flex-wrap gap-1.5">
            {config?.schema.tables.map((table) => (
              <span
                key={table.name}
                className="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-[#1e1e1e] text-[#1D1D1F] dark:text-[#E5E5E5] border border-[#E5E5E5] dark:border-[#3a3a3a]"
              >
                {table.name}
              </span>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

// ============================================
// Models Tab
// ============================================

function ModelsTab({
  modelConfig,
  roles,
  loading,
  onUpdate,
  onReset,
}: {
  modelConfig: ModelConfig | null;
  roles: Role[];
  loading: boolean;
  onUpdate: (role: string, model: string) => Promise<void>;
  onReset: (role: string) => Promise<void>;
}) {
  const [updating, setUpdating] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  const handleUpdate = async (role: string, model: string) => {
    setUpdating(role);
    await onUpdate(role, model);
    setUpdating(null);
  };

  const handleReset = async (role: string) => {
    setUpdating(role);
    await onReset(role);
    setUpdating(null);
  };

  return (
    <div className="p-5">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white">Claude Models</h3>
        <p className="text-[13px] text-[#8E8E93] mt-1">
          Configure which model each role uses. Changes apply to new sessions.
        </p>
      </div>

      {/* Available Models */}
      <Section title="Available Models" icon={Sparkles}>
        <div className="grid grid-cols-3 divide-x divide-[#E5E5E5] dark:divide-[#3a3a3a]">
          {modelConfig?.available.map((model) => {
            const tierColors: Record<string, string> = {
              premium: 'text-[#DA7756]',
              standard: 'text-blue-500',
              fast: 'text-green-500',
            };
            return (
              <div key={model.alias} className="p-3 text-center">
                <div className="font-medium text-[13px] text-[#1D1D1F] dark:text-white">{model.name}</div>
                <div className="text-[11px] text-[#8E8E93] font-mono mt-0.5">{model.alias}</div>
                <div className={`text-[10px] mt-1 font-medium capitalize ${tierColors[model.tier] || 'text-[#8E8E93]'}`}>
                  {model.tier}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Role Configuration */}
      <Section title="Role Configuration" icon={Settings2}>
        <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
          {modelConfig && roles.map((role) => {
            const currentModel = modelConfig.config[role.slug] || modelConfig.defaults[role.slug];
            const isDefault = !modelConfig.config[role.slug] || modelConfig.config[role.slug] === modelConfig.defaults[role.slug];
            const iconName = role.display?.icon || 'bot';
            const Icon = ICON_MAP[iconName] || Bot;
            // Extract description from display or generate from role name
            const description = role.display?.description || `${role.name} role`;

            return (
              <div
                key={role.slug}
                className="flex items-center gap-3 px-3 py-3"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#DA7756]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] text-[#1D1D1F] dark:text-white">{role.name}</div>
                  <div className="text-[11px] text-[#8E8E93] truncate">{description}</div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Model Dropdown - macOS style */}
                  <div className="relative">
                    <select
                      value={currentModel}
                      onChange={(e) => handleUpdate(role.slug, e.target.value)}
                      disabled={updating === role.slug}
                      className="appearance-none bg-white dark:bg-[#3a3a3a] border border-[#C0C0C0] dark:border-[#4a4a4a] rounded-md px-3 py-1.5 pr-8 text-[13px] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#DA7756] focus:ring-1 focus:ring-[#DA7756]/50 cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      {modelConfig.available.map((model) => (
                        <option key={model.alias} value={model.alias}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                  </div>

                  {/* Reset Button */}
                  {!isDefault && (
                    <button
                      onClick={() => handleReset(role.slug)}
                      disabled={updating === role.slug}
                      className="p-1.5 rounded-md bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a] hover:bg-white dark:hover:bg-white/20 text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white disabled:opacity-50 transition-colors"
                      title="Reset to default"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Loading indicator */}
                  {updating === role.slug && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#DA7756]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Info footer */}
      <div className="px-1 py-3 border-t border-[#E5E5E5] dark:border-[#3a3a3a] mt-4">
        <p className="text-[11px] text-[#8E8E93]">
          💡 Models can also be changed per-session using <code className="px-1 py-0.5 rounded bg-[#F5F5F5] dark:bg-[#2a2a2a] text-[#DA7756]">/model</code> in Claude Code.
        </p>
      </div>
    </div>
  );
}

// ============================================
// Appearance Tab
// ============================================

function AppearanceTab({
  darkMode,
  toggleDarkMode,
  accentColor,
  setAccentColor,
}: {
  darkMode: boolean;
  toggleDarkMode: () => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
}) {
  const themeOptions = [
    { id: 'light', isDark: false, label: 'Light', icon: Sun, desc: 'Bright and crisp' },
    { id: 'dark', isDark: true, label: 'Dark', icon: Moon, desc: 'Easy on the eyes' },
  ];

  return (
    <div className="p-5">
      <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-5">Appearance</h3>

      {/* Theme */}
      <Section title="Theme" icon={Sun}>
        <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
          {themeOptions.map(({ id, isDark, label, icon: Icon, desc }) => {
            const isSelected = darkMode === isDark;
            return (
              <button
                key={id}
                onClick={() => {
                  // Only toggle if we're switching to a different mode
                  if (darkMode !== isDark) {
                    toggleDarkMode();
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[#F0F0F0] dark:hover:bg-[#3a3a3a] transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isSelected
                    ? 'bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white'
                    : 'bg-white dark:bg-[#3a3a3a] text-[#8E8E93]'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-[#1D1D1F] dark:text-white">{label}</div>
                  <div className="text-[11px] text-[#8E8E93]">{desc}</div>
                </div>
                {isSelected && <Check className="w-5 h-5 text-[#DA7756]" />}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Accent Color */}
      <Section title="Accent Color" icon={Palette}>
        <div className="px-3 py-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setAccentColor(color.value)}
                className={`w-10 h-10 rounded-full transition-all hover:scale-110 shadow-sm ${
                  accentColor === color.value 
                    ? 'ring-2 ring-offset-2 ring-offset-[#F5F5F5] dark:ring-offset-[#2a2a2a] ring-[#1D1D1F] dark:ring-white scale-110' 
                    : 'ring-1 ring-black/10'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
          <p className="text-[11px] text-[#8E8E93] text-center mt-3">
            {ACCENT_COLORS.find(c => c.value === accentColor)?.name || 'Custom'}
          </p>
        </div>
      </Section>
    </div>
  );
}

// ============================================
// Shortcuts Tab
// ============================================

function ShortcutsTab({ shortcuts, loading }: { shortcuts: ShortcutGroup | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  return (
    <div className="p-5">
      <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-5">Keyboard Shortcuts</h3>

      {shortcuts && Object.entries(shortcuts).map(([group, items]) => (
        <Section key={group} title={group} icon={Keyboard}>
          <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[13px] text-[#1D1D1F] dark:text-[#E5E5E5]">{item.action}</span>
                <kbd className="px-2 py-1 text-[11px] font-medium text-[#1D1D1F] dark:text-[#E5E5E5] bg-white dark:bg-[#1e1e1e] border border-[#D1D1D1] dark:border-[#4a4a4a] rounded-md shadow-sm">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

// ============================================
// Accounts Tab
// ============================================

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  icloud: 'iCloud',
  google: 'Google',
  exchange: 'Exchange',
  imap: 'IMAP',
  local: 'Local',
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  icloud: 'bg-blue-500',
  google: 'bg-red-500',
  exchange: 'bg-purple-500',
  imap: 'bg-gray-500',
  local: 'bg-green-500',
};

// Map capability keys to API field names
const CAPABILITY_TO_API_FIELD: Record<string, Record<string, string>> = {
  email: {
    read: 'can_read_email',
    draft: 'can_draft_email',
    send: 'can_send_email',
  },
  calendar: {
    read: 'can_read_calendar',
    create: 'can_create_calendar',
    delete: 'can_delete_calendar',
  },
  contacts: {
    read: 'can_read_contacts',
    modify: 'can_modify_contacts',
  },
  messages: {
    read: 'can_read_messages',
    send: 'can_send_messages',
  },
};

function AccountsTab({
  accounts,
  loading,
  onRefresh,
}: {
  accounts: UnifiedAccount[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [updatingAccount, setUpdatingAccount] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const openSystemSettings = () => {
    window.open('x-apple.systempreferences:com.apple.Internet-Accounts', '_blank');
  };

  // Show toast and auto-dismiss
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Update a single capability
  const updateCapability = useCallback(async (
    accountId: string,
    domain: string,
    capability: string,
    newValue: boolean,
    isClaudeAccount: boolean
  ) => {
    // Warn if enabling send on non-Claude account
    if (!isClaudeAccount && capability === 'send' && newValue) {
      const confirmed = window.confirm(
        'Only Claude\'s account should have Send enabled. Are you sure you want to enable sending for this account?'
      );
      if (!confirmed) return;
    }

    const apiField = CAPABILITY_TO_API_FIELD[domain]?.[capability];
    if (!apiField) {
      showToast(`Unknown capability: ${domain}.${capability}`, 'error');
      return;
    }

    setUpdatingAccount(accountId);

    try {
      const res = await fetch(`${API_BASE}/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [apiField]: newValue }),
      });

      if (res.ok) {
        showToast(`Updated ${domain} ${capability}`, 'success');
        onRefresh(); // Refresh accounts list
      } else {
        const error = await res.json();
        showToast(error.detail || 'Failed to update capability', 'error');
      }
    } catch (err) {
      showToast('Network error updating capability', 'error');
      console.error('Capability update error:', err);
    } finally {
      setUpdatingAccount(null);
    }
  }, [onRefresh, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  return (
    <div className="p-5 relative">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white">Connected Accounts</h3>
        <p className="text-[13px] text-[#8E8E93] mt-1">
          Unified view of all accounts used by Claude OS apps.
        </p>
      </div>

      {/* System Settings Link */}
      <div className="mb-6 p-3 bg-[#F5F5F5] dark:bg-[#2a2a2a] rounded-lg border border-[#E5E5E5] dark:border-[#3a3a3a]">
        <p className="text-[13px] text-[#8E8E93]">
          Accounts are discovered from macOS System Settings.
        </p>
        <button
          onClick={openSystemSettings}
          className="inline-flex items-center gap-1 mt-2 text-[13px] text-[#DA7756] hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open Internet Accounts
        </button>
      </div>

      {/* Account List */}
      {accounts.length === 0 ? (
        <div className="text-center py-12 text-[#8E8E93]">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No accounts configured yet</p>
          <p className="text-xs mt-1">Add accounts in System Settings to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={`rounded-lg border overflow-hidden ${
                account.is_claude_account
                  ? 'bg-[#DA7756]/5 border-[#DA7756]/30 dark:bg-[#DA7756]/10'
                  : 'bg-[#F5F5F5] dark:bg-[#2a2a2a] border-[#E5E5E5] dark:border-[#3a3a3a]'
              }`}
            >
              {/* Account Header */}
              <div className="flex items-start gap-3 p-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    account.is_claude_account
                      ? 'bg-[#DA7756]'
                      : ACCOUNT_TYPE_COLORS[account.account_type] || 'bg-gray-500'
                  }`}
                >
                  {account.is_claude_account ? (
                    <ClaudeLogo className="w-5 h-5 text-white" />
                  ) : (
                    <UserCircle className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[13px] text-[#1D1D1F] dark:text-white truncate">
                      {account.display_name || account.email}
                    </span>
                    {account.is_primary && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                        Primary
                      </span>
                    )}
                    {account.is_claude_account && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-[#DA7756] text-white rounded-full">
                        Claude
                      </span>
                    )}
                    {!account.is_enabled && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#8E8E93] mt-0.5 truncate">
                    {account.email}
                  </p>
                  <p className="text-[11px] text-[#8E8E93] mt-0.5">
                    {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
                    {account.discovered_via && ` • via ${account.discovered_via.replace('_', ' ')}`}
                  </p>
                </div>
                {updatingAccount === account.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-[#DA7756] flex-shrink-0" />
                )}
              </div>

              {/* Capabilities */}
              <div className="px-4 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-2">
                  Capabilities <span className="font-normal">(click to toggle)</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {/* Email */}
                  <CapabilityCard
                    icon={Mail}
                    label="Email"
                    domain="email"
                    capabilities={account.capabilities.email}
                    capLabels={['Read', 'Draft', 'Send']}
                    capKeys={['read', 'draft', 'send']}
                    onToggle={(capability, newValue) =>
                      updateCapability(account.id, 'email', capability, newValue, account.is_claude_account)
                    }
                    disabled={updatingAccount === account.id}
                  />
                  {/* Calendar */}
                  <CapabilityCard
                    icon={Calendar}
                    label="Calendar"
                    domain="calendar"
                    capabilities={account.capabilities.calendar}
                    capLabels={['Read', 'Create', 'Delete']}
                    capKeys={['read', 'create', 'delete']}
                    onToggle={(capability, newValue) =>
                      updateCapability(account.id, 'calendar', capability, newValue, account.is_claude_account)
                    }
                    disabled={updatingAccount === account.id}
                  />
                  {/* Contacts */}
                  <CapabilityCard
                    icon={Users}
                    label="Contacts"
                    domain="contacts"
                    capabilities={account.capabilities.contacts}
                    capLabels={['Read', 'Modify']}
                    capKeys={['read', 'modify']}
                    onToggle={(capability, newValue) =>
                      updateCapability(account.id, 'contacts', capability, newValue, account.is_claude_account)
                    }
                    disabled={updatingAccount === account.id}
                  />
                  {/* Messages */}
                  <CapabilityCard
                    icon={MessageSquare}
                    label="Messages"
                    domain="messages"
                    capabilities={account.capabilities.messages}
                    capLabels={['Read', 'Send']}
                    capKeys={['read', 'send']}
                    onToggle={(capability, newValue) =>
                      updateCapability(account.id, 'messages', capability, newValue, account.is_claude_account)
                    }
                    disabled={updatingAccount === account.id}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Safety Settings Section */}
      <SafetySettingsSection showToast={showToast} />

      {/* Calendar Preferences Section */}
      <CalendarPreferencesSection showToast={showToast} />

      {/* Info footer */}
      <div className="px-1 py-3 border-t border-[#E5E5E5] dark:border-[#3a3a3a] mt-6">
        <p className="text-[11px] text-[#8E8E93]">
          💡 Capabilities determine what Claude can do with each account. Click to toggle. Most are read-only by default for safety.
        </p>
      </div>
    </div>
  );
}

function CapabilityCard({
  icon: Icon,
  label,
  domain,
  capabilities,
  capLabels,
  capKeys,
  onToggle,
  disabled,
}: {
  icon: typeof Mail;
  label: string;
  domain: string;
  capabilities: Record<string, boolean>;
  capLabels: string[];
  capKeys: string[];
  onToggle: (capability: string, newValue: boolean) => void;
  disabled?: boolean;
}) {
  const anyEnabled = capKeys.some((key) => capabilities[key]);

  return (
    <div className="p-2 rounded-md bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${anyEnabled ? 'text-[#DA7756]' : 'text-[#8E8E93]'}`} />
        <span className="text-[11px] font-medium text-[#1D1D1F] dark:text-white">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {capKeys.map((key, i) => (
          <button
            key={key}
            onClick={() => !disabled && onToggle(key, !capabilities[key])}
            disabled={disabled}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              capabilities[key]
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title={`Click to ${capabilities[key] ? 'disable' : 'enable'} ${label.toLowerCase()} ${capLabels[i].toLowerCase()}`}
          >
            {capLabels[i]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Safety Settings Section
// ============================================

interface SafetySettings {
  send_delay_seconds: number;
  rate_limit_per_hour: number;
  require_new_recipient_confirmation: boolean;
  claude_account_email: string | null;
  defaults: {
    send_delay_seconds: number;
    rate_limit_per_hour: number;
    require_new_recipient_confirmation: boolean;
  };
}

function SafetySettingsSection({
  showToast,
}: {
  showToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [settings, setSettings] = useState<SafetySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local state for edits
  const [sendDelay, setSendDelay] = useState<number>(15);
  const [rateLimit, setRateLimit] = useState<number>(50);
  const [requireConfirmation, setRequireConfirmation] = useState(false);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/safety`);
      if (res.ok) {
        const data: SafetySettings = await res.json();
        setSettings(data);
        setSendDelay(data.send_delay_seconds);
        setRateLimit(data.rate_limit_per_hour);
        setRequireConfirmation(data.require_new_recipient_confirmation);
      }
    } catch (err) {
      console.error('Failed to fetch safety settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save a single setting
  const saveSetting = useCallback(async (field: string, value: number | boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/safety`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (res.ok) {
        showToast(`Updated ${field.replace(/_/g, ' ')}`, 'success');
        fetchSettings(); // Refresh
      } else {
        const error = await res.json();
        showToast(error.detail || 'Failed to update setting', 'error');
      }
    } catch (err) {
      showToast('Network error updating setting', 'error');
    } finally {
      setSaving(false);
    }
  }, [fetchSettings, showToast]);

  if (loading) {
    return (
      <div className="mt-8 pt-6 border-t border-[#E5E5E5] dark:border-[#3a3a3a]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-[#8E8E93]" />
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="mt-8 pt-6 border-t border-[#E5E5E5] dark:border-[#3a3a3a]">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-[#1D1D1F] dark:text-white flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#DA7756]" />
          Email Safety Settings
        </h4>
        <p className="text-[12px] text-[#8E8E93] mt-1">
          Safeguards for autonomous email sending. Changes take effect immediately.
        </p>
      </div>

      <div className="space-y-4 rounded-lg bg-[#F5F5F5] dark:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#3a3a3a] p-4">
        {/* Claude's Account */}
        {settings.claude_account_email && (
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E5] dark:border-[#3a3a3a]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#DA7756] flex items-center justify-center">
                <ClaudeLogo className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[12px] text-[#8E8E93]">Claude&apos;s Autonomous Account</p>
                <p className="text-[13px] font-medium text-[#1D1D1F] dark:text-white">
                  {settings.claude_account_email}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-medium bg-[#DA7756] text-white rounded-full">
              Can Send
            </span>
          </div>
        )}

        {/* Send Delay */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[#1D1D1F] dark:text-white">Send Delay</p>
            <p className="text-[11px] text-[#8E8E93]">
              Time before emails are actually sent (seconds)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={300}
              value={sendDelay}
              onChange={(e) => setSendDelay(parseInt(e.target.value) || 0)}
              onBlur={() => {
                if (sendDelay !== settings.send_delay_seconds) {
                  saveSetting('send_delay_seconds', sendDelay);
                }
              }}
              disabled={saving}
              className="w-20 px-2 py-1 text-[13px] text-right bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756]"
            />
            <span className="text-[12px] text-[#8E8E93]">sec</span>
          </div>
        </div>

        {/* Rate Limit */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[#1D1D1F] dark:text-white">Rate Limit</p>
            <p className="text-[11px] text-[#8E8E93]">
              Maximum emails per hour
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={rateLimit}
              onChange={(e) => setRateLimit(parseInt(e.target.value) || 1)}
              onBlur={() => {
                if (rateLimit !== settings.rate_limit_per_hour) {
                  saveSetting('rate_limit_per_hour', rateLimit);
                }
              }}
              disabled={saving}
              className="w-20 px-2 py-1 text-[13px] text-right bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756]"
            />
            <span className="text-[12px] text-[#8E8E93]">/hr</span>
          </div>
        </div>

        {/* New Recipient Confirmation */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[#1D1D1F] dark:text-white">New Recipient Confirmation</p>
            <p className="text-[11px] text-[#8E8E93]">
              Require confirmation for first-time recipients
            </p>
          </div>
          <button
            onClick={() => {
              const newValue = !requireConfirmation;
              setRequireConfirmation(newValue);
              saveSetting('require_new_recipient_confirmation', newValue);
            }}
            disabled={saving}
            className={`relative w-10 h-6 rounded-full transition-colors ${
              requireConfirmation
                ? 'bg-[#DA7756]'
                : 'bg-gray-300 dark:bg-gray-600'
            } ${saving ? 'opacity-50' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                requireConfirmation ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Calendar Preferences Section
// ============================================

interface CalendarPreferences {
  default_calendar: string;
  default_meeting_calendar: string;
  default_personal_calendar: string;
  defaults: {
    default_calendar: string;
    default_meeting_calendar: string;
    default_personal_calendar: string;
  };
}

function CalendarPreferencesSection({
  showToast,
}: {
  showToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [prefs, setPrefs] = useState<CalendarPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local state for edits
  const [defaultCalendar, setDefaultCalendar] = useState('');
  const [meetingCalendar, setMeetingCalendar] = useState('');
  const [personalCalendar, setPersonalCalendar] = useState('');

  // Fetch preferences
  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/calendar`);
      if (res.ok) {
        const data: CalendarPreferences = await res.json();
        setPrefs(data);
        setDefaultCalendar(data.default_calendar);
        setMeetingCalendar(data.default_meeting_calendar);
        setPersonalCalendar(data.default_personal_calendar);
      }
    } catch (err) {
      console.error('Failed to fetch calendar preferences:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  // Save a single preference
  const savePref = useCallback(async (field: string, value: string) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/calendar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (res.ok) {
        showToast(`Updated ${field.replace(/_/g, ' ')}`, 'success');
        fetchPrefs(); // Refresh
      } else {
        const error = await res.json();
        showToast(error.detail || 'Failed to update setting', 'error');
      }
    } catch (err) {
      showToast('Network error updating setting', 'error');
    } finally {
      setSaving(false);
    }
  }, [fetchPrefs, showToast]);

  if (loading) {
    return (
      <div className="mt-8 pt-6 border-t border-[#E5E5E5] dark:border-[#3a3a3a]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-[#8E8E93]" />
        </div>
      </div>
    );
  }

  if (!prefs) return null;

  return (
    <div className="mt-8 pt-6 border-t border-[#E5E5E5] dark:border-[#3a3a3a]">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-[#1D1D1F] dark:text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#DA7756]" />
          Calendar Preferences
        </h4>
        <p className="text-[12px] text-[#8E8E93] mt-1">
          Default calendars for creating events. Type a calendar name.
        </p>
      </div>

      <div className="space-y-4 rounded-lg bg-[#F5F5F5] dark:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#3a3a3a] p-4">
        {/* Default Calendar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[#1D1D1F] dark:text-white">Default Calendar</p>
            <p className="text-[11px] text-[#8E8E93]">
              Main calendar for new events
            </p>
          </div>
          <input
            type="text"
            value={defaultCalendar}
            onChange={(e) => setDefaultCalendar(e.target.value)}
            onBlur={() => {
              if (defaultCalendar && defaultCalendar !== prefs.default_calendar) {
                savePref('default_calendar', defaultCalendar);
              }
            }}
            disabled={saving}
            placeholder="Calendar name"
            className="w-40 px-2 py-1 text-[13px] bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756]"
          />
        </div>

        {/* Meeting Calendar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[#1D1D1F] dark:text-white">Meeting Calendar</p>
            <p className="text-[11px] text-[#8E8E93]">
              Calendar for meetings with others
            </p>
          </div>
          <input
            type="text"
            value={meetingCalendar}
            onChange={(e) => setMeetingCalendar(e.target.value)}
            onBlur={() => {
              if (meetingCalendar && meetingCalendar !== prefs.default_meeting_calendar) {
                savePref('default_meeting_calendar', meetingCalendar);
              }
            }}
            disabled={saving}
            placeholder="Calendar name"
            className="w-40 px-2 py-1 text-[13px] bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756]"
          />
        </div>

        {/* Personal Calendar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[#1D1D1F] dark:text-white">Personal Calendar</p>
            <p className="text-[11px] text-[#8E8E93]">
              Calendar for solo events and blocks
            </p>
          </div>
          <input
            type="text"
            value={personalCalendar}
            onChange={(e) => setPersonalCalendar(e.target.value)}
            onBlur={() => {
              if (personalCalendar && personalCalendar !== prefs.default_personal_calendar) {
                savePref('default_personal_calendar', personalCalendar);
              }
            }}
            disabled={saving}
            placeholder="Calendar name"
            className="w-40 px-2 py-1 text-[13px] bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756]"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================
// About Tab
// ============================================

function AboutTab({ 
  about, 
  systemInfo,
  loading,
}: { 
  about: AboutInfo | null;
  systemInfo: SystemInfo | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Hero - Claude branded */}
      <div className="text-center py-8 mb-5">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center shadow-xl shadow-[#DA7756]/30">
          <ClaudeLogo className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-xl font-bold text-[#1D1D1F] dark:text-white">{about?.name || 'Claude OS'}</h2>
        <p className="text-[13px] text-[#DA7756] font-medium mt-1">Version {about?.version || '4.0.0'}</p>
        <p className="text-[13px] text-[#8E8E93] mt-2 max-w-xs mx-auto">
          {about?.description}
        </p>
      </div>

      {/* Built With */}
      {about?.built_with && (
        <Section title="Built With" icon={Zap}>
          <div className="px-3 py-3">
            <div className="flex flex-wrap gap-2 justify-center">
              {about.built_with.map((tech) => (
                <span
                  key={tech}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-gradient-to-br from-[#DA7756]/10 to-[#C15F3C]/20 text-[#DA7756] font-medium border border-[#DA7756]/20"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* System Info */}
      {systemInfo && (
        <Section title="System Information" icon={Server}>
          <SettingRow 
            label="Operating System" 
            value={`${systemInfo.os.system} ${systemInfo.os.release}`} 
            isFirst 
          />
          <SettingRow 
            label="Python Version" 
            value={<code className="text-[11px] font-mono">{systemInfo.python.version.split(' ')[0]}</code>} 
          />
          <SettingRow 
            label="Backend Port" 
            value={systemInfo.engine.port} 
            valueColor="coral"
            isLast 
          />
        </Section>
      )}

      {/* Credits */}
      <div className="text-center pt-5 mt-5 border-t border-[#E5E5E5] dark:border-[#3a3a3a]">
        <p className="text-[11px] text-[#8E8E93]">
          Created by <span className="text-[#1D1D1F] dark:text-white font-medium">{about?.author}</span>
        </p>
        <p className="text-[11px] text-[#8E8E93] mt-1">
          AI Partner: <span className="text-[#DA7756] font-medium">{about?.ai_partner}</span>
        </p>
      </div>
    </div>
  );
}

export default SettingsWindowContent;
