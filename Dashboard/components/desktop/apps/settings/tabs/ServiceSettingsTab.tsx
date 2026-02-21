'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Mail,
  Calendar,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Shield,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useServicesQuery, useUpdateServiceTier } from '@/hooks/queries/useServicesQuery';
import { API_BASE } from '@/lib/api';

// ==========================================
// Types
// ==========================================

interface ServiceAccount {
  id: string;
  email: string;
  display_name: string;
  is_primary: boolean;
  is_claude_account: boolean;
}

interface ServiceData {
  service: string;
  tier: string;
  account_count: number;
  defaults: Record<string, string>;
  accounts: ServiceAccount[];
}

type AccessTier = 'read' | 'assist' | 'autonomous';

const SERVICE_META: Record<string, { icon: LucideIcon; label: string; description: string }> = {
  email: { icon: Mail, label: 'Email', description: 'Read, draft, and send emails' },
  calendar: { icon: Calendar, label: 'Calendar', description: 'View and manage calendar events' },
  contacts: { icon: Users, label: 'Contacts', description: 'Access and manage contacts' },
  messages: { icon: MessageSquare, label: 'Messages', description: 'Read and send iMessages' },
};

const TIER_LABELS: Record<AccessTier, { label: string; color: string; description: string }> = {
  read: { label: 'Read Only', color: 'text-blue-500', description: 'Can read data but not modify' },
  assist: { label: 'Assist', color: 'text-[#DA7756]', description: 'Can draft and suggest actions' },
  autonomous: { label: 'Autonomous', color: 'text-green-500', description: 'Can act independently' },
};

// ==========================================
// Component
// ==========================================

export function ServiceSettingsTab() {
  const { data: services, isLoading, error } = useServicesQuery();
  const updateTier = useUpdateServiceTier();

  if (isLoading) {
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
        <p className="text-sm">Failed to load services</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white">Services</h3>
        <p className="text-[13px] text-[#8E8E93] mt-1">
          Control what Claude can access. Each service has an access tier that determines permissions.
        </p>
      </div>

      <div className="space-y-3">
        {(services ?? []).map((service) => (
          <ServiceCard
            key={service.service}
            service={service}
            onTierChange={(tier) => updateTier.mutate({ service: service.service, tier })}
            updating={updateTier.isPending}
          />
        ))}
      </div>

      {/* Tier Legend */}
      <div className="mt-6 p-4 rounded-lg bg-[#F5F5F5] dark:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#3a3a3a]">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[#DA7756]" />
          Access Tiers
        </h4>
        <div className="space-y-2">
          {(Object.entries(TIER_LABELS) as [AccessTier, typeof TIER_LABELS['read']][]).map(([tier, meta]) => (
            <div key={tier} className="flex items-center gap-3">
              <span className={`text-[12px] font-semibold w-24 ${meta.color}`}>{meta.label}</span>
              <span className="text-[12px] text-[#8E8E93]">{meta.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Service Card
// ==========================================

function ServiceCard({
  service,
  onTierChange,
  updating,
}: {
  service: ServiceData;
  onTierChange: (tier: AccessTier) => void;
  updating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = SERVICE_META[service.service] || { icon: Shield, label: service.service, description: '' };
  const Icon = meta.icon;
  const tierMeta = TIER_LABELS[service.tier as AccessTier] || TIER_LABELS.read;
  const claudeAccount = service.accounts.find(a => a.is_claude_account);

  return (
    <div className="rounded-lg bg-[#F5F5F5] dark:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#3a3a3a] overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[#DA7756]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[13px] text-[#1D1D1F] dark:text-white">{meta.label}</span>
            <span className="text-[11px] text-[#8E8E93]">
              {service.account_count} account{service.account_count !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-[11px] text-[#8E8E93]">{meta.description}</p>
        </div>

        {/* Tier Dropdown */}
        <div className="relative flex-shrink-0">
          <select
            value={service.tier}
            onChange={(e) => onTierChange(e.target.value as AccessTier)}
            disabled={updating}
            className="appearance-none bg-white dark:bg-[#3a3a3a] border border-[#C0C0C0] dark:border-[#4a4a4a] rounded-md px-3 py-1.5 pr-8 text-[13px] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#DA7756] focus:ring-1 focus:ring-[#DA7756]/50 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <option value="read">Read Only</option>
            <option value="assist">Assist</option>
            <option value="autonomous">Autonomous</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-[#8E8E93]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#8E8E93]" />
          )}
        </button>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-[#E5E5E5] dark:border-[#3a3a3a] px-4 py-3">
          {/* Connected Accounts */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-2">
              Connected Accounts
            </p>
            <div className="space-y-1.5">
              {service.accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-2 text-[12px]">
                  <div className={`w-2 h-2 rounded-full ${account.is_claude_account ? 'bg-[#DA7756]' : 'bg-green-500'}`} />
                  <span className="text-[#1D1D1F] dark:text-[#E5E5E5]">{account.display_name || account.email}</span>
                  <span className="text-[#8E8E93]">{account.email}</span>
                  {account.is_claude_account && (
                    <span className="px-1.5 py-0.5 text-[9px] font-medium bg-[#DA7756] text-white rounded-full">
                      Claude
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Service Defaults */}
          {Object.keys(service.defaults).length > 0 && (
            <ServiceDefaults service={service.service} defaults={service.defaults} />
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Service Defaults (inline settings)
// ==========================================

function ServiceDefaults({ service, defaults }: { service: string; defaults: Record<string, string> }) {
  const [localDefaults, setLocalDefaults] = useState(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalDefaults(defaults);
  }, [defaults]);

  const saveDefault = useCallback(async (key: string, value: string) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/services/${service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: { [key]: value } }),
      });
    } catch (err) {
      console.error('Failed to save default:', err);
    } finally {
      setSaving(false);
    }
  }, [service]);

  const LABELS: Record<string, string> = {
    draft_account: 'Default Draft Account',
    send_account: 'Default Send Account',
    read_account: 'Default Read Account',
    rate_limit_per_hour: 'Rate Limit (per hour)',
    send_delay_seconds: 'Send Delay (seconds)',
    default_calendar: 'Default Calendar',
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-2">
        Service Defaults
      </p>
      <div className="space-y-2">
        {Object.entries(localDefaults).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-[12px] text-[#1D1D1F] dark:text-[#E5E5E5]">
              {LABELS[key] || key.replace(/_/g, ' ')}
            </span>
            <input
              type="text"
              value={value}
              onChange={(e) => setLocalDefaults(prev => ({ ...prev, [key]: e.target.value }))}
              onBlur={() => {
                if (value !== defaults[key]) {
                  saveDefault(key, localDefaults[key]);
                }
              }}
              disabled={saving}
              className="w-36 px-2 py-1 text-[12px] bg-white dark:bg-[#1e1e1e] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756] text-right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
