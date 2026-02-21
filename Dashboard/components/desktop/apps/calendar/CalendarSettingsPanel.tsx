'use client';

import { API_BASE } from '@/lib/api';
import {
	AlertCircle,
	Calendar,
	CheckCircle,
	ChevronRight,
	CircleDot,
	ExternalLink,
	Globe,
	Loader2,
	Plus,
	RefreshCw,
	Settings,
	Trash2,
	User,
	XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ProviderInfo {
	type: string;
	name: string;
	description: string;
	available: boolean;
	configured: boolean;
	requires_config: boolean;
	config_fields: string[];
	presets: string[];
}

interface AccountInfo {
	id: string;
	provider_type: string;
	name: string;
	email: string | null;
	enabled: boolean;
	is_primary: boolean;
	connected: boolean;
	last_sync: string | null;
	error: string | null;
}

interface CalendarInfo {
	id: string;
	name: string;
	color: string | null;
	provider: string;
	writable: boolean;
	primary: boolean;
}

type SettingsTab = 'accounts' | 'providers' | 'calendars';

// CalDAV provider presets
const CALDAV_PRESETS: Record<string, { name: string; url_template: string; description: string; }> = {
	fastmail: {
		name: 'Fastmail',
		url_template: 'https://caldav.fastmail.com/dav/calendars/user/{username}/',
		description: 'Fast, secure email with excellent calendar support',
	},
	nextcloud: {
		name: 'NextCloud',
		url_template: 'https://{host}/remote.php/dav/calendars/{username}/',
		description: 'Self-hosted cloud platform',
	},
	synology: {
		name: 'Synology Calendar',
		url_template: 'http://{host}:5000/caldav/{username}/',
		description: 'Synology NAS calendar',
	},
	yahoo: {
		name: 'Yahoo Calendar',
		url_template: 'https://caldav.calendar.yahoo.com/dav/{username}/Calendar/',
		description: 'Yahoo! Calendar',
	},
	zoho: {
		name: 'Zoho Calendar',
		url_template: 'https://calendar.zoho.com/caldav/{username}/',
		description: 'Zoho Calendar',
	},
};

export function CalendarSettingsPanel({ onClose }: { onClose: () => void; }) {
	const [activeTab, setActiveTab] = useState<SettingsTab>('accounts');
	const [providers, setProviders] = useState<ProviderInfo[]>([]);
	const [accounts, setAccounts] = useState<AccountInfo[]>([]);
	const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Add account form state
	const [showAddForm, setShowAddForm] = useState(false);
	const [addProviderType, setAddProviderType] = useState<string>('');
	const [addAccountName, setAddAccountName] = useState('');
	const [addAccountEmail, setAddAccountEmail] = useState('');

	// Google config
	const [googleClientId, setGoogleClientId] = useState('');
	const [googleClientSecret, setGoogleClientSecret] = useState('');
	const [googleRefreshToken, setGoogleRefreshToken] = useState('');

	// CalDAV config
	const [caldavPreset, setCaldavPreset] = useState('');
	const [caldavUrl, setCaldavUrl] = useState('');
	const [caldavUsername, setCaldavUsername] = useState('');
	const [caldavPassword, setCaldavPassword] = useState('');
	const [caldavHost, setCaldavHost] = useState('');

	const fetchSettings = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [providersRes, accountsRes, calendarsRes] = await Promise.all([
				fetch(`${API_BASE}/api/calendar/providers`),
				fetch(`${API_BASE}/api/calendar/accounts`),
				fetch(`${API_BASE}/api/calendar/calendars`),
			]);

			if (!providersRes.ok) throw new Error('Failed to fetch providers');
			if (!accountsRes.ok) throw new Error('Failed to fetch accounts');
			if (!calendarsRes.ok) throw new Error('Failed to fetch calendars');

			setProviders(await providersRes.json());
			setAccounts(await accountsRes.json());
			const calendarsPayload = await calendarsRes.json();
			const calendarsData = Array.isArray(calendarsPayload)
				? calendarsPayload
				: calendarsPayload.calendars || [];
			setCalendars(calendarsData);
		} catch (err: any) {
			setError(err.message || 'An unknown error occurred.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchSettings();
	}, [fetchSettings]);

	const handleSetPrimaryAccount = useCallback(async (accountId: string) => {
		setLoading(true);
		try {
			const response = await fetch(`${API_BASE}/api/calendar/accounts/${accountId}/primary`, {
				method: 'POST',
			});
			if (!response.ok) throw new Error('Failed to set primary account');
			await fetchSettings();
		} catch (err: any) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}, [fetchSettings]);

	const handleRemoveAccount = useCallback(async (accountId: string) => {
		if (!confirm('Remove this calendar account? Events will no longer sync.')) return;

		setLoading(true);
		try {
			const response = await fetch(`${API_BASE}/api/calendar/accounts/${accountId}`, {
				method: 'DELETE',
			});
			if (!response.ok) throw new Error('Failed to remove account');
			await fetchSettings();
		} catch (err: any) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}, [fetchSettings]);

	const handleCaldavPresetChange = useCallback((preset: string) => {
		setCaldavPreset(preset);
		if (preset && CALDAV_PRESETS[preset]) {
			// Don't auto-fill URL - user needs to fill in template variables
			setCaldavUrl('');
		}
	}, []);

	const buildCaldavUrl = useCallback(() => {
		if (!caldavPreset || !CALDAV_PRESETS[caldavPreset]) return caldavUrl;

		const template = CALDAV_PRESETS[caldavPreset].url_template;
		return template
			.replace('{username}', caldavUsername || '{username}')
			.replace('{host}', caldavHost || '{host}');
	}, [caldavPreset, caldavUsername, caldavHost, caldavUrl]);

	const handleAddAccount = useCallback(async () => {
		if (!addProviderType || !addAccountName) return;

		setLoading(true);
		setError(null);

		try {
			let config: Record<string, any> = {};

			if (addProviderType === 'google') {
				if (!googleClientId || !googleClientSecret || !googleRefreshToken) {
					throw new Error('All Google OAuth2 fields are required');
				}
				config = {
					client_id: googleClientId,
					client_secret: googleClientSecret,
					refresh_token: googleRefreshToken,
				};
			} else if (addProviderType === 'caldav') {
				if (!caldavUsername || !caldavPassword) {
					throw new Error('CalDAV username and password are required');
				}
				const url = caldavUrl || buildCaldavUrl();
				if (!url || url.includes('{')) {
					throw new Error('Invalid CalDAV URL. Please fill in all required fields.');
				}
				config = {
					url,
					username: caldavUsername,
					password: caldavPassword,
				};
			}

			const response = await fetch(`${API_BASE}/api/calendar/accounts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					provider_type: addProviderType,
					name: addAccountName,
					email: addAccountEmail || null,
					config,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.detail || 'Failed to add account');
			}

			// Reset form
			setShowAddForm(false);
			setAddProviderType('');
			setAddAccountName('');
			setAddAccountEmail('');
			setGoogleClientId('');
			setGoogleClientSecret('');
			setGoogleRefreshToken('');
			setCaldavPreset('');
			setCaldavUrl('');
			setCaldavUsername('');
			setCaldavPassword('');
			setCaldavHost('');

			await fetchSettings();
		} catch (err: any) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}, [
		addProviderType, addAccountName, addAccountEmail,
		googleClientId, googleClientSecret, googleRefreshToken,
		caldavUrl, caldavUsername, caldavPassword, buildCaldavUrl,
		fetchSettings
	]);

	const openSystemPreferences = () => {
		window.open('x-apple.systempreferences:com.apple.Internet-Accounts', '_blank');
	};

	const renderStatusIcon = (connected: boolean, error: string | null) => {
		if (error) return <span title={error}><XCircle className="w-4 h-4 text-[var(--color-error)]" /></span>;
		if (connected) return <span title="Connected"><CheckCircle className="w-4 h-4 text-[var(--color-success)]" /></span>;
		return <span title="Not connected"><CircleDot className="w-4 h-4 text-[var(--color-warning)]" /></span>;
	};

	const getProviderIcon = (type: string) => {
		switch (type) {
			case 'apple': return '🍎';
			case 'google': return '📅';
			case 'caldav': return '🔗';
			case 'local': return '💾';
			default: return '📆';
		}
	};

	return (
		<div className="absolute inset-0 bg-[var(--surface-base)]/95 backdrop-blur-sm z-50 flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
				<h2 className="text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
					<Settings className="w-5 h-5" /> Calendar Settings
				</h2>
				<button
					onClick={onClose}
					className="px-3 py-1.5 rounded-md text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-accent)] transition-colors"
				>
					Done
				</button>
			</div>

			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar */}
				<div className="w-48 border-r border-[var(--border-subtle)] p-2">
					<nav className="space-y-1">
						{[
							{ id: 'accounts', label: 'Accounts', icon: User },
							{ id: 'providers', label: 'Providers', icon: Globe },
							{ id: 'calendars', label: 'Calendars', icon: Calendar },
						].map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								onClick={() => setActiveTab(id as SettingsTab)}
								className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${activeTab === id
									? 'bg-[var(--color-primary)] text-white'
									: 'text-[var(--text-secondary)] hover:bg-[var(--surface-accent)]'
									}`}
							>
								<Icon className="w-4 h-4" /> {label}
							</button>
						))}
					</nav>
				</div>

				{/* Content */}
				<div className="flex-1 p-6 overflow-y-auto text-[var(--text-primary)]">
					{loading && (
						<div className="flex items-center justify-center h-32">
							<Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
						</div>
					)}

					{error && (
						<div className="bg-[var(--color-error)]/10 text-[var(--color-error)] p-3 rounded-md mb-4 text-sm flex items-center gap-2">
							<AlertCircle className="w-4 h-4" /> {error}
						</div>
					)}

					{/* Accounts Tab */}
					{!loading && activeTab === 'accounts' && (
						<div>
							<div className="flex items-center justify-between mb-4">
								<div>
									<h3 className="text-lg font-semibold">Calendar Accounts</h3>
									<p className="text-sm text-[var(--text-muted)]">
										Manage connected calendar providers
									</p>
								</div>
								<button
									onClick={() => setShowAddForm(true)}
									className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)]"
								>
									<Plus className="w-4 h-4" /> Add Account
								</button>
							</div>

							{/* Apple Calendar hint */}
							<div className="mb-4 p-3 bg-[var(--surface-raised)] rounded-md text-sm">
								<p className="text-[var(--text-muted)]">
									<span className="font-medium">Apple Calendar</span> accounts are managed via macOS System Settings.
								</p>
								<button
									onClick={openSystemPreferences}
									className="inline-flex items-center gap-1 mt-1 text-[var(--color-primary)] hover:underline"
								>
									<ExternalLink className="w-3 h-3" /> Open Internet Accounts
								</button>
							</div>

							{/* Add Account Form */}
							{showAddForm && (
								<div className="mb-6 p-4 border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-raised)]">
									<h4 className="font-medium mb-3">Add Calendar Account</h4>

									<div className="space-y-4">
										{/* Provider Type */}
										<div>
											<label className="block text-sm font-medium mb-1">Provider</label>
											<select
												value={addProviderType}
												onChange={(e) => setAddProviderType(e.target.value)}
												className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
											>
												<option value="">Select provider...</option>
												<option value="google">Google Calendar</option>
												<option value="caldav">CalDAV (Fastmail, NextCloud, etc.)</option>
											</select>
										</div>

										{/* Account Name */}
										<div>
											<label className="block text-sm font-medium mb-1">Account Name</label>
											<input
												type="text"
												value={addAccountName}
												onChange={(e) => setAddAccountName(e.target.value)}
												placeholder="e.g., Work Calendar"
												className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
											/>
										</div>

										{/* Email (optional) */}
										<div>
											<label className="block text-sm font-medium mb-1">Email (optional)</label>
											<input
												type="email"
												value={addAccountEmail}
												onChange={(e) => setAddAccountEmail(e.target.value)}
												placeholder="user@example.com"
												className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
											/>
										</div>

										{/* Google Config */}
										{addProviderType === 'google' && (
											<div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
												<p className="text-xs text-[var(--text-muted)]">
													Create OAuth2 credentials at{' '}
													<a href="https://console.cloud.google.com" target="_blank" className="text-[var(--color-primary)] hover:underline">
														Google Cloud Console
													</a>
												</p>
												<div>
													<label className="block text-sm font-medium mb-1">Client ID</label>
													<input
														type="text"
														value={googleClientId}
														onChange={(e) => setGoogleClientId(e.target.value)}
														className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
													/>
												</div>
												<div>
													<label className="block text-sm font-medium mb-1">Client Secret</label>
													<input
														type="password"
														value={googleClientSecret}
														onChange={(e) => setGoogleClientSecret(e.target.value)}
														className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
													/>
												</div>
												<div>
													<label className="block text-sm font-medium mb-1">Refresh Token</label>
													<input
														type="password"
														value={googleRefreshToken}
														onChange={(e) => setGoogleRefreshToken(e.target.value)}
														className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
													/>
												</div>
											</div>
										)}

										{/* CalDAV Config */}
										{addProviderType === 'caldav' && (
											<div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
												<div>
													<label className="block text-sm font-medium mb-1">Preset (optional)</label>
													<select
														value={caldavPreset}
														onChange={(e) => handleCaldavPresetChange(e.target.value)}
														className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
													>
														<option value="">Custom server</option>
														{Object.entries(CALDAV_PRESETS).map(([key, preset]) => (
															<option key={key} value={key}>{preset.name}</option>
														))}
													</select>
													{caldavPreset && CALDAV_PRESETS[caldavPreset] && (
														<p className="text-xs text-[var(--text-muted)] mt-1">
															{CALDAV_PRESETS[caldavPreset].description}
														</p>
													)}
												</div>

												{caldavPreset && caldavPreset !== '' && CALDAV_PRESETS[caldavPreset]?.url_template.includes('{host}') && (
													<div>
														<label className="block text-sm font-medium mb-1">Server Host</label>
														<input
															type="text"
															value={caldavHost}
															onChange={(e) => setCaldavHost(e.target.value)}
															placeholder="your-server.com"
															className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
														/>
													</div>
												)}

												<div>
													<label className="block text-sm font-medium mb-1">Username</label>
													<input
														type="text"
														value={caldavUsername}
														onChange={(e) => setCaldavUsername(e.target.value)}
														placeholder="user@example.com"
														className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
													/>
												</div>

												<div>
													<label className="block text-sm font-medium mb-1">Password / App Password</label>
													<input
														type="password"
														value={caldavPassword}
														onChange={(e) => setCaldavPassword(e.target.value)}
														className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
													/>
												</div>

												{!caldavPreset && (
													<div>
														<label className="block text-sm font-medium mb-1">CalDAV URL</label>
														<input
															type="url"
															value={caldavUrl}
															onChange={(e) => setCaldavUrl(e.target.value)}
															placeholder="https://caldav.example.com/calendars/user/"
															className="w-full p-2 border border-[var(--border-subtle)] rounded-md bg-[var(--surface-base)] text-sm"
														/>
													</div>
												)}

												{caldavPreset && caldavUsername && (
													<div className="p-2 bg-[var(--surface-accent)] rounded text-xs font-mono break-all">
														{buildCaldavUrl()}
													</div>
												)}
											</div>
										)}

										{/* Form Actions */}
										<div className="flex justify-end gap-2 pt-3">
											<button
												onClick={() => {
													setShowAddForm(false);
													setAddProviderType('');
												}}
												className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-accent)] rounded-md"
											>
												Cancel
											</button>
											<button
												onClick={handleAddAccount}
												disabled={!addProviderType || !addAccountName || loading}
												className="px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
											>
												{loading ? 'Adding...' : 'Add Account'}
											</button>
										</div>
									</div>
								</div>
							)}

							{/* Account List */}
							<div className="space-y-3">
								{accounts.length === 0 ? (
									<p className="text-[var(--text-muted)] italic text-center py-8">
										No calendar accounts configured. Apple Calendar is used by default on macOS.
									</p>
								) : (
									accounts.map((account) => (
										<div
											key={account.id}
											className="flex items-center justify-between p-4 border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-raised)]"
										>
											<div className="flex items-center gap-3">
												<span className="text-2xl">{getProviderIcon(account.provider_type)}</span>
												<div>
													<div className="flex items-center gap-2">
														<span className="font-medium">{account.name}</span>
														{renderStatusIcon(account.connected, account.error)}
													</div>
													<p className="text-sm text-[var(--text-muted)]">
														{account.email || account.provider_type}
														{account.last_sync && ` • Last sync: ${new Date(account.last_sync).toLocaleString()}`}
													</p>
													{account.error && (
														<p className="text-xs text-[var(--color-error)] mt-1">{account.error}</p>
													)}
												</div>
											</div>

											<div className="flex items-center gap-2">
												{account.is_primary ? (
													<span className="text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-1 rounded-full">
														Primary
													</span>
												) : (
													<button
														onClick={() => handleSetPrimaryAccount(account.id)}
														className="px-2 py-1 text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10"
													>
														Set Primary
													</button>
												)}
												{account.provider_type !== 'apple' && (
													<button
														onClick={() => handleRemoveAccount(account.id)}
														className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-dim)] rounded"
														title="Remove Account"
													>
														<Trash2 className="w-4 h-4" />
													</button>
												)}
											</div>
										</div>
									))
								)}
							</div>
						</div>
					)}

					{/* Providers Tab */}
					{!loading && activeTab === 'providers' && (
						<div>
							<h3 className="text-lg font-semibold mb-2">Calendar Providers</h3>
							<p className="text-sm text-[var(--text-muted)] mb-4">
								Available calendar integration methods
							</p>

							<div className="space-y-4">
								{providers.map((provider) => (
									<div
										key={provider.type}
										className="p-4 border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-raised)]"
									>
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<span className="text-xl">{getProviderIcon(provider.type)}</span>
												<h4 className="font-medium">{provider.name}</h4>
												{provider.configured ? (
													<CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
												) : (
													<CircleDot className="w-4 h-4 text-[var(--text-muted)]" />
												)}
											</div>
											{provider.requires_config && !provider.configured && (
												<button
													onClick={() => {
														setAddProviderType(provider.type);
														setShowAddForm(true);
														setActiveTab('accounts');
													}}
													className="text-sm text-[var(--color-primary)] hover:underline flex items-center gap-1"
												>
													Configure <ChevronRight className="w-3 h-3" />
												</button>
											)}
										</div>
										<p className="text-sm text-[var(--text-muted)]">
											{provider.description}
										</p>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Calendars Tab */}
					{!loading && activeTab === 'calendars' && (
						<div>
							<div className="flex items-center justify-between mb-4">
								<div>
									<h3 className="text-lg font-semibold">Your Calendars</h3>
									<p className="text-sm text-[var(--text-muted)]">
										Calendars from all connected accounts
									</p>
								</div>
								<button
									onClick={fetchSettings}
									className="p-2 text-[var(--text-muted)] hover:bg-[var(--surface-accent)] rounded-md"
									title="Refresh"
								>
									<RefreshCw className="w-4 h-4" />
								</button>
							</div>

							<div className="space-y-2">
								{calendars.length === 0 ? (
									<p className="text-[var(--text-muted)] italic text-center py-8">
										No calendars found. Connect an account to see calendars.
									</p>
								) : (
									calendars.map((cal) => (
										<div
											key={cal.id}
											className="flex items-center gap-3 p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-raised)]"
										>
											<div
												className="w-4 h-4 rounded"
												style={{ backgroundColor: cal.color || '#3b82f6' }}
											/>
											<div className="flex-1">
												<span className="font-medium">{cal.name}</span>
												{cal.primary && (
													<span className="ml-2 text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-1.5 py-0.5 rounded">
														Primary
													</span>
												)}
											</div>
											<span className="text-xs text-[var(--text-muted)]">{cal.provider}</span>
										</div>
									))
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default CalendarSettingsPanel;
