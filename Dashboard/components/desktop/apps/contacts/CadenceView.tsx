'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

const CLAUDE_CORAL = '#DA7756';

interface StaleContact {
  id: string;
  name: string;
  company?: string;
  role?: string;
  relationship?: string;
  pinned: boolean;
  last_contact_date?: string;
  contact_cadence?: number;
  days_since: number | null;
  status: 'on_track' | 'overdue' | 'way_overdue' | 'no_cadence';
  tags: string[];
}

interface CadenceViewProps {
  onSelectContact: (contactId: string) => void;
}

const STATUS_CONFIG = {
  way_overdue: {
    label: 'Way Overdue',
    color: '#ef4444',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    icon: AlertTriangle,
  },
  overdue: {
    label: 'Overdue',
    color: '#f59e0b',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Clock,
  },
  no_cadence: {
    label: 'No Cadence',
    color: '#8E8E93',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/20',
    icon: Clock,
  },
  on_track: {
    label: 'On Track',
    color: '#22c55e',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    icon: CheckCircle2,
  },
} as const;

type FilterMode = 'all' | 'overdue' | 'pinned';

export function CadenceView({ onSelectContact }: CadenceViewProps) {
  const [contacts, setContacts] = useState<StaleContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sortAsc, setSortAsc] = useState(false);

  const loadStale = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/contacts/stale?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Stale load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStale(); }, [loadStale]);

  const filtered = useMemo(() => {
    let list = [...contacts];
    if (filter === 'overdue') {
      list = list.filter(c => c.status === 'overdue' || c.status === 'way_overdue');
    } else if (filter === 'pinned') {
      list = list.filter(c => c.pinned);
    }
    if (sortAsc) list.reverse();
    return list;
  }, [contacts, filter, sortAsc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-8">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center mb-3">
          <Clock className="w-7 h-7 text-[#DA7756]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No cadence data yet</p>
        <p className="text-xs text-[#8E8E93]">
          Set contact_cadence on contacts to track relationship freshness
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E5E5] dark:border-[#3a3a3a]">
        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-md p-0.5">
          {(['all', 'overdue', 'pinned'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                filter === f
                  ? 'bg-white dark:bg-[#3a3a3a] text-[var(--text-primary)] shadow-sm'
                  : 'text-[#8E8E93] hover:text-[var(--text-primary)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue' : 'Pinned'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#8E8E93]"
          title={sortAsc ? 'Most stale first' : 'Least stale first'}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
        <span className="ml-auto text-[10px] text-[#8E8E93]">
          {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#F5F5F5] dark:bg-[#2a2a2a]">
            <tr className="text-left text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2 text-right">Last Contact</th>
              <th className="px-3 py-2 text-right">Days Since</th>
              <th className="px-3 py-2 text-right">Cadence</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const cfg = STATUS_CONFIG[c.status];
              const StatusIcon = cfg.icon;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelectContact(c.id)}
                  className="border-b border-[#E5E5E5]/50 dark:border-[#3a3a3a]/50 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.bg} border ${cfg.border}`}
                      style={{ color: cfg.color }}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                    {c.name}
                  </td>
                  <td className="px-3 py-2 text-[#8E8E93]">
                    {c.company || '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-[#8E8E93] font-mono">
                    {c.last_contact_date
                      ? new Date(c.last_contact_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: cfg.color }}>
                    {c.days_since !== null ? `${c.days_since}d` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-[#8E8E93] font-mono">
                    {c.contact_cadence ? `${c.contact_cadence}d` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CadenceView;
