'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Info,
  X,
  Check,
  ChevronDown,
} from 'lucide-react';
import { ContactInfoPanel } from './ContactInfoPanel';
import { API_BASE } from '@/lib/api';

const CLAUDE_CORAL = '#DA7756';

interface ContactListItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  description?: string;
  pinned: boolean;
  tags: string[];
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

// Group contacts by first letter
function groupByLetter(contacts: ContactListItem[]): Map<string, ContactListItem[]> {
  const groups = new Map<string, ContactListItem[]>();
  for (const contact of contacts) {
    const letter = contact.name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(contact);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  }));
}

/**
 * Contacts content for windowed mode.
 * Two-column layout: alphabetical list + detail panel with edit support.
 */
export function ContactsWindowContent() {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Add/Edit form state
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', company: '', role: '',
    location: '', description: '', relationship: '', notes: '',
  });
  const [formSaving, setFormSaving] = useState(false);

  // Sorted and grouped contacts
  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  const groupedContacts = useMemo(() => {
    return groupByLetter(sortedContacts);
  }, [sortedContacts]);

  // Load contact detail
  const loadContactDetail = useCallback(async (contactId: string) => {
    setDetailLoading(true);
    setEditMode(false);
    try {
      const response = await fetch(`${API_BASE}/api/contacts/${contactId}`);
      if (!response.ok) throw new Error('Failed to load contact');
      const data = await response.json();
      setSelectedContact(data);
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
      setContacts(prev => prev.map(c => (c.id === updated.id ? { ...c, pinned: updated.pinned } : c)));
    } catch (err) {
      console.error('Pin toggle error:', err);
    }
  }, [selectedContact]);

  // Search contacts
  const searchContacts = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/contacts?search=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all contacts
  const loadAllContacts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/contacts?limit=10000`);
      if (!response.ok) throw new Error('Load failed');
      const data = await response.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
      loadAllContacts();
      loadContactDetail(created.id);
    } catch (err) {
      console.error('Create error:', err);
    } finally {
      setFormSaving(false);
    }
  }, [formData, loadAllContacts, loadContactDetail]);

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
      loadAllContacts();
    } catch (err) {
      console.error('Update error:', err);
    } finally {
      setFormSaving(false);
    }
  }, [selectedContact, formData, loadAllContacts]);

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

  // Initial load
  useEffect(() => { loadAllContacts(); }, [loadAllContacts]);

  // Handle search
  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => searchContacts(searchQuery), 300);
      return () => clearTimeout(timer);
    } else {
      loadAllContacts();
    }
  }, [searchQuery, searchContacts, loadAllContacts]);

  // Inline form component
  const ContactForm = ({ onSubmit, onCancel, submitLabel }: { onSubmit: () => void; onCancel: () => void; submitLabel: string }) => (
    <div className="p-4 space-y-3" data-testid="contact-form">
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
            <label className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">{label}{required && ' *'}</label>
            <input
              type="text"
              value={formData[key as keyof typeof formData]}
              onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full mt-0.5 px-2 py-1.5 text-xs bg-white/80 dark:bg-black/20 border border-[#C0C0C0] dark:border-[#4a4a4a] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#DA7756]/50"
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
          <label className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">{label}</label>
          <textarea
            value={formData[key as keyof typeof formData]}
            onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
            rows={2}
            className="w-full mt-0.5 px-2 py-1.5 text-xs bg-white/80 dark:bg-black/20 border border-[#C0C0C0] dark:border-[#4a4a4a] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#DA7756]/50 resize-none"
            placeholder={label}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-[#8E8E93] hover:text-[var(--text-primary)] rounded-md hover:bg-black/5 dark:hover:bg-white/10">
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={formSaving || (!formData.name.trim())}
          className="px-3 py-1.5 text-xs bg-[#DA7756] text-white rounded-md hover:bg-[#C15F3C] disabled:opacity-50 flex items-center gap-1"
        >
          {formSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[var(--surface-base)]" data-testid="contacts-app">
      {/* macOS-style Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-[#E8E8E8] to-[#D4D4D4] dark:from-[#3d3d3d] dark:to-[#323232] border-b border-[#B8B8B8] dark:border-[#2a2a2a]">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center flex-shrink-0">
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="currentColor">
              <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[var(--text-primary)]">Contacts</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            data-testid="contacts-search"
            className="w-full pl-7 pr-2 py-1 text-xs bg-white/80 dark:bg-black/20 border border-[#C0C0C0] dark:border-[#4a4a4a] rounded-md placeholder-[#8E8E93] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#DA7756]/50 focus:border-[#DA7756]"
          />
        </div>

        {/* Add Contact */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => {
              setShowAddForm(true);
              setFormData({ name: '', phone: '', email: '', company: '', role: '', location: '', description: '', relationship: '', notes: '' });
            }}
            className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Add Contact"
            data-testid="contacts-add-btn"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#8e8e93]" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Contact List with alphabetical sections */}
        <div className="w-64 flex flex-col border-r border-[#D1D1D1] dark:border-[#3a3a3a] bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl">
          <div className="flex-1 overflow-auto" data-testid="contacts-list">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
              </div>
            ) : sortedContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-[#DA7756]" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                  {searchQuery ? 'No results found' : 'No contacts yet'}
                </p>
                <p className="text-xs text-[#8E8E93]">
                  {searchQuery ? 'Try a different search' : 'Add your first contact'}
                </p>
              </div>
            ) : (
              <div className="py-1">
                {Array.from(groupedContacts.entries()).map(([letter, group]) => (
                  <div key={letter}>
                    {/* Section header */}
                    <div className="sticky top-0 px-3 py-1 text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider bg-[#E8E8E8]/90 dark:bg-[#2a2a2a]/90 backdrop-blur-sm border-b border-[#D1D1D1]/50 dark:border-[#3a3a3a]/50">
                      {letter}
                    </div>
                    {/* Contacts in section */}
                    <div className="px-1.5 py-0.5 space-y-0.5">
                      {group.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => loadContactDetail(contact.id)}
                          data-testid={`contact-row-${contact.id}`}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                            selectedContact?.id === contact.id
                              ? 'bg-[#DA7756] text-white'
                              : 'hover:bg-black/5 dark:hover:bg-white/10'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                            selectedContact?.id === contact.id
                              ? 'bg-white/20 text-white'
                              : 'bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 text-[#DA7756]'
                          }`}>
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate text-xs">{contact.name}</span>
                              {contact.pinned && (
                                <Star className={`w-3 h-3 flex-shrink-0 ${
                                  selectedContact?.id === contact.id ? 'text-yellow-300 fill-yellow-300' : 'text-yellow-500 fill-yellow-500'
                                }`} />
                              )}
                            </div>
                            {(contact.company || contact.description) && (
                              <p className={`text-[10px] truncate ${
                                selectedContact?.id === contact.id ? 'text-white/70' : 'text-[#8E8E93]'
                              }`}>
                                {contact.company || contact.description}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status footer */}
          <div className="px-3 py-1.5 border-t border-[#D1D1D1] dark:border-[#3a3a3a] text-[10px] text-[#8E8E93] bg-[#F5F5F5] dark:bg-[#2a2a2a]">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Right: Contact Detail / Add Form / Edit Form */}
        <div className="flex-1 flex flex-col bg-[var(--surface-raised)]">
          {showAddForm ? (
            <>
              <div className="px-4 py-3 border-b border-[#E5E5E5] dark:border-[#3a3a3a] bg-gradient-to-b from-[#FAFAFA] to-[#F5F5F5] dark:from-[#2a2a2a] dark:to-[#252525]">
                <h3 className="font-semibold text-base text-[var(--text-primary)]">New Contact</h3>
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
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center mx-auto mb-3">
                  <User className="w-8 h-8 text-[#DA7756]" />
                </div>
                <p className="text-sm text-[var(--text-primary)] font-medium mb-1">No contact selected</p>
                <p className="text-xs text-[#8E8E93]">Select a contact to view details</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#8E8E93]" />
            </div>
          ) : editMode ? (
            <>
              <div className="px-4 py-3 border-b border-[#E5E5E5] dark:border-[#3a3a3a] bg-gradient-to-b from-[#FAFAFA] to-[#F5F5F5] dark:from-[#2a2a2a] dark:to-[#252525]">
                <h3 className="font-semibold text-base text-[var(--text-primary)]">Edit {selectedContact.name}</h3>
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
              <div className="px-4 py-3 border-b border-[#E5E5E5] dark:border-[#3a3a3a] flex items-center justify-between bg-gradient-to-b from-[#FAFAFA] to-[#F5F5F5] dark:from-[#2a2a2a] dark:to-[#252525]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white flex items-center justify-center text-lg font-medium shadow-sm">
                    {selectedContact.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-base text-[var(--text-primary)]" data-testid="contact-detail-name">{selectedContact.name}</h3>
                    {selectedContact.description && (
                      <p className="text-xs text-[#8E8E93]">{selectedContact.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={togglePin}
                    className={`p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${
                      selectedContact.pinned ? 'text-yellow-500' : 'text-[#8E8E93]'
                    }`}
                    title={selectedContact.pinned ? 'Unpin' : 'Pin'}
                  >
                    <Star className={`w-4 h-4 ${selectedContact.pinned ? 'fill-yellow-500' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShowContactInfo(true)}
                    className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#8E8E93] transition-colors"
                    title="Get Info"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <button
                    onClick={startEdit}
                    className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#8E8E93] transition-colors"
                    title="Edit"
                    data-testid="contact-edit-btn"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="contact-detail">
                {/* Contact Info */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Contact Info</h4>

                  {selectedContact.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-3.5 h-3.5 text-[#DA7756]" />
                      <span className="text-[var(--text-primary)]">{selectedContact.phone}</span>
                    </div>
                  )}

                  {selectedContact.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-3.5 h-3.5 text-[#DA7756]" />
                      <span className="text-[var(--text-primary)]">{selectedContact.email}</span>
                    </div>
                  )}

                  {selectedContact.company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-3.5 h-3.5 text-[#DA7756]" />
                      <div>
                        <span className="text-[var(--text-primary)]">{selectedContact.company}</span>
                        {selectedContact.role && <span className="text-[#8E8E93]"> · {selectedContact.role}</span>}
                      </div>
                    </div>
                  )}

                  {selectedContact.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-3.5 h-3.5 text-[#DA7756]" />
                      <span className="text-[var(--text-primary)]">{selectedContact.location}</span>
                    </div>
                  )}
                </div>

                {/* Relationship */}
                {selectedContact.relationship && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Relationship</h4>
                    <p className="text-sm text-[var(--text-primary)]">{selectedContact.relationship}</p>
                  </div>
                )}

                {/* Context Notes */}
                {selectedContact.context_notes && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Context</h4>
                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{selectedContact.context_notes}</p>
                  </div>
                )}

                {/* Value Exchange */}
                {selectedContact.value_exchange && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Value Exchange</h4>
                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{selectedContact.value_exchange}</p>
                  </div>
                )}

                {/* Notes */}
                {selectedContact.notes && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Notes</h4>
                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{selectedContact.notes}</p>
                  </div>
                )}

                {/* Tags */}
                {selectedContact.tags && selectedContact.tags.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedContact.tags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-gradient-to-br from-[#DA7756]/10 to-[#C15F3C]/20 text-[#DA7756] rounded-full flex items-center gap-1 border border-[#DA7756]/20"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="pt-4 border-t border-[#E5E5E5] dark:border-[#3a3a3a] space-y-1">
                  {selectedContact.last_contact_date && (
                    <div className="flex items-center gap-2 text-xs text-[#8E8E93]">
                      <Calendar className="w-3 h-3" />
                      <span>Last contact: {new Date(selectedContact.last_contact_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  <p className="text-xs text-[#8E8E93]">
                    Created {new Date(selectedContact.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contact Info Panel */}
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
