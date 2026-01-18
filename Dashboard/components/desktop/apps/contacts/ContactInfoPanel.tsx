'use client';

import { X, Hash, User, Calendar, Clock, Database, Star, Tag } from 'lucide-react';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex gap-4 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <span className="w-28 shrink-0 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className={`flex-1 text-[13px] text-[var(--text-primary)] break-all ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  role?: string;
  location?: string;
  description?: string;
  relationship?: string;
  context_notes?: string;
  value_exchange?: string;
  notes?: string;
  pinned: boolean;
  tags: string[];
  last_contact_date?: string;
  created_at: string;
  updated_at: string;
}

interface ContactInfoPanelProps {
  contact: Contact;
  onClose: () => void;
}

/**
 * Contact info panel - shows detailed metadata about a contact.
 * Similar to Finder's Get Info panel but for contacts.
 */
export function ContactInfoPanel({
  contact,
  onClose,
}: ContactInfoPanelProps) {
  // Format timestamp
  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  // Count non-empty fields
  const fieldCount = [
    contact.phone,
    contact.email,
    contact.company,
    contact.role,
    contact.location,
    contact.description,
    contact.relationship,
    contact.context_notes,
    contact.value_exchange,
    contact.notes,
  ].filter(Boolean).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] z-[9999] animate-scale-in">
        <div className="bg-[var(--surface-raised)] backdrop-blur-xl rounded-xl border border-[var(--border-default)] shadow-2xl overflow-hidden">
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Contact Info
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Icon and name header */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[var(--border-default)]">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white flex items-center justify-center text-xl font-semibold shadow-md">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {contact.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {contact.pinned && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded text-[10px] font-medium">
                      <Star className="w-3 h-3 fill-current" />
                      Pinned
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {fieldCount} field{fieldCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Info rows */}
            <div className="space-y-0 max-h-[400px] overflow-y-auto">
              {/* Contact ID */}
              <InfoRow
                label="Contact ID"
                value={
                  <span className="flex items-center gap-2">
                    <Hash className="w-3 h-3 text-[var(--text-muted)]" />
                    {contact.id}
                  </span>
                }
                mono
              />

              {/* Name */}
              <InfoRow
                label="Name"
                value={
                  <span className="flex items-center gap-2">
                    <User className="w-3 h-3 text-[var(--text-muted)]" />
                    {contact.name}
                  </span>
                }
              />

              {/* Tags */}
              {contact.tags && contact.tags.length > 0 && (
                <InfoRow
                  label="Tags"
                  value={
                    <span className="flex items-center gap-1 flex-wrap">
                      <Tag className="w-3 h-3 text-[var(--text-muted)] mr-1" />
                      {contact.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full text-[11px] bg-[#DA7756]/10 text-[#DA7756]"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  }
                />
              )}

              {/* Relationship */}
              {contact.relationship && (
                <InfoRow
                  label="Relationship"
                  value={contact.relationship}
                />
              )}

              {/* Last Contact */}
              {contact.last_contact_date && (
                <InfoRow
                  label="Last Contact"
                  value={
                    <span className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                      {formatTimestamp(contact.last_contact_date)}
                    </span>
                  }
                />
              )}

              {/* Created */}
              <InfoRow
                label="Created"
                value={
                  <span className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                    {formatTimestamp(contact.created_at)}
                  </span>
                }
              />

              {/* Updated */}
              <InfoRow
                label="Updated"
                value={
                  <span className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                    {formatTimestamp(contact.updated_at)}
                  </span>
                }
              />

              {/* Pinned */}
              <InfoRow
                label="Pinned"
                value={contact.pinned ? 'Yes' : 'No'}
              />

              {/* Raw Data */}
              <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  Raw Timestamps
                </p>
                <div className="bg-[var(--surface-sunken)] rounded-lg p-3 font-mono text-[11px] text-[var(--text-secondary)] space-y-1">
                  <div className="truncate">created_at: {contact.created_at}</div>
                  <div className="truncate">updated_at: {contact.updated_at}</div>
                  {contact.last_contact_date && (
                    <div className="truncate">last_contact_date: {contact.last_contact_date}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ContactInfoPanel;
