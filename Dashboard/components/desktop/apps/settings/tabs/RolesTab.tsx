'use client';

import { Shield, Users, Wrench, Crown, Target, Code2, Lightbulb, Bot } from 'lucide-react';
import { Section } from '../shared/Section';
import type { LucideIcon } from 'lucide-react';

export interface RolesTabRole {
  slug: string;
  name: string;
  is_protected: boolean;
  modes: string[];
  display: {
    icon?: string;
    color?: string;
    description?: string;
  };
}

const ICON_MAP: Record<string, LucideIcon> = {
  crown: Crown,
  wrench: Wrench,
  target: Target,
  'code-2': Code2,
  lightbulb: Lightbulb,
  bot: Bot,
};

export function RolesTab({ roles, loading }: { roles: RolesTabRole[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-[#DA7756] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const baseRoles = roles.filter(r => r.is_protected);
  const customRoles = roles.filter(r => !r.is_protected);

  return (
    <div className="p-6 space-y-6">
      <Section title="Base Roles" icon={Shield}>
        <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
          {baseRoles.map(role => {
            const Icon = ICON_MAP[role.display.icon || ''] || Users;
            return (
              <div key={role.slug} className="flex items-start gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1D1D1F] dark:text-white">{role.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E5E5E5] dark:bg-[#3a3a3a] text-[#6E6E73] dark:text-[#a0a0a0]">{role.slug}</span>
                  </div>
                  {role.display.description && (
                    <p className="text-xs text-[#6E6E73] dark:text-[#a0a0a0] mt-0.5 leading-relaxed">{role.display.description}</p>
                  )}
                  {role.modes.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {role.modes.map(mode => (
                        <span key={mode} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#DA7756]/10 text-[#DA7756] font-medium">
                          {mode}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {customRoles.length > 0 && (
        <Section title="Custom Roles" icon={Wrench}>
          <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
            {customRoles.map(role => {
              const Icon = ICON_MAP[role.display.icon || ''] || Users;
              return (
                <div key={role.slug} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1D1D1F] dark:text-white">{role.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E5E5E5] dark:bg-[#3a3a3a] text-[#6E6E73] dark:text-[#a0a0a0]">{role.slug}</span>
                    </div>
                    {role.display.description && (
                      <p className="text-xs text-[#6E6E73] dark:text-[#a0a0a0] mt-0.5 leading-relaxed">{role.display.description}</p>
                    )}
                    {role.modes.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {role.modes.map(mode => (
                          <span key={mode} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-medium">
                            {mode}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
