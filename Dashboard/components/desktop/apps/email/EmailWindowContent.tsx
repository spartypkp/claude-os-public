'use client';

import { useChatPanel } from '@/components/context/ChatPanelContext';
import { API_BASE, finderCreateFile } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	AlertTriangle,
	Archive,
	ChevronDown,
	ChevronRight,
	ExternalLink,
	FileText,
	Inbox,
	Info,
	Loader2,
	Mail,
	RefreshCw,
	Search,
	Send,
	Settings,
	Trash2
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowStore } from '@/store/windowStore';

// Claude icon SVG component
function ClaudeIcon({ className = "w-4 h-4" }: { className?: string; }) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
		</svg>
	);
}

// Mini Claude badge
function ClaudeBadgeMini() {
	return (
		<div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center flex-shrink-0" title="Claude's Account">
			<ClaudeIcon className="w-2.5 h-2.5 text-white" />
		</div>
	);
}

interface EmailMessage {
	id: string;
	subject: string;
	sender: string;
	sender_name?: string;
	date_received: string;
	is_read: boolean;
	is_flagged: boolean;
	mailbox: string;
	account: string;
	content?: string;
	snippet?: string;
	recipients?: string[];
}

interface Mailbox {
	id: string;
	name: string;
	account: string;
	unread_count: number;
}

interface EmailAccount {
	id: string;
	name: string;
	email: string;
	provider: string;
	can_read: boolean;
	can_send: boolean;
	can_draft: boolean;
	is_claude_account: boolean;
}

type MailboxView = 'INBOX' | 'Sent' | 'Archive' | 'Trash' | 'Drafts' | 'Spam';
type MailboxKey = MailboxView;

const MAILBOX_CONFIG: Record<MailboxKey, { icon: React.ReactNode; label: string; }> = {
	INBOX: { icon: <Inbox className="w-4 h-4" />, label: 'Inbox' },
	Sent: { icon: <Send className="w-4 h-4" />, label: 'Sent' },
	Archive: { icon: <Archive className="w-4 h-4" />, label: 'Archive' },
	Trash: { icon: <Trash2 className="w-4 h-4" />, label: 'Trash' },
	Drafts: { icon: <FileText className="w-4 h-4" />, label: 'Drafts' },
	Spam: { icon: <AlertTriangle className="w-4 h-4" />, label: 'Spam' },
};

// Account color palette (coral-based)
const ACCOUNT_COLORS = [
	'bg-[#DA7756]',
	'bg-emerald-500',
	'bg-violet-500',
	'bg-amber-500',
	'bg-cyan-500',
	'bg-rose-500',
];

function getAccountColor(index: number): string {
	return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
}

/**
 * Claude-branded Email app - View-focused with Claude integration.
 * 
 * Purpose: Browse and read emails, then engage Claude for any actions.
 * - No compose UI (drafts open in Mail.app/browser)
 * - "Talk to Claude" is the primary action
 * - Claude Activity section shows queue + sent history
 */
