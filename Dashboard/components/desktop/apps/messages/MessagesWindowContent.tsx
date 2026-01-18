'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search,
  MessageCircle,
  Loader2,
  Send,
  Maximize2,
  User,
  Phone,
  Clock,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { toast } from 'sonner';

// Claude OS themed colors (matching Finder)
const CLAUDE_CORAL = '#DA7756';
const CLAUDE_CORAL_LIGHT = '#E8A088';

// Claude logo badge component
function ClaudeBadge() {
  return (
    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center flex-shrink-0">
      <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
        <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
      </svg>
    </div>
  );
}

interface Conversation {
  id: string;
  display_name: string;
  last_message_text: string;
  last_message_date: string;
  unread_count: number;
  is_group: boolean;
  participants: string[];
}

interface Message {
  id: string;
  text: string;
  date: string;
  is_from_me: boolean;
  sender_handle?: string;
}

/**
 * Messages content for windowed mode.
 * Two-column layout: conversations list + message thread.
 */
export function MessagesWindowContent() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/messages/conversations?limit=50`);
      if (!response.ok) throw new Error('Failed to load conversations');
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Load conversations error:', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load messages for a conversation
  const loadMessages = useCallback(async (chatId: string) => {
    setMessagesLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/messages/conversations/${encodeURIComponent(chatId)}/messages?limit=50`
      );
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Load messages error:', err);
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Send message
  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedChat) return;

    setSending(true);
    try {
      // Extract phone number from participants or use id
      const recipient = selectedChat.participants[0] || selectedChat.display_name;

      const response = await fetch(`${API_BASE}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient,
          text: newMessage,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      // Clear input and reload messages
      setNewMessage('');
      await loadMessages(selectedChat.id);
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  }, [newMessage, selectedChat, loadMessages]);

  // Search conversations
  const searchConversations = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadConversations();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/messages/search?q=${encodeURIComponent(query)}&limit=50`
      );
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();

      // Group search results by conversation
      const chatMap = new Map<string, Message[]>();
      (data.messages || []).forEach((msg: Message) => {
        const existing = chatMap.get(msg.id) || [];
        chatMap.set(msg.id, [...existing, msg]);
      });

      // Convert to conversations (simplified)
      const searchResults: Conversation[] = Array.from(chatMap.entries()).map(
        ([id, msgs]) => ({
          id,
          display_name: 'Search Result',
          last_message_text: msgs[0].text,
          last_message_date: msgs[0].date,
          unread_count: 0,
          is_group: false,
          participants: [],
        })
      );

      setConversations(searchResults);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [loadConversations]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Handle search
  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => searchConversations(searchQuery), 300);
      return () => clearTimeout(timer);
    } else {
      loadConversations();
    }
  }, [searchQuery, searchConversations, loadConversations]);

  // Auto-scroll to bottom when messages load or change
  useEffect(() => {
    if (!messagesLoading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, messagesLoading]);

  // Handle conversation selection
  const handleSelectConversation = useCallback(
    (conversation: Conversation) => {
      setSelectedChat(conversation);
      loadMessages(conversation.id);
    },
    [loadMessages]
  );

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-base)] select-none">
      {/* Toolbar - macOS style (matching Finder) */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-[#E8E8E8] to-[#D4D4D4] dark:from-[#3d3d3d] dark:to-[#323232] border-b border-[#B8B8B8] dark:border-[#2a2a2a]">
        {/* Claude branding */}
        <div className="flex items-center gap-2">
          <ClaudeBadge />
          <span className="text-sm font-medium text-[var(--text-primary)]">Claude Messages</span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#DA7756] focus:border-[#DA7756]"
            />
          </div>
        </div>

        {/* Fullscreen button */}
        <button
          onClick={() => {
            console.log('Fullscreen not yet implemented');
          }}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Open fullscreen"
        >
          <Maximize2 className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Conversations List */}
        <div className="w-72 flex flex-col bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl border-r border-[#D1D1D1] dark:border-[#3a3a3a]">

        {/* Conversations List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-[#8E8E93]">
              <MessageCircle className="w-8 h-8 mb-2 opacity-30" style={{ color: CLAUDE_CORAL }} />
              <p className="text-sm">
                {searchQuery ? 'No messages found' : 'No conversations'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-colors ${
                    selectedChat?.id === conv.id
                      ? 'bg-[#DA7756]/10 dark:bg-[#DA7756]/20'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                      selectedChat?.id === conv.id
                        ? 'bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white'
                        : 'bg-[#DA7756]/10 dark:bg-[#DA7756]/20 text-[#DA7756]'
                    }`}
                  >
                    {conv.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className="font-medium text-sm truncate">
                        {conv.display_name}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatDate(conv.last_message_date)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {conv.last_message_text}
                    </p>
                    {conv.unread_count > 0 && (
                      <div className="mt-1">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-blue-500 text-white rounded-full">
                          {conv.unread_count}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

          {/* Status */}
          <div className="px-3 py-1.5 border-t border-[#D1D1D1] dark:border-[#3a3a3a] text-xs text-[#8E8E93]">
            {conversations.length} conversations
          </div>
        </div>

        {/* Right: Message Thread */}
        <div className="flex-1 flex flex-col bg-white dark:bg-[#1e1e1e]">
          {!selectedChat ? (
            <div className="flex-1 flex items-center justify-center text-[#8E8E93]">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: CLAUDE_CORAL }} />
                <p className="text-sm">Select a conversation to view messages</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 bg-[#FAFAFA] dark:bg-[#252525] border-b border-[#E5E5E5] dark:border-[#3a3a3a] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white flex items-center justify-center text-lg font-medium">
                    {selectedChat.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{selectedChat.display_name}</h3>
                    {selectedChat.is_group && (
                      <p className="text-xs text-[#8E8E93]">
                        {selectedChat.participants.length} participants
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[#8E8E93]">
                  <Phone className="w-5 h-5" />
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-auto p-4 space-y-3 w-full">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-[#8E8E93]">
                    <p className="text-sm">No messages</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex w-full ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 break-words ${
                          msg.is_from_me
                            ? 'bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white'
                            : 'bg-[#F0F0F0] dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-100'
                        }`}
                      >
                      {!msg.is_from_me && selectedChat.is_group && (
                        <div className="text-xs opacity-70 mb-1">
                          {msg.sender_handle || 'Unknown'}
                        </div>
                      )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                        <div
                          className={`text-xs mt-1 flex items-center gap-1 ${
                            msg.is_from_me ? 'text-white/70' : 'text-gray-500'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {formatDate(msg.date)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className="border-t border-[#E5E5E5] dark:border-[#3a3a3a] bg-[#FAFAFA] dark:bg-[#252525] p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="iMessage"
                    rows={1}
                    className="flex-1 px-3 py-2 text-sm bg-white dark:bg-[#2a2a2a] border border-[#E5E5E5] dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#DA7756] focus:border-[#DA7756] resize-none"
                    style={{
                      minHeight: '36px',
                      maxHeight: '120px',
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="p-2 rounded-lg bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    title="Send (Enter)"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-[#8E8E93] mt-1">Press Enter to send, Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessagesWindowContent;
