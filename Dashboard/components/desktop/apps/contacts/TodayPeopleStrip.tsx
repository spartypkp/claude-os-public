'use client';

import { Star } from 'lucide-react';

interface TodayContact {
  id: string;
  name: string;
  company?: string;
  current_state?: string;
  pinned: boolean;
  signal_reason?: string;
}

interface TodayPeopleStripProps {
  contacts: TodayContact[];
  onSelect: (contactId: string) => void;
  selectedId?: string;
}

export function TodayPeopleStrip({ contacts, onSelect, selectedId }: TodayPeopleStripProps) {
  if (contacts.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-[var(--border-default)]">
      <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
        Today&apos;s People
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            onClick={() => onSelect(contact.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              selectedId === contact.id
                ? 'bg-[var(--color-claude)]/10 border-[var(--color-claude)]/30'
                : 'bg-[var(--surface-raised)] border-[var(--border-default)] hover:bg-[var(--surface-muted)]'
            }`}
            style={{ maxWidth: '200px' }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
              selectedId === contact.id
                ? 'bg-[var(--color-claude)] text-white'
                : 'bg-[var(--color-claude)]/15 text-[var(--color-claude)]'
            }`}>
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                  {contact.name}
                </span>
                {contact.pinned && (
                  <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] truncate">
                {contact.signal_reason || contact.company || ''}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
