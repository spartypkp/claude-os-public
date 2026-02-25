'use client';

import { useEffect, useState, useCallback } from 'react';
import { Server, Keyboard, Info, Settings2, RefreshCw, Cpu, Palette, Shield, Users } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { useDarkMode, useAppearanceActions } from '@/store/windowStore';
import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';
import { SystemTab, type SystemConfig } from './tabs/SystemTab';
import { ModelsTab, type ModelConfig, type Role } from './tabs/ModelsTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { ShortcutsTab, type ShortcutGroup } from './tabs/ShortcutsTab';
import { AboutTab, type AboutInfo, type SystemInfo } from './tabs/AboutTab';
import { ServiceSettingsTab } from './tabs/ServiceSettingsTab';
import { RolesTab } from './tabs/RolesTab';

type SettingsTab = 'services' | 'system' | 'models' | 'roles' | 'appearance' | 'shortcuts' | 'about';

const SIDEBAR_ITEMS: { id: SettingsTab; label: string; icon: typeof Server }[] = [
  { id: 'services', label: 'Services', icon: Shield },
  { id: 'system', label: 'System', icon: Server },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'roles', label: 'Roles', icon: Users },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

export function SettingsWindowContent() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('services');
  const [accentColor, setAccentColor] = useState('hsl(16, 67%, 55%)');
  const darkMode = useDarkMode();
  const { toggleDarkMode } = useAppearanceActions();

  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutGroup | null>(null);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('accentColor');
    if (saved) setAccentColor(saved);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--color-primary', accentColor);
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, infoRes, shortcutsRes, aboutRes, modelsRes, rolesRes] = await Promise.all([
        fetch(`${API_BASE}/api/system/config`),
        fetch(`${API_BASE}/api/settings/system-info`),
        fetch(`${API_BASE}/api/settings/keyboard-shortcuts`),
        fetch(`${API_BASE}/api/settings/about`),
        fetch(`${API_BASE}/api/settings/models`),
        fetch(`${API_BASE}/api/roles/`),
      ]);
      if (configRes.ok) setSystemConfig(await configRes.json());
      if (modelsRes.ok) setModelConfig(await modelsRes.json());
      if (infoRes.ok) setSystemInfo(await infoRes.json());
      if (shortcutsRes.ok) setShortcuts(await shortcutsRes.json());
      if (aboutRes.ok) setAboutInfo(await aboutRes.json());
      if (rolesRes.ok) {
        const d = await rolesRes.json();
        if (d.success) setRoles(d.roles);
      }
    } catch {
      setError('Failed to load system data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleModelUpdate = useCallback(async (role: string, model: string) => {
    const res = await fetch(`${API_BASE}/api/settings/models/${role}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }),
    });
    if (res.ok) {
      const updated = await fetch(`${API_BASE}/api/settings/models`);
      if (updated.ok) setModelConfig(await updated.json());
    }
  }, []);

  const handleModelReset = useCallback(async (role: string) => {
    const res = await fetch(`${API_BASE}/api/settings/models/${role}`, { method: 'DELETE' });
    if (res.ok) {
      const updated = await fetch(`${API_BASE}/api/settings/models`);
      if (updated.ok) setModelConfig(await updated.json());
    }
  }, []);

  return (
    <div data-testid="settings-app" className="flex flex-col h-full bg-[#F5F5F5] dark:bg-[#1e1e1e] select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-b from-[#E8E8E8] to-[#D4D4D4] dark:from-[#3d3d3d] dark:to-[#323232] border-b border-[#B8B8B8] dark:border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--color-claude)] to-[var(--color-primary-hover)] flex items-center justify-center shadow-sm">
            <Settings2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-[#1D1D1F] dark:text-white">Settings</span>
        </div>
        <div className="flex-1" />
        <button onClick={fetchData} disabled={loading} className="p-1.5 rounded-md bg-white/50 dark:bg-white/10 border border-[#C0C0C0] dark:border-[#4a4a4a] hover:bg-white/80 dark:hover:bg-white/20 transition-colors disabled:opacity-50" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 text-[#4A4A4A] dark:text-[#c0c0c0] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div data-testid="settings-sidebar" className="w-48 flex-shrink-0 bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl border-r border-[#D1D1D1] dark:border-[#3a3a3a] overflow-y-auto">
          <div className="px-3 py-2.5 border-b border-[#D1D1D1] dark:border-[#3a3a3a]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--color-claude)] to-[var(--color-primary-hover)] flex items-center justify-center">
                <ClaudeLogo className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[var(--color-claude)]">Preferences</div>
                <div className="text-[9px] text-[#8E8E93]">Claude OS</div>
              </div>
            </div>
          </div>
          <nav className="p-2 space-y-0.5">
            {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => (
              <button key={id} data-testid={`settings-tab-${id}`} onClick={() => setActiveTab(id)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${activeTab === id ? 'bg-[var(--color-claude)] text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-[#1D1D1F] dark:text-[#E5E5E5]'}`}>
                <Icon className={`w-4 h-4 ${activeTab === id ? 'text-white' : 'text-[var(--color-claude)]'}`} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div data-testid="settings-content" className="flex-1 overflow-auto bg-white dark:bg-[#1e1e1e]">
          {activeTab === 'services' && <ServiceSettingsTab />}
          {activeTab === 'system' && <SystemTab config={systemConfig} loading={loading} error={error} onRefresh={fetchData} />}
          {activeTab === 'models' && <ModelsTab modelConfig={modelConfig} roles={roles} loading={loading} onUpdate={handleModelUpdate} onReset={handleModelReset} />}
          {activeTab === 'roles' && <RolesTab roles={roles} loading={loading} />}
          {activeTab === 'appearance' && <AppearanceTab darkMode={darkMode} toggleDarkMode={toggleDarkMode} accentColor={accentColor} setAccentColor={setAccentColor} />}
          {activeTab === 'shortcuts' && <ShortcutsTab shortcuts={shortcuts} loading={loading} />}
          {activeTab === 'about' && <AboutTab about={aboutInfo} systemInfo={systemInfo} loading={loading} />}
        </div>
      </div>
    </div>
  );
}

export default SettingsWindowContent;
