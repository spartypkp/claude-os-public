'use client';

import { useState } from 'react';
import {
  Loader2,
  Settings2,
  ChevronDown,
  RotateCcw,
  Crown,
  Wrench,
  Target,
  Code2,
  Lightbulb,
  Bot,
  Sparkles,
} from 'lucide-react';
import { Section } from '../shared/Section';

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

const ICON_MAP: Record<string, typeof Crown> = {
  crown: Crown,
  wrench: Wrench,
  target: Target,
  'code-2': Code2,
  lightbulb: Lightbulb,
  bot: Bot,
};

export function ModelsTab({
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
          Models can also be changed per-session using <code className="px-1 py-0.5 rounded bg-[#F5F5F5] dark:bg-[#2a2a2a] text-[#DA7756]">/model</code> in Claude Code.
        </p>
      </div>
    </div>
  );
}

export type { ModelConfig, Role };
