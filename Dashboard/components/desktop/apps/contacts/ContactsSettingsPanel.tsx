'use client';

import { API_BASE } from '@/lib/api';
import {
	CheckCircle,
	CircleDot,
	ExternalLink,
	Globe,
	Loader2,
	RefreshCw,
	Settings,
	Trash2,
	UserPlus,
	XCircle
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ProviderStatus {
	type: string;
	name: string;
	enabled: boolean;
	available: boolean;
	contact_count: number;
	error: string | null;
	last_sync: string | null;
}

interface SyncResult {
	imported: number;
	updated: number;
	errors: number;
	error: string | null;
}

type SettingsTab = 'providers' | 'sync' | 'general';

const CARDDAV_PRESETS: Record<string, { url: string; description: string; }> = {
	'': { url: '', description: 'Enter your own CalDAV URL' },
	'Fastmail': {
		url: 'https://carddav.fastmail.com/dav/addressbooks/user/EMAIL/Default',
		description: 'Replace EMAIL with your Fastmail email',
	},
	'Nextcloud': {
		url: 'https://YOUR_SERVER/remote.php/dav/addressbooks/users/USERNAME/contacts/',
		description: 'Replace YOUR_SERVER and USERNAME',
	},
	'iCloud': {
		url: 'https://contacts.icloud.com',
		description: 'Use your Apple ID and an app-specific password',
	},
	'Synology': {
		url: 'https://YOUR_NAS:5001/carddav/addressbooks/USERNAME/contacts/',
		description: 'Replace YOUR_NAS and USERNAME',
	},
};

export function ContactsSettingsPanel({ onClose }: { onClose: () => void; }) {
	const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
	const [providers, setProviders] = useState<ProviderStatus[]>([]);
	const [loading, setLoading] = useState(false);
	const [syncing, setSyncing] = useState<string | null>(null);
	const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	// CardDAV config state
	const [showAddCardDAV, setShowAddCardDAV] = useState(false);
	const [cardDavPreset, setCardDavPreset] = useState('');
	const [cardDavName, setCardDavName] = useState('');
	const [cardDavUrl, setCardDavUrl] = useState('');
	const [cardDavUsername, setCardDavUsername] = useState('');
	const [cardDavPassword, setCardDavPassword] = useState('');

	const fetchProviders = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(`${API_BASE}/api/contacts/providers`);
			if (!response.ok) throw new Error('Failed to fetch providers');
			const data: ProviderStatus[] = await response.json();
			setProviders(data);
		} catch (err: any) {
			setError(err.message || 'Failed to fetch providers');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchProviders();
	}, [fetchProviders]);

	const handleSync = useCallback(async (providerType: string) => {
		setSyncing(providerType);
		setSyncResult(null);
		setError(null);
		try {
			const response = await fetch(`${API_BASE}/api/contacts/providers/${providerType}/sync`, {
				method: 'POST',
			});
			if (!response.ok) throw new Error('Sync failed');
			const result: SyncResult = await response.json();
			setSyncResult(result);
			// Refresh provider list
			await fetchProviders();
		} catch (err: any) {
			setError(err.message || 'Sync failed');
		} finally {
			setSyncing(null);
		}
	}, [fetchProviders]);

	const handlePresetChange = useCallback((preset: string) => {
		setCardDavPreset(preset);
		const config = CARDDAV_PRESETS[preset];
		if (config) {
			setCardDavUrl(config.url);
			setCardDavName(preset || 'CardDAV');
		}
	}, []);

	const handleAddCardDAV = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(`${API_BASE}/api/contacts/providers/carddav`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: cardDavName || 'CardDAV',
					url: cardDavUrl,
					username: cardDavUsername,
					password: cardDavPassword,
				}),
			});
			if (!response.ok) {
				const err = await response.json();
				throw new Error(err.detail || 'Failed to add CardDAV provider');
			}
			// Reset form
			setShowAddCardDAV(false);
			setCardDavPreset('');
			setCardDavName('');
			setCardDavUrl('');
			setCardDavUsername('');
			setCardDavPassword('');
			// Refresh providers
			await fetchProviders();
		} catch (err: any) {
			setError(err.message || 'Failed to add CardDAV provider');
		} finally {
			setLoading(false);
		}
	}, [cardDavName, cardDavUrl, cardDavUsername, cardDavPassword, fetchProviders]);

	const handleRemoveProvider = useCallback(async (providerId: string) => {
		if (!confirm('Remove this provider? This will not delete synced contacts.')) return;

		setLoading(true);
		try {
			const response = await fetch(`${API_BASE}/api/contacts/providers/${providerId}`, {
				method: 'DELETE',
			});
			if (!response.ok) throw new Error('Failed to remove provider');
			await fetchProviders();
		} catch (err: any) {
			setError(err.message || 'Failed to remove provider');
		} finally {
			setLoading(false);
		}
	}, [fetchProviders]);

	const openSystemContacts = () => {
		window.open('x-apple.systempreferences:com.apple.Contacts', '_blank');
	};

	const renderStatusIcon = (available: boolean, error: string | null) => {
		if (error) {
			return <span title={error}><XCircle className="w-4 h-4 text-red-500" /></span>;
		}
		if (available) {
			return <span title="Connected"><CheckCircle className="w-4 h-4 text-green-500" /></span>;
		}
		return <span title="Not available"><CircleDot className="w-4 h-4 text-gray-400" /></span>;
	};

	return (
		<div className="absolute inset-0 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-sm z-50 flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#333]">
				<h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
					<Settings className="w-5 h-5" /> Contacts Settings
				</h2>
				<button
					onClick={onClose}
					className="px-3 py-1.5 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
				>
					Done
				</button>
			</div>

			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar */}
				<div className="w-48 border-r border-gray-200 dark:border-[#333] p-2">
					<nav className="space-y-1">
						<button
							onClick={() => setActiveTab('providers')}
							className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${activeTab === 'providers'
								? 'bg-blue-500 text-white'
								: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333]'
								}`}
						>
							<Globe className="w-4 h-4" /> Providers
						</button>
						<button
							onClick={() => setActiveTab('sync')}
							className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${activeTab === 'sync'
								? 'bg-blue-500 text-white'
								: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333]'
								}`}
						>
							<RefreshCw className="w-4 h-4" /> Sync
						</button>
						<button
							onClick={() => setActiveTab('general')}
							className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 ${activeTab === 'general'
								? 'bg-blue-500 text-white'
								: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333]'
								}`}
						>
							<Settings className="w-4 h-4" /> General
						</button>
					</nav>
				</div>

				{/* Content */}
				<div className="flex-1 p-6 overflow-y-auto text-gray-900 dark:text-gray-100">
					{loading && !providers.length && (
						<div className="flex items-center justify-center h-32">
							<Loader2 className="w-6 h-6 animate-spin text-gray-400" />
						</div>
					)}

					{error && (
						<div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-3 rounded-md mb-4 text-sm">
							{error}
						</div>
					)}

					{syncResult && (
						<div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 p-3 rounded-md mb-4 text-sm">
							Sync complete: {syncResult.imported} imported, {syncResult.updated} updated
							{syncResult.errors > 0 && `, ${syncResult.errors} errors`}
						</div>
					)}

					{/* Providers Tab */}
					{activeTab === 'providers' && (
						<div>
							<h3 className="text-lg font-semibold mb-4">Contact Providers</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
								Connect external contact sources to sync with Claude OS.
							</p>

							<div className="space-y-4">
								{providers.map((provider) => (
									<div
										key={provider.type}
										className="p-4 border border-gray-200 dark:border-[#444] rounded-lg bg-gray-50 dark:bg-[#2a2a2a]"
									>
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-3">
												{renderStatusIcon(provider.available, provider.error)}
												<div>
													<h4 className="font-medium">{provider.name}</h4>
													<p className="text-xs text-gray-500 dark:text-gray-400">
														{provider.type}
														{provider.contact_count > 0 && ` · ${provider.contact_count} contacts`}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{provider.available && provider.type !== 'local' && (
													<button
														onClick={() => handleSync(provider.type)}
														disabled={syncing === provider.type}
														className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
													>
														{syncing === provider.type ? (
															<Loader2 className="w-3 h-3 animate-spin" />
														) : (
															<RefreshCw className="w-3 h-3" />
														)}
														Sync
													</button>
												)}
												{provider.type === 'carddav' && (
													<button
														onClick={() => handleRemoveProvider(provider.type)}
														className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md"
														title="Remove"
													>
														<Trash2 className="w-4 h-4" />
													</button>
												)}
											</div>
										</div>

										{provider.error && (
											<p className="text-sm text-red-500 mt-2">{provider.error}</p>
										)}

										{provider.type === 'apple' && (
											<div className="mt-3 pt-3 border-t border-gray-200 dark:border-[#444]">
												<p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
													Reads from macOS Contacts.app. Add accounts via System Settings.
												</p>
												<button
													onClick={openSystemContacts}
													className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
												>
													<ExternalLink className="w-3 h-3" /> Open System Settings
												</button>
											</div>
										)}

										{provider.type === 'local' && (
											<p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
												Local storage for contacts. Always available, syncs from other providers.
											</p>
										)}
									</div>
								))}
							</div>

							{/* Add CardDAV Button */}
							<div className="mt-6">
								{!showAddCardDAV ? (
									<button
										onClick={() => setShowAddCardDAV(true)}
										className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 dark:border-[#555] rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
									>
										<UserPlus className="w-4 h-4" />
										Add CardDAV Provider
									</button>
								) : (
									<div className="p-4 border border-gray-200 dark:border-[#444] rounded-lg bg-gray-50 dark:bg-[#2a2a2a]">
										<h4 className="font-medium mb-4 flex items-center gap-2">
											<Globe className="w-4 h-4" /> Add CardDAV Provider
										</h4>

										<div className="space-y-4">
											<div>
												<label className="block text-sm font-medium mb-1">Preset</label>
												<select
													value={cardDavPreset}
													onChange={(e) => handlePresetChange(e.target.value)}
													className="w-full p-2 border border-gray-300 dark:border-[#555] rounded-md bg-white dark:bg-[#222] text-sm"
												>
													<option value="">Custom</option>
													{Object.keys(CARDDAV_PRESETS).filter(k => k).map((preset) => (
														<option key={preset} value={preset}>{preset}</option>
													))}
												</select>
												{cardDavPreset && (
													<p className="mt-1 text-xs text-gray-500">
														{CARDDAV_PRESETS[cardDavPreset]?.description}
													</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-medium mb-1">Display Name</label>
												<input
													type="text"
													value={cardDavName}
													onChange={(e) => setCardDavName(e.target.value)}
													placeholder="My Contacts"
													className="w-full p-2 border border-gray-300 dark:border-[#555] rounded-md bg-white dark:bg-[#222] text-sm"
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-1">CardDAV URL</label>
												<input
													type="url"
													value={cardDavUrl}
													onChange={(e) => setCardDavUrl(e.target.value)}
													placeholder="https://carddav.example.com/..."
													className="w-full p-2 border border-gray-300 dark:border-[#555] rounded-md bg-white dark:bg-[#222] text-sm"
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-1">Username</label>
												<input
													type="text"
													value={cardDavUsername}
													onChange={(e) => setCardDavUsername(e.target.value)}
													placeholder="you@example.com"
													className="w-full p-2 border border-gray-300 dark:border-[#555] rounded-md bg-white dark:bg-[#222] text-sm"
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-1">Password</label>
												<input
													type="password"
													value={cardDavPassword}
													onChange={(e) => setCardDavPassword(e.target.value)}
													placeholder="App-specific password recommended"
													className="w-full p-2 border border-gray-300 dark:border-[#555] rounded-md bg-white dark:bg-[#222] text-sm"
												/>
												<p className="mt-1 text-xs text-gray-500">
													Use an app-specific password for better security.
												</p>
											</div>

											<div className="flex gap-2 pt-2">
												<button
													onClick={handleAddCardDAV}
													disabled={!cardDavUrl || !cardDavUsername || !cardDavPassword || loading}
													className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 text-sm"
												>
													{loading ? 'Connecting...' : 'Connect'}
												</button>
												<button
													onClick={() => setShowAddCardDAV(false)}
													className="px-4 py-2 border border-gray-300 dark:border-[#555] rounded-md hover:bg-gray-100 dark:hover:bg-[#333] text-sm"
												>
													Cancel
												</button>
											</div>
										</div>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Sync Tab */}
					{activeTab === 'sync' && (
						<div>
							<h3 className="text-lg font-semibold mb-4">Sync Contacts</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
								Import contacts from external providers into Claude OS local storage.
							</p>

							<div className="space-y-4">
								{providers
									.filter((p) => p.type !== 'local' && p.available)
									.map((provider) => (
										<div
											key={provider.type}
											className="flex items-center justify-between p-4 border border-gray-200 dark:border-[#444] rounded-lg"
										>
											<div>
												<h4 className="font-medium">{provider.name}</h4>
												<p className="text-sm text-gray-500 dark:text-gray-400">
													{provider.last_sync
														? `Last synced: ${new Date(provider.last_sync).toLocaleString()}`
														: 'Never synced'}
												</p>
											</div>
											<button
												onClick={() => handleSync(provider.type)}
												disabled={syncing === provider.type}
												className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
											>
												{syncing === provider.type ? (
													<>
														<Loader2 className="w-4 h-4 animate-spin" />
														Syncing...
													</>
												) : (
													<>
														<RefreshCw className="w-4 h-4" />
														Sync Now
													</>
												)}
											</button>
										</div>
									))}

								{providers.filter((p) => p.type !== 'local' && p.available).length === 0 && (
									<p className="text-gray-500 dark:text-gray-400 italic">
										No external providers configured. Add a provider first.
									</p>
								)}
							</div>

							<div className="mt-8 p-4 bg-gray-100 dark:bg-[#2a2a2a] rounded-lg">
								<h4 className="font-medium mb-2">How Sync Works</h4>
								<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
									<li>• Contacts are imported into local storage</li>
									<li>• Your Claude OS notes (relationship, context) are preserved</li>
									<li>• Duplicate contacts are merged by email/phone</li>
									<li>• Original contacts in external providers are not modified</li>
								</ul>
							</div>
						</div>
					)}

					{/* General Tab */}
					{activeTab === 'general' && (
						<div>
							<h3 className="text-lg font-semibold mb-4">General Settings</h3>

							<div className="space-y-6">
								<div className="p-4 border border-gray-200 dark:border-[#444] rounded-lg">
									<h4 className="font-medium mb-2">Data Management</h4>
									<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
										Contacts are stored locally in Claude OS. External providers only sync
										into local storage and are never modified.
									</p>
									<div className="flex gap-2">
										<button className="px-3 py-1.5 text-sm border border-gray-300 dark:border-[#555] rounded-md hover:bg-gray-100 dark:hover:bg-[#333]">
											Export Contacts
										</button>
										<button className="px-3 py-1.5 text-sm border border-gray-300 dark:border-[#555] rounded-md hover:bg-gray-100 dark:hover:bg-[#333]">
											Import vCard
										</button>
									</div>
								</div>

								<div className="p-4 border border-gray-200 dark:border-[#444] rounded-lg">
									<h4 className="font-medium mb-2">Claude OS Extensions</h4>
									<p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
										Claude OS adds extra fields to contacts that aren't synced to external providers:
									</p>
									<ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
										<li>• <strong>Relationship</strong> - friend, colleague, family, etc.</li>
										<li>• <strong>Context Notes</strong> - Claude's notes about this person</li>
										<li>• <strong>Tags</strong> - Custom labels for organization</li>
										<li>• <strong>Pinned</strong> - Quick access to important contacts</li>
									</ul>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

