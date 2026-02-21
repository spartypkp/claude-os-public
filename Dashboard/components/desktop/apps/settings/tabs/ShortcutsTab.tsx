'use client';

import { Loader2, Keyboard } from 'lucide-react';
import { Section } from '../shared/Section';

interface ShortcutGroup {
  [key: string]: { key: string; action: string }[];
}

export function ShortcutsTab({ shortcuts, loading }: { shortcuts: ShortcutGroup | null; loading: boolean }) {
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

export type { ShortcutGroup };