export function EmailWindowContent() {
	const { isOpen: chatPanelOpen, toggleVisibility } = useChatPanel();
	const queryClient = useQueryClient();

	// UI state (not cached)
	const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
	const [selectedMailbox, setSelectedMailbox] = useState<string>('INBOX');
	const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
	const [loadingMessage, setLoadingMessage] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [messageLimit, setMessageLimit] = useState(100);
	const [showAccountsSection, setShowAccountsSection] = useState(true);
	const [showAccountInfo, setShowAccountInfo] = useState(false);
	const { openAppWindow } = useWindowStore();

	// === React Query hooks (cached data) ===

	// Accounts - cached globally
	const { data: accounts = [] } = useQuery<EmailAccount[]>({
		queryKey: queryKeys.emailAccounts,
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/email/accounts/full`);
			if (!response.ok) throw new Error('Failed to fetch accounts');
			const data = await response.json();
			return Array.isArray(data) ? data : data.accounts || [];
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	useEffect(() => {
		if (!selectedAccount && accounts.length > 0) {
			setSelectedAccount(accounts[0].id);
		}
	}, [accounts, selectedAccount]);

	useEffect(() => {
		if (selectedAccount) {
			setSelectedMailbox('INBOX');
		}
	}, [selectedAccount]);

	// Mailboxes - cached per account
	const { data: mailboxes = [] } = useQuery<Mailbox[]>({
		queryKey: [...queryKeys.emailMailboxes, selectedAccount],
		queryFn: async () => {
			const url = selectedAccount
				? `${API_BASE}/api/email/mailboxes?account=${encodeURIComponent(selectedAccount)}`
				: `${API_BASE}/api/email/mailboxes`;
			const response = await fetch(url);
			if (!response.ok) throw new Error('Failed to fetch mailboxes');
			const data = await response.json();
			return Array.isArray(data) ? data : data.mailboxes || [];
		},
		enabled: !!selectedAccount,
		staleTime: 60 * 1000, // 1 minute
	});

	// Messages - cached per mailbox + account
	const { data: messages = [], isLoading: loading, error: messagesError } = useQuery<EmailMessage[]>({
		queryKey: [...queryKeys.emailMessages(selectedMailbox), selectedAccount, messageLimit],
		queryFn: async () => {
			let url = `${API_BASE}/api/email/messages?mailbox=${encodeURIComponent(selectedMailbox)}&limit=${messageLimit}`;
			if (selectedAccount) {
				url += `&account=${encodeURIComponent(selectedAccount)}`;
			}
			const response = await fetch(url);
			if (!response.ok) throw new Error('Failed to fetch messages');
			const data = await response.json();
			return Array.isArray(data) ? data : data.messages || [];
		},
		enabled: !!selectedAccount && !searchQuery,
		staleTime: 0, // Always fetch fresh to avoid cache issues
		refetchOnMount: true,
	});

	// Search results (not cached long)
	const { data: searchResults = [], isLoading: searchLoading } = useQuery<EmailMessage[]>({
		queryKey: ['email', 'search', searchQuery, selectedAccount],
		queryFn: async () => {
			let url = `${API_BASE}/api/email/search?query=${encodeURIComponent(searchQuery)}&limit=50`;
			if (selectedAccount) {
				url += `&account=${encodeURIComponent(selectedAccount)}`;
			}
			const response = await fetch(url);
			if (!response.ok) throw new Error('Search failed');
			const data = await response.json();
			return Array.isArray(data) ? data : data.messages || [];
		},
		enabled: !!searchQuery && !!selectedAccount,
		staleTime: 10 * 1000, // 10 seconds
	});

	// Unread count comes from mailbox data (no separate query needed)

	// Derived: which messages to display and loading state
	const displayMessages = searchQuery ? searchResults : messages;
	const isLoadingMessages = searchQuery ? searchLoading : loading;
	const error = messagesError ? 'Unable to load messages. Make sure Mail.app is running.' : null;
	const selectedAccountInfo = accounts.find(a => a.id === selectedAccount);
	const selectedAccountLabel = selectedAccountInfo?.name || 'Select account';
	const selectedAccountEmail = selectedAccountInfo?.email || '';
	const selectedAccountIndex = accounts.findIndex(a => a.id === selectedAccount);
	const selectedAccountColor = selectedAccountIndex >= 0 ? getAccountColor(selectedAccountIndex) : 'bg-gray-300';
	const standardMailboxes = Object.keys(MAILBOX_CONFIG) as MailboxKey[];
	const dynamicMailboxes = mailboxes
		.filter((mb) => !standardMailboxes.includes(mb.name as MailboxKey))
		.sort((a, b) => a.name.localeCompare(b.name));

	useEffect(() => {
		setMessageLimit(100);
	}, [selectedMailbox, selectedAccount, searchQuery]);

	const sortedMessages = useMemo(() => {
		return [...displayMessages].sort((a, b) => {
			const aTime = new Date(a.date_received || 0).getTime();
			const bTime = new Date(b.date_received || 0).getTime();
			return bTime - aTime;
		});
	}, [displayMessages]);

	// Fetch single message with content
	const fetchMessage = useCallback(async (messageId: string, mailbox: string, account?: string) => {
		setLoadingMessage(true);
		try {
			let url = `${API_BASE}/api/email/messages/${messageId}?mailbox=${encodeURIComponent(mailbox)}`;
			if (account) {
				url += `&account=${encodeURIComponent(account)}`;
			}
			const response = await fetch(url);
			if (!response.ok) throw new Error('Failed to fetch message');
			const data = await response.json();
			setSelectedMessage(data);
		} catch (err) {
			console.error('Message fetch error:', err);
		} finally {
			setLoadingMessage(false);
		}
	}, []);

	// Clear selected message when switching views
	useEffect(() => {
		setSelectedMessage(null);
	}, [selectedMailbox, selectedAccount]);

	// Refresh handler
	const handleRefresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: queryKeys.email });
	}, [queryClient]);

	// Handle message selection
	const handleMessageSelect = (message: EmailMessage) => {
		if (selectedMessage?.id === message.id) {
			setSelectedMessage(null);
		} else {
			fetchMessage(message.id, message.mailbox, message.account);
			if (!message.is_read) {
				markAsRead(message.id, message.mailbox, message.account);
			}
		}
	};

	// Mark message as read
	const markAsRead = async (messageId: string, mailbox: string, account?: string) => {
		try {
			let url = `${API_BASE}/api/email/messages/${messageId}/read?mailbox=${encodeURIComponent(mailbox)}`;
			if (account) {
				url += `&account=${encodeURIComponent(account)}`;
			}
			await fetch(url, { method: 'POST' });
			// Invalidate to refetch with updated read status
			queryClient.invalidateQueries({ queryKey: queryKeys.email });
		} catch (err) {
			console.error('Failed to mark as read:', err);
		}
	};

	// Talk to Claude about this email
	const handleTalkToClaude = async () => {
		if (!selectedMessage) return;

		// Find the account info
		const account = accounts.find(a => a.id === selectedMessage.account || a.email === selectedMessage.account);
		const accountLabel = account?.name || selectedMessage.account;

		// Build context markdown
		const emailContext = `# Email Context

**From:** ${selectedMessage.sender_name ? `${selectedMessage.sender_name} <${selectedMessage.sender}>` : selectedMessage.sender}
**To:** ${accountLabel}
**Subject:** ${selectedMessage.subject || '(no subject)'}
**Date:** ${formatFullDate(selectedMessage.date_received)}

---

${selectedMessage.content || '(no content)'}
`;

		// Save to working/ folder
		const timestamp = Date.now();
		const safeName = (selectedMessage.subject || 'email').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
		const filename = `email-${safeName}-${timestamp}.md`;

		try {
			await finderCreateFile(`working/${filename}`, emailContext);

			// Dispatch attach-to-chat event
			window.dispatchEvent(new CustomEvent('attach-to-chat', {
				detail: { path: `Desktop/working/${filename}` }
			}));

			// Make sure Claude panel is visible (only toggle if closed)
			if (!chatPanelOpen) {
				toggleVisibility();
			}
		} catch (err) {
			console.error('Failed to create email context file:', err);
			// Fallback: just show panel
			if (!chatPanelOpen) {
				toggleVisibility();
			}
		}
	};

	// Format date for display
	const formatDate = (dateStr: string) => {
		try {
			const date = new Date(dateStr);
			const now = new Date();
			const isToday = date.toDateString() === now.toDateString();

			if (isToday) {
				return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
			}
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		} catch {
			return dateStr;
		}
	};

	// Format full date for message detail
	const formatFullDate = (dateStr: string) => {
		try {
			const date = new Date(dateStr);
			return date.toLocaleString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			});
		} catch {
			return dateStr;
		}
	};

	// Open Mail.app settings
	const openMailSettings = () => {
		window.open('x-apple.systempreferences:com.apple.Internet-Accounts', '_blank');
	};

	return (
		<div className="flex h-full bg-[#F5F5F5] dark:bg-[#1e1e1e] select-none" data-testid="email-app">
			{/* Sidebar - Claude OS branded */}
			<div className="w-52 flex-shrink-0 bg-[#F0F0F0]/80 dark:bg-[#252525]/80 backdrop-blur-xl border-r border-[#D1D1D1] dark:border-[#3a3a3a] flex flex-col overflow-hidden">
				{/* Claude OS branding header */}
				<div className="px-3 py-2.5 border-b border-[#D1D1D1] dark:border-[#3a3a3a]">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center shadow-sm">
								<Mail className="w-4 h-4 text-white" />
							</div>
							<div>
								<div className="text-[11px] font-semibold text-[#DA7756]">Claude Mail</div>
								<div className="text-[9px] text-[#8E8E93]">Claude OS</div>
							</div>
						</div>
						<button
							onClick={() => openAppWindow('settings')}
							className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
							title="Settings"
						>
							<Settings className="w-4 h-4 text-[#8E8E93]" />
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-auto">
					{/* Accounts Section */}
					<div className="px-2 pt-3">
						<div className="w-full flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">
							<button
								onClick={() => setShowAccountsSection(!showAccountsSection)}
								className="flex items-center gap-1 hover:text-[#6E6E73]"
							>
								{showAccountsSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
								Accounts
							</button>
							<button
								onClick={() => setShowAccountInfo(!showAccountInfo)}
								className="ml-auto p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
								title="Account info"
							>
								<Info className="w-3 h-3" />
							</button>
						</div>

						{showAccountInfo && (
							<div className="mx-2 mt-2 p-2.5 bg-[#DA7756]/10 border border-[#DA7756]/30 rounded-lg text-xs">
								<p className="text-[#1D1D1F] dark:text-[#E5E5E5] mb-2">
									Accounts are managed in macOS Mail.app or System Settings.
								</p>
								<button onClick={openMailSettings} className="flex items-center gap-1 text-[#DA7756] hover:underline">
									<ExternalLink className="w-3 h-3" />
									Open Internet Accounts
								</button>
							</div>
						)}

					{showAccountsSection && (
						<nav className="mt-1 space-y-0.5">
							{accounts.map((account, index) => (
								<button
									key={account.id}
									onClick={() => { setSelectedAccount(account.id); }}
									className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${selectedAccount === account.id
											? 'bg-[#DA7756] text-white'
											: 'text-[#1D1D1F] dark:text-[#E5E5E5] hover:bg-black/5 dark:hover:bg-white/10'
										}`}
								>
										{account.is_claude_account ? (
											<div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center">
												<ClaudeIcon className="w-3 h-3 text-white" />
											</div>
										) : (
											<div className={`w-5 h-5 rounded-full ${getAccountColor(index)} flex items-center justify-center`}>
												<span className="text-[10px] font-medium text-white">{account.name.charAt(0).toUpperCase()}</span>
											</div>
										)}
										<span className="flex-1 text-left truncate" title={account.email}>{account.name}</span>
										{account.is_claude_account && selectedAccount !== account.id && <ClaudeBadgeMini />}
									</button>
								))}

								{accounts.length === 0 && (
									<p className="px-2 py-2 text-[11px] text-[#8E8E93] italic">No accounts found</p>
								)}
							</nav>
						)}
					</div>

					{/* Mailboxes Section */}
					<div className="px-2 pt-4">
						<div className="px-2 py-1 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Mailboxes</div>
						<nav className="mt-1 space-y-0.5">
							{(Object.keys(MAILBOX_CONFIG) as MailboxKey[]).map((mailbox) => {
								const config = MAILBOX_CONFIG[mailbox];
								const isSelected = selectedMailbox === mailbox;
								const mbData = mailboxes.find(m => m.name === mailbox);
								const unread = mbData?.unread_count || 0;

								return (
									<button
										key={mailbox}
										onClick={() => { setSelectedMailbox(mailbox); }}
										className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${isSelected ? 'bg-[#DA7756] text-white' : 'text-[#1D1D1F] dark:text-[#E5E5E5] hover:bg-black/5 dark:hover:bg-white/10'
											}`}
									>
										<span className={isSelected ? 'text-white' : 'text-[#DA7756]'}>{config.icon}</span>
										<span className="flex-1 text-left font-medium">{config.label}</span>
										{unread > 0 && (
											<span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${isSelected ? 'bg-white/20 text-white' : 'bg-[#DA7756]/15 text-[#DA7756]'
												}`}>{unread}</span>
										)}
									</button>
								);
							})}
						</nav>

						{dynamicMailboxes.length > 0 && (
							<div className="mt-3">
								<div className="px-2 py-1 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Folders</div>
								<nav className="mt-1 space-y-0.5">
									{dynamicMailboxes.map((mailbox) => {
										const isSelected = selectedMailbox === mailbox.name;
										return (
											<button
												key={mailbox.id}
												onClick={() => setSelectedMailbox(mailbox.name)}
												className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${isSelected ? 'bg-[#DA7756] text-white' : 'text-[#1D1D1F] dark:text-[#E5E5E5] hover:bg-black/5 dark:hover:bg-white/10'
													}`}
											>
												<span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/70' : 'bg-[#DA7756]/50'}`} />
												<span className="flex-1 text-left truncate">{mailbox.name}</span>
												{mailbox.unread_count > 0 && (
													<span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${isSelected ? 'bg-white/20 text-white' : 'bg-[#DA7756]/15 text-[#DA7756]'
														}`}>{mailbox.unread_count}</span>
												)}
											</button>
										);
									})}
								</nav>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Message List */}
			<div className="w-80 flex-shrink-0 border-r border-[#D1D1D1] dark:border-[#3a3a3a] flex flex-col bg-white dark:bg-[#1e1e1e]">
				{/* Search & Toolbar */}
				<div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E5E5] dark:border-[#333]">
					<div className="relative flex-1">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={selectedAccount ? `Search ${selectedAccountLabel}` : "Select an account"}
							disabled={!selectedAccount}
							className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F5F5F5] dark:bg-[#333] border-0 rounded-md focus:outline-none focus:ring-2 focus:ring-[#DA7756]/50 disabled:opacity-50"
						/>
					</div>
					<button onClick={handleRefresh} className="p-1.5 rounded hover:bg-[#F5F5F5] dark:hover:bg-[#333] transition-colors" title="Refresh">
						<RefreshCw className="w-4 h-4 text-[#8E8E93]" />
					</button>
				</div>
				<div className="px-3 py-2 border-b border-[#E5E5E5] dark:border-[#333] bg-white dark:bg-[#1e1e1e]">
					<div className="flex items-center gap-2">
						<div className={`w-2.5 h-2.5 rounded-full ${selectedAccount ? selectedAccountColor : 'bg-gray-300'}`} />
						<div className="min-w-0">
							<p className="text-xs font-medium text-[#1D1D1F] dark:text-white truncate">
								{selectedAccountLabel}
							</p>
							{selectedAccountEmail && (
								<p className="text-[11px] text-[#8E8E93] truncate">{selectedAccountEmail}</p>
							)}
						</div>
					</div>
				</div>

				{/* Header */}
				<div className="px-3 py-2 border-b border-[#E5E5E5] dark:border-[#333] bg-[#FAFAFA] dark:bg-[#252526]">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-[#1D1D1F] dark:text-white text-sm">
							{MAILBOX_CONFIG[selectedMailbox as MailboxKey]?.label || selectedMailbox}
						</h3>
						<span className="text-[10px] text-[#8E8E93] font-medium truncate max-w-[140px]" title={selectedAccountLabel}>
							{selectedAccountLabel}
						</span>
					</div>
				</div>

				{/* List Content */}
				<div className="flex-1 overflow-auto">
					{isLoadingMessages ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
						</div>
					) : error ? (
						<div className="flex flex-col items-center justify-center h-full text-[#8E8E93] px-4 text-center">
							<Mail className="w-10 h-10 mb-2 opacity-30" />
							<p className="text-sm">{error}</p>
							<button onClick={handleRefresh} className="mt-3 text-sm text-[#DA7756] hover:underline">Try again</button>
						</div>
					) : displayMessages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-[#8E8E93]">
							<Inbox className="w-10 h-10 mb-2 opacity-30" />
							<p className="text-sm">No messages</p>
							{selectedAccount && (
								<p className="text-xs mt-1">in {MAILBOX_CONFIG[selectedMailbox as MailboxKey]?.label || selectedMailbox}</p>
							)}
						</div>
					) : (
						<div className="divide-y divide-[#E5E5E5] dark:divide-[#2a2a2a]">
							{sortedMessages.map((message) => {
								const account = accounts.find(a => a.email === message.account || a.id === message.account);
								const accountIndex = accounts.findIndex(a => a.email === message.account || a.id === message.account);
								const isClaudeEmail = account?.is_claude_account;
								const isSentMailbox = message.mailbox.toLowerCase().startsWith('sent');
								const recipients = message.recipients || [];
								const recipientLabel = recipients.length > 1
									? `${recipients[0]} +${recipients.length - 1}`
									: recipients[0];
								const primaryLabel = isSentMailbox && recipientLabel
									? `To: ${recipientLabel}`
									: (message.sender_name || message.sender);

								return (
									<button
										key={message.id}
										onClick={() => handleMessageSelect(message)}
										className={`w-full text-left px-3 py-2.5 transition-colors ${selectedMessage?.id === message.id
											? 'bg-[#DA7756]/10 border-l-2 border-l-[#DA7756]'
											: 'hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a2a] border-l-2 border-l-transparent'
											}`}
									>
										<div className="flex items-baseline justify-between gap-2 mb-1">
											<span className={`text-xs ${message.is_read ? 'text-[#8E8E93]' : 'font-medium text-[#1D1D1F] dark:text-white'}`}>
												{primaryLabel || 'Unknown Sender'}
											</span>
											<span className="text-[10px] text-[#8E8E93] flex-shrink-0">{formatDate(message.date_received)}</span>
										</div>
										<p className={`text-sm truncate ${message.is_read ? 'text-[#6E6E73] dark:text-[#8e8e93]' : 'font-semibold text-[#1D1D1F] dark:text-white'}`}>
											{message.subject || '(no subject)'}
										</p>
										{message.snippet && (
											<p className="text-xs text-[#8E8E93] truncate mt-0.5">
												{message.snippet}
											</p>
										)}
									</button>
								);
							})}
							{!searchQuery && displayMessages.length >= messageLimit && (
								<div className="px-3 py-3">
									<button
										onClick={() => setMessageLimit((prev) => prev + 100)}
										className="w-full text-xs font-medium text-[#DA7756] hover:text-[#C15F3C] border border-[#DA7756]/30 hover:border-[#DA7756]/60 rounded-md py-1.5 transition-colors"
									>
										Load more
									</button>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Status bar */}
				<div className="px-3 py-1.5 border-t border-[#E5E5E5] dark:border-[#333] text-[11px] text-[#8E8E93] bg-[#FAFAFA] dark:bg-[#252526]">
					<>{displayMessages.length} {displayMessages.length === 1 ? 'message' : 'messages'}{selectedAccount && ` in ${accounts.find(a => a.id === selectedAccount)?.name || selectedAccount}`}</>
				</div>
			</div>

			{/* Message Preview */}
			<div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1e1e1e]">
				{loadingMessage ? (
					<div className="flex-1 flex items-center justify-center">
						<Loader2 className="w-6 h-6 animate-spin text-[#DA7756]" />
					</div>
				) : selectedMessage ? (
					<>
						{/* Message Header with Talk to Claude */}
						<div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#333]">
							{/* Talk to Claude Button - Primary CTA */}
							<button
								onClick={handleTalkToClaude}
								className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-4 bg-gradient-to-b from-[#DA7756] to-[#C15F3C] hover:from-[#E8856A] hover:to-[#DA7756] text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
							>
								<div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
									<ClaudeIcon className="w-3 h-3 text-white" />
								</div>
								Talk to Claude about this email
							</button>

							<h2 className="text-xl font-semibold text-[#1D1D1F] dark:text-white mb-3">{selectedMessage.subject || '(no subject)'}</h2>
							<div className="flex items-start justify-between gap-4">
								<div className="flex items-start gap-3">
									{accounts.find(a => a.is_claude_account && (a.email === selectedMessage.account || a.id === selectedMessage.account)) ? (
										<div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#DA7756] to-[#C15F3C] flex items-center justify-center">
											<ClaudeIcon className="w-6 h-6 text-white" />
										</div>
									) : (
										<div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-medium ${getAccountColor(accounts.findIndex(a => a.email === selectedMessage.account || a.id === selectedMessage.account))}`}>
											{(selectedMessage.sender_name || selectedMessage.sender).charAt(0).toUpperCase()}
										</div>
									)}
									<div>
										{(() => {
											const isSentMailbox = selectedMessage.mailbox.toLowerCase().startsWith('sent');
											const recipientList = selectedMessage.recipients || [];
											const primaryLine = isSentMailbox && recipientList.length > 0
												? `To: ${recipientList.join(', ')}`
												: (selectedMessage.sender_name || selectedMessage.sender);
											const secondaryLine = isSentMailbox
												? `From: ${selectedAccountEmail || selectedAccountLabel}`
												: selectedMessage.sender;

											return (
												<>
													<p className="font-medium text-[#1D1D1F] dark:text-white">{primaryLine}</p>
													<p className="text-sm text-[#8E8E93]">{secondaryLine}</p>
													{!isSentMailbox && recipientList.length > 0 && (
														<p className="text-sm text-[#8E8E93] mt-1">To: {recipientList.join(', ')}</p>
													)}
												</>
											);
										})()}
									</div>
								</div>
								<div className="text-right flex-shrink-0">
									<p className="text-sm text-[#8E8E93]">{formatFullDate(selectedMessage.date_received)}</p>
									{selectedMessage.account && (
										<p className="text-xs text-[#8E8E93] mt-1">via {accounts.find(a => a.id === selectedMessage.account || a.email === selectedMessage.account)?.name || selectedMessage.account}</p>
									)}
								</div>
							</div>
						</div>

						{/* Message Body */}
						<div className="flex-1 overflow-auto px-6 py-4">
							<div className="max-w-3xl">
								<pre className="whitespace-pre-wrap font-sans text-[#1D1D1F] dark:text-[#E5E5E5] text-[15px] leading-relaxed">
									{selectedMessage.content || '(no content)'}
								</pre>
							</div>
						</div>
					</>
				) : (
					<div className="flex-1 flex flex-col items-center justify-center text-[#8E8E93]">
						<div className="w-20 h-20 rounded-full bg-[#DA7756]/10 flex items-center justify-center mb-4">
							<Mail className="w-10 h-10 text-[#DA7756] opacity-50" />
						</div>
						<p className="text-lg font-medium text-[#6E6E73] dark:text-[#8e8e93]">No Message Selected</p>
						<p className="text-sm mt-1 text-[#8E8E93]">Choose a message to read</p>
					</div>
				)}
			</div>
		</div>
	);
}

export default EmailWindowContent;
