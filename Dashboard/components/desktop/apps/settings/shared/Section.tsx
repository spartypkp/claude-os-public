import type { LucideIcon } from 'lucide-react';

export function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
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
