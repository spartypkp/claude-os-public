'use client';

import { useWindowStore } from '@/store/windowStore';
import {
	Check,
	ChevronRight,
	Loader2,
	Mail,
	MailOpen,
	MessageSquare,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// ==========================================
// TYPES
// ==========================================

interface TriageAccount {
	id: string;
	name: string;
	email: string;
	unread_count: number;
}

interface TriageMessage {
	id: string;
	subject: string;
	sender: string;
	sender_name: string | null;
	date_received: string;
	is_read: boolean;
	is_flagged: boolean;
	snippet: string | null;
	account: string;
}

interface TriageData {
	unread_count: number;
	accounts: TriageAccount[];
	messages: TriageMessage[];
}

// ==========================================
// HELPERS
// ==========================================

import { API_BASE } from '@/lib/api';

function timeAgo(dateStr: string): string {
	const now = new Date();
	const date = new Date(dateStr);
	const diff = now.getTime() - date.getTime();
	const minutes = Math.floor(diff / 60000);

	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

function senderDisplay(msg: TriageMessage): string {
	if (msg.sender_name) {
		const first = msg.sender_name.split(' ')[0];
		return first || msg.sender_name;
	}
	const match = msg.sender.match(/^(.+?)\s*</);
	if (match) return match[1].split(' ')[0];
	return msg.sender.split('@')[0];
}

// ==========================================
// COMPONENT
// ==========================================

export function EmailWidgetContent() {
	const [data, setData] = useState<TriageData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
	const [triaging, setTriaging] = useState(false);
	const { openAppWindow } = useWindowStore();

	const loadTriage = useCallback(async () => {
		try {
			const response = await fetch(`${API_BASE}/api/email/triage`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const result = await response.json();
			setData(result);
			setError(null);
		} catch (err) {
			console.error('Failed to load email triage:', err);
			setError('Failed to connect');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadTriage();
		const interval = setInterval(loadTriage, 60000);
		return () => clearInterval(interval);
	}, [loadTriage]);

	const markAsRead = useCallback(async (msg: TriageMessage) => {
		// Optimistic dismiss
		setDismissedIds(prev => new Set(prev).add(`${msg.account}-${msg.id}`));
		try {
			await fetch(`${API_BASE}/api/email/messages/${msg.id}/read?account=${msg.account}`, {
				method: 'POST',
			});
		} catch {
			// Revert on failure
			setDismissedIds(prev => {
				const next = new Set(prev);
				next.delete(`${msg.account}-${msg.id}`);
				return next;
			});
		}
	}, []);

	// Filter out dismissed messages
	const visibleMessages = data?.messages.filter(
		(msg) => !dismissedIds.has(`${msg.account}-${msg.id}`)
	) ?? [];

	const triageWithClaude = useCallback(async () => {
		setTriaging(true);
		try {
			// Get chief status
			const statusRes = await fetch(`${API_BASE}/api/sessions/chief/status`);
			const status = await statusRes.json();

			if (!status.session_exists || !status.claude_running) {
				openAppWindow('email');
				return;
			}

			// Find the chief's active session
			const convRes = await fetch(`${API_BASE}/api/sessions/activity`);
			const convData = await convRes.json();
			const chiefSession = convData.sessions?.find(
				(s: { role: string; ended_at: string | null }) => s.role === 'chief' && !s.ended_at
			);

			if (chiefSession) {
				const subjects = visibleMessages.slice(0, 5).map(
					(m) => `- ${senderDisplay(m)}: ${m.subject || '(no subject)'}`
				).join('\n');

				await fetch(`${API_BASE}/api/sessions/${chiefSession.session_id}/say`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						message: `[Dashboard ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}] Help me triage my unread emails. Here's what's in my inbox:\n${subjects}\n\nWhich ones need attention and which can I ignore?`
					}),
				});
			}
		} catch (err) {
			console.error('Failed to triage:', err);
		} finally {
			setTriaging(false);
		}
	}, [openAppWindow, visibleMessages]);

	// ==========================================
	// RENDER
	// ==========================================

	if (loading) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="w-5 h-5 animate-spin text-gray-400" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-center">
				<div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400/10 to-blue-400/10 border border-sky-400/20 flex items-center justify-center mb-4">
					<Mail className="w-7 h-7 text-sky-400" />
				</div>
				<p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
					Connect email
				</p>
				<p className="text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-[200px]">
					{error || 'Set up email accounts to see your inbox here'}
				</p>
				<button
					onClick={() => openAppWindow('email')}
					className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-sky-400 to-blue-500 rounded-lg hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
				>
					Open Mail
				</button>
			</div>
		);
	}

	if (data.unread_count === 0 && visibleMessages.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-center">
				<div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400/10 to-green-400/10 border border-emerald-400/20 flex items-center justify-center mb-4">
					<MailOpen className="w-7 h-7 text-emerald-400" />
				</div>
				<p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
					Inbox zero
				</p>
				<p className="text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-[200px]">
					All caught up — no unread emails
				</p>
				<button
					onClick={() => openAppWindow('email')}
					className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-400 to-green-500 rounded-lg hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
				>
					Open Mail
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col max-h-[460px]">
			{/* Header */}
			<div className="flex-shrink-0 px-3 py-2.5 bg-gradient-to-b from-gray-50 to-white dark:from-white/5 dark:to-transparent border-b border-gray-100/80 dark:border-white/5">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
							{data.unread_count}
						</span>
						<span className="text-xs text-gray-500 dark:text-gray-400">
							unread
						</span>
					</div>
					{data.accounts.length > 1 && (
						<div className="flex items-center gap-1.5">
							{data.accounts.filter(a => a.unread_count > 0).map((acct) => (
								<span
									key={acct.id}
									className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium"
									title={acct.email}
								>
									{acct.name.split(' ')[0]} {acct.unread_count}
								</span>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Message list — scrollable */}
			<div className="flex-1 overflow-y-auto min-h-0">
				<div className="p-2 space-y-1">
					{visibleMessages.map((msg) => (
						<EmailItem
							key={`${msg.account}-${msg.id}`}
							message={msg}
							onMarkRead={markAsRead}
						/>
					))}
				</div>
			</div>

			{/* Footer actions */}
			<div className="flex-shrink-0 border-t border-gray-100/80 dark:border-white/5">
				<div className="flex">
					<button
						onClick={triageWithClaude}
						disabled={triaging}
						className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
					>
						{triaging ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<MessageSquare className="w-3 h-3" />
						)}
						Triage with Claude
					</button>
					<div className="w-px bg-gray-100 dark:bg-white/5" />
					<button
						onClick={() => openAppWindow('email')}
						className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
					>
						Open Mail
						<ChevronRight className="w-3 h-3" />
					</button>
				</div>
			</div>
		</div>
	);
}

// ==========================================
// EMAIL ITEM
// ==========================================

interface EmailItemProps {
	message: TriageMessage;
	onMarkRead: (msg: TriageMessage) => void;
}

function EmailItem({ message, onMarkRead }: EmailItemProps) {
	const sender = senderDisplay(message);
	const time = timeAgo(message.date_received);

	return (
		<div
			className="
				group flex items-start gap-2 px-2 py-2 rounded-lg transition-colors
				bg-white dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10
				hover:bg-gray-50 dark:hover:bg-white/10
			"
		>
			{/* Unread dot */}
			<div className="flex-shrink-0 mt-1.5">
				<div className="w-2 h-2 rounded-full bg-sky-500" />
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between gap-2 mb-0.5">
					<span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
						{sender}
					</span>
					<span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
						{time}
					</span>
				</div>
				<div className="text-xs text-gray-700 dark:text-gray-300 truncate">
					{message.subject || '(no subject)'}
				</div>
				{message.snippet && (
					<div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
						{message.snippet}
					</div>
				)}
			</div>

			{/* Mark as read button — shows on hover */}
			<button
				onClick={(e) => {
					e.stopPropagation();
					onMarkRead(message);
				}}
				className="flex-shrink-0 mt-0.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
				title="Mark as read"
			>
				<Check className="w-3 h-3 text-gray-400 hover:text-emerald-500" />
			</button>
		</div>
	);
}

export default EmailWidgetContent;
