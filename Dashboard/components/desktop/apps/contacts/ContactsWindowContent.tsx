'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  User,
  Star,
  Loader2,
  Users,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Tag,
  Edit2,
  Calendar,
  UserPlus,
  X,
  Check,
  Linkedin,
  Clock,
  Share2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ContactInfoPanel } from './ContactInfoPanel';
import { NetworkGraph } from './NetworkGraph';
import { ActivityFeed } from './ActivityFeed';
import { TodayPeopleStrip } from './TodayPeopleStrip';
import { type ActivityEvent } from './ContactEventRow';
import { API_BASE } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

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
  current_state?: string;
  linkedin_url?: string;
  contact_cadence?: number;
  created_at: string;
  updated_at: string;
}

interface HistoryEntry {
  id: string;
  contact_id: string;
  entry: string;
  entry_date: string;
  source: string;
  created_at: string;
}

interface SearchResult {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  description?: string;
  pinned: boolean;
  tags: string[];
}

interface ContactsWindowContentProps {
  initialContactName?: string;
}

export function ContactsWindowContent({ initialContactName }: ContactsWindowContentProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', company: '', role: '',
    location: '', description: '', relationship: '', notes: '',
  });
  const [formSaving, setFormSaving] = useState(false);

  // Activity feed data (React Query)
  const { data: activityEvents = [], isLoading: activityLoading } = useQuery<ActivityEvent[]>({
    queryKey: queryKeys.contactsActivity,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/contacts/activity?days=7&limit=50`);
      if (!res.ok) throw new Error('Failed to load activity');
      return res.json();
    },
    refetchInterval: 60000, // Poll every minute
  });

  // Today's people data (React Query)
  const { data: todayContacts = [] } = useQuery({
    queryKey: queryKeys.contactsToday,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/contacts/today`);
      if (!res.ok) throw new Error('Failed to load today contacts');
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Load contact detail
  const loadContactDetail = useCallback(async (contactId: string) => {
    setDetailLoading(true);
    setEditMode(false);
    setHistory([]);
    setShowNetwork(false);
    try {
      const [detailRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/contacts/${contactId}`),
        fetch(`${API_BASE}/api/contacts/${contactId}/history?limit=20`),
      ]);
      if (!detailRes.ok) throw new Error('Failed to load contact');
      const data = await detailRes.json();
      setSelectedContact(data);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(Array.isArray(historyData) ? historyData : []);
      }
    } catch (err) {
      console.error('Detail load error:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Toggle pin
  const togglePin = useCallback(async () => {
    if (!selectedContact) return;
    try {
      const response = await fetch(`${API_BASE}/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !selectedContact.pinned }),
      });
      if (!response.ok) throw new Error('Failed to update');
      const updated = await response.json();
      setSelectedContact(updated);
    } catch (err) {
      console.error('Pin toggle error:', err);
    }
  }, [selectedContact]);

  // Lazy search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/contacts?search=${encodeURIComponent(searchQuery)}&limit=50`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Create contact
  const handleCreateContact = useCallback(async () => {
    if (!formData.name.trim()) return;
    setFormSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Failed to create contact');
      const created = await response.json();
      setShowAddForm(false);
      setFormData({ name: '', phone: '', email: '', company: '', role: '', location: '', description: '', relationship: '', notes: '' });
      loadContactDetail(created.id);
    } catch (err) {
      console.error('Create error:', err);
    } finally {
      setFormSaving(false);
    }
  }, [formData, loadContactDetail]);

  // Save edit
  const handleSaveEdit = useCallback(async () => {
    if (!selectedContact) return;
    setFormSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Failed to update contact');
      const updated = await response.json();
      setSelectedContact(updated);
      setEditMode(false);
    } catch (err) {
      console.error('Update error:', err);
    } finally {
      setFormSaving(false);
    }
  }, [selectedContact, formData]);

  // Enter edit mode
  const startEdit = useCallback(() => {
    if (!selectedContact) return;
    setFormData({
      name: selectedContact.name || '',
      phone: selectedContact.phone || '',
      email: selectedContact.email || '',
      company: selectedContact.company || '',
      role: selectedContact.role || '',
      location: selectedContact.location || '',
      description: selectedContact.description || '',
      relationship: selectedContact.relationship || '',
      notes: selectedContact.notes || '',
    });
    setEditMode(true);
  }, [selectedContact]);

  // Auto-select from initialContactName
  useEffect(() => {
    if (!initialContactName) return;
    const doSearch = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/contacts?search=${encodeURIComponent(initialContactName)}&limit=1`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.length > 0) loadContactDetail(data[0].id);
      } catch { /* ignore */ }
    };
    doSearch();
  }, [initialContactName, loadContactDetail]);

  // Inline form component
  const ContactForm = ({ onSubmit, onCancel, submitLabel }: { onSubmit: () => void; onCancel: () => void; submitLabel: string }) => (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: 'name', label: 'Name', required: true },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'company', label: 'Company' },
          { key: 'role', label: 'Title' },
          { key: 'location', label: 'Location' },
        ].map(({ key, label, required }) => (
          <div key={key}>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{label}{required && ' *'}</label>
            <input
              type="text"
              value={formData[key as keyof typeof formData]}
              onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full mt-0.5 px-2 py-1.5 text-xs bg-[var(--surface-sunken)] border border-[var(--border-default)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-claude)]/50"
              placeholder={label}
            />
          </div>
        ))}
      </div>
      {[
        { key: 'description', label: 'Description' },
        { key: 'relationship', label: 'Relationship' },
        { key: 'notes', label: 'Notes' },
      ].map(({ key, label }) => (
        <div key={key}>
          <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{label}</label>
          <textarea
            value={formData[key as keyof typeof formData]}
            onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
            rows={2}
            className="w-full mt-0.5 px-2 py-1.5 text-xs bg-[var(--surface-sunken)] border border-[var(--border-default)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-claude)]/50 resize-none"
            placeholder={label}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--surface-muted)]">
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={formSaving || (!formData.name.trim())}
          className="px-3 py-1.5 text-xs bg-[var(--color-claude)] text-white rounded-md hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-1"
        >
          {formSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );

  // Network view
  if (showNetwork) {
    return (
      <div className="flex flex-col h-full bg-[var(--surface-base)]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-default)]">
          <button
            onClick={() => setShowNetwork(false)}
            className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-secondary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-medium text-[var(--text-primary)]">Network Graph</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <NetworkGraph onSelectContact={(id) => { setShowNetwork(false); loadContactDetail(id); }} />
        </div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex h-full bg-[var(--surface-base)]" data-testid="contacts-app">
      {/* Left panel: Activity feed / Search results */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-[var(--border-default)]">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-raised)] border-b border-[var(--border-default)]">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              data-testid="contacts-search"
              className="w-full pl-7 pr-7 py-1.5 text-xs bg-[var(--surface-sunken)] border border-[var(--border-default)] rounded-md placeholder-[var(--text-tertiary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-claude)]/50"
            />
            {isSearching && (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--surface-muted)]"
              >
                <X className="w-3 h-3 text-[var(--text-tertiary)]" />
              </button>
            )}
          </div>

          <button
            onClick={() => {
              setShowAddForm(true);
              setSelectedContact(null);
              setFormData({ name: '', phone: '', email: '', company: '', role: '', location: '', description: '', relationship: '', notes: '' });
            }}
            className="p-1.5 rounded hover:bg-[var(--surface-muted)] transition-colors"
            title="Add Contact"
            data-testid="contacts-add-btn"
          >
            <UserPlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </button>

          <button
            onClick={() => setShowNetwork(true)}
            className="p-1.5 rounded hover:bg-[var(--surface-muted)] transition-colors"
            title="Network Graph"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto min-h-0">
          {isSearching ? (
            /* Search results */
            <div className="py-1">
              {searchLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <p className="text-sm text-[var(--text-secondary)]">No contacts found</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">Try a different search</p>
                </div>
              ) : (
                <div className="px-1">
                  {searchResults.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => loadContactDetail(contact.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                        selectedContact?.id === contact.id
                          ? 'bg-[var(--color-claude)]/10'
                          : 'hover:bg-[var(--surface-muted)]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--color-claude)]/15 text-[var(--color-claude)] flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{contact.name}</span>
                          {contact.pinned && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                        </div>
                        {(contact.company || contact.description) && (
                          <p className="text-[10px] text-[var(--text-secondary)] truncate">
                            {contact.company || contact.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Activity feed view */
            <>
              {/* Today's People strip */}
              <TodayPeopleStrip
                contacts={todayContacts}
                onSelect={loadContactDetail}
                selectedId={selectedContact?.id}
              />

              {/* Activity feed */}
              <ActivityFeed
                events={activityEvents}
                loading={activityLoading}
                onSelectContact={loadContactDetail}
              />
            </>
          )}
        </div>
      </div>

      {/* Right panel: Contact detail / Add form */}
      <div className="w-80 flex flex-col bg-[var(--surface-raised)]" style={{ minWidth: '280px', maxWidth: '360px' }}>
        {showAddForm ? (
          <>
            <div className="px-4 py-3 border-b border-[var(--border-default)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">New Contact</h3>
            </div>
            <div className="flex-1 overflow-auto">
              <ContactForm
                onSubmit={handleCreateContact}
                onCancel={() => setShowAddForm(false)}
                submitLabel="Create"
              />
            </div>
          </>
        ) : !selectedContact ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <div className="w-14 h-14 rounded-full bg-[var(--color-claude)]/10 flex items-center justify-center mx-auto mb-3">
                <User className="w-7 h-7 text-[var(--color-claude)]" />
              </div>
              <p className="text-sm text-[var(--text-primary)] font-medium mb-1">No contact selected</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Select from the activity feed or search
              </p>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : editMode ? (
          <>
            <div className="px-4 py-3 border-b border-[var(--border-default)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Edit {selectedContact.name}</h3>
            </div>
            <div className="flex-1 overflow-auto">
              <ContactForm
                onSubmit={handleSaveEdit}
                onCancel={() => setEditMode(false)}
                submitLabel="Save"
              />
            </div>
          </>
        ) : (
          <>
            {/* Detail Header */}
            <div className="px-4 py-3 border-b border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-claude)] to-[var(--color-primary-hover)] text-white flex items-center justify-center text-lg font-medium shadow-sm flex-shrink-0">
                  {selectedContact.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate" data-testid="contact-detail-name">
                    {selectedContact.name}
                  </h3>
                  {selectedContact.description && (
                    <p className="text-[10px] text-[var(--text-secondary)] truncate">{selectedContact.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={togglePin}
                  className={`p-1.5 rounded hover:bg-[var(--surface-muted)] transition-colors ${
                    selectedContact.pinned ? 'text-yellow-500' : 'text-[var(--text-tertiary)]'
                  }`}
                  title={selectedContact.pinned ? 'Unpin' : 'Pin'}
                >
                  <Star className={`w-3.5 h-3.5 ${selectedContact.pinned ? 'fill-yellow-500' : ''}`} />
                </button>
                <button
                  onClick={() => setShowContactInfo(true)}
                  className="p-1.5 rounded hover:bg-[var(--surface-muted)] text-[var(--text-tertiary)] transition-colors"
                  title="Get Info"
                >
                  <Users className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={startEdit}
                  className="p-1.5 rounded hover:bg-[var(--surface-muted)] text-[var(--text-tertiary)] transition-colors"
                  title="Edit"
                  data-testid="contact-edit-btn"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="contact-detail">
              {/* Current State */}
              {selectedContact.current_state && (
                <div className="px-3 py-2 bg-[var(--color-claude)]/5 border border-[var(--color-claude)]/15 rounded-lg">
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{selectedContact.current_state}</p>
                </div>
              )}

              {/* Contact Info */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Contact Info</h4>
                {selectedContact.phone && (
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="w-3 h-3 text-[var(--color-claude)]" />
                    <span className="text-[var(--text-primary)]">{selectedContact.phone}</span>
                  </div>
                )}
                {selectedContact.email && (
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="w-3 h-3 text-[var(--color-claude)]" />
                    <span className="text-[var(--text-primary)]">{selectedContact.email}</span>
                  </div>
                )}
                {selectedContact.company && (
                  <div className="flex items-center gap-2 text-xs">
                    <Briefcase className="w-3 h-3 text-[var(--color-claude)]" />
                    <span className="text-[var(--text-primary)]">
                      {selectedContact.company}
                      {selectedContact.role && <span className="text-[var(--text-secondary)]"> · {selectedContact.role}</span>}
                    </span>
                  </div>
                )}
                {selectedContact.location && (
                  <div className="flex items-center gap-2 text-xs">
                    <MapPin className="w-3 h-3 text-[var(--color-claude)]" />
                    <span className="text-[var(--text-primary)]">{selectedContact.location}</span>
                  </div>
                )}
                {selectedContact.linkedin_url && (
                  <div className="flex items-center gap-2 text-xs">
                    <Linkedin className="w-3 h-3 text-[var(--color-claude)]" />
                    <a href={selectedContact.linkedin_url} target="_blank" rel="noopener noreferrer"
                       className="text-[var(--color-claude)] hover:underline">
                      LinkedIn
                    </a>
                  </div>
                )}
              </div>

              {/* Relationship */}
              {selectedContact.relationship && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Relationship</h4>
                  <p className="text-xs text-[var(--text-primary)]">{selectedContact.relationship}</p>
                </div>
              )}

              {/* Context Notes */}
              {selectedContact.context_notes && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Context</h4>
                  <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{selectedContact.context_notes}</p>
                </div>
              )}

              {/* Value Exchange */}
              {selectedContact.value_exchange && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Value Exchange</h4>
                  <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{selectedContact.value_exchange}</p>
                </div>
              )}

              {/* Notes */}
              {selectedContact.notes && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Notes</h4>
                  <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{selectedContact.notes}</p>
                </div>
              )}

              {/* Tags */}
              {selectedContact.tags && selectedContact.tags.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContact.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-[10px] bg-[var(--color-claude)]/10 text-[var(--color-claude)] rounded-full border border-[var(--color-claude)]/20 flex items-center gap-1"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    History
                  </h4>
                  <div className="space-y-1">
                    {history.map((h) => (
                      <div key={h.id} className="flex gap-2 text-xs">
                        <span className="text-[10px] text-[var(--text-tertiary)] font-mono whitespace-nowrap mt-0.5">
                          {h.entry_date}
                        </span>
                        <p className="text-[var(--text-primary)] text-[11px] flex-1">{h.entry}</p>
                        {h.source !== 'chief' && (
                          <span className="text-[9px] text-[var(--text-tertiary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded self-start">
                            {h.source}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-3 border-t border-[var(--border-default)] space-y-1">
                {selectedContact.last_contact_date && (
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                    <Calendar className="w-3 h-3" />
                    <span>Last contact: {new Date(selectedContact.last_contact_date).toLocaleDateString()}</span>
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  Created {new Date(selectedContact.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Contact Info Panel (modal) */}
      {showContactInfo && selectedContact && (
        <ContactInfoPanel
          contact={selectedContact}
          onClose={() => setShowContactInfo(false)}
        />
      )}
    </div>
  );
}

export default ContactsWindowContent;
