'use client';

import { Loader2, Zap, Server } from 'lucide-react';
import { Section } from '../shared/Section';
import { SettingRow } from '../shared/SettingRow';
import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';

interface AboutInfo {
  name: string;
  version: string;
  description: string;
  repository: string;
  author: string;
  ai_partner: string;
  built_with: string[];
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

export function AboutTab({
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
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--color-claude)] to-[var(--color-primary-hover)] flex items-center justify-center shadow-xl shadow-[var(--color-claude)]/30">
          <ClaudeLogo className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-xl font-bold text-[#1D1D1F] dark:text-white">{about?.name || 'Claude OS'}</h2>
        <p className="text-[13px] text-[var(--color-claude)] font-medium mt-1">Version {about?.version || '4.0.0'}</p>
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
                  className="text-[11px] px-2.5 py-1 rounded-full bg-gradient-to-br from-[var(--color-claude)]/10 to-[var(--color-primary-hover)]/20 text-[var(--color-claude)] font-medium border border-[var(--color-claude)]/20"
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
          AI Partner: <span className="text-[var(--color-claude)] font-medium">{about?.ai_partner}</span>
        </p>
      </div>
    </div>
  );
}

export type { AboutInfo, SystemInfo };
