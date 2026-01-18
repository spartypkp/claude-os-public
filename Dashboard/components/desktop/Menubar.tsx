'use client';

import { CoreAppType, useWindowStore } from '@/store/windowStore';
import { Battery, BatteryCharging, BatteryWarning, Calendar, CheckSquare, Moon, RefreshCw, Sun, Wifi, WifiOff } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarWidgetContent } from './widgets/CalendarWidgetContent';
import { PrioritiesWidgetContent } from './widgets/PrioritiesWidgetContent';

// ==========================================
// CONSTANTS
// ==========================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// ==========================================
// CLAUDE LOGO SVG
// ==========================================

function ClaudeLogo({ className = 'w-4 h-4' }: { className?: string; }) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
		</svg>
	);
}

// ==========================================
// APP NAME MAPPING
// ==========================================

const CORE_APP_NAMES: Record<CoreAppType, string> = {
	finder: 'Finder',
	calendar: 'Calendar',
	settings: 'Settings',
	contacts: 'Contacts',
	widgets: 'Widgets',
	email: 'Mail',
	messages: 'Messages',
	missions: 'Missions',
	roles: 'Roles',
};

// Get app name based on pathname (for fullscreen custom apps) or focused window
function getAppName(pathname: string, focusedAppType?: CoreAppType | null): string {
	// 1. If a Core App window is focused, use its name
	if (focusedAppType && CORE_APP_NAMES[focusedAppType]) {
		return CORE_APP_NAMES[focusedAppType];
	}

	// 2. Check for Custom App routes (these still use fullscreen routes)
	if (pathname.startsWith('/system')) {
		return 'System';
	}

	// 3. Default: Desktop
	return 'Desktop';
}

// ==========================================
// ABOUT DIALOG
// ==========================================

interface AboutDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="
          w-[300px] rounded-xl overflow-hidden
          bg-[var(--surface-raised)] border border-[var(--border-default)]
          shadow-2xl
        "
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex flex-col items-center pt-6 pb-4 px-6">
					<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#da7756] to-[#C15F3C] flex items-center justify-center mb-4 shadow-lg">
						<ClaudeLogo className="w-10 h-10 text-white" />
					</div>
					<h2 className="text-xl font-semibold text-[var(--text-primary)]">Claude OS</h2>
					<p className="text-sm text-[var(--text-secondary)] mt-1">Version 1.0.0</p>
				</div>

				{/* Info */}
				<div className="px-6 pb-6 text-center">
					<p className="text-xs text-[var(--text-tertiary)] mb-4">
						A macOS-inspired interface for<br />
						your life management system
					</p>
					<p className="text-xs text-[var(--text-muted)]">
						Built with Next.js + Claude
					</p>
				</div>

				{/* Close button */}
				<div className="px-6 pb-6 flex justify-center">
					<button
						onClick={onClose}
						className="
              px-6 py-1.5 rounded-md
              bg-[#0a84ff] text-white text-sm font-medium
              hover:bg-[#0a84ff]/80
              transition-colors
            "
					>
						OK
					</button>
				</div>
			</div>
		</div>
	);
}

// ==========================================
// WIDGET DROPDOWN
// ==========================================

interface WidgetDropdownProps {
	icon: React.ReactNode;
	title: string;
	isOpen: boolean;
	onToggle: () => void;
	onClose: () => void;
	children: React.ReactNode;
}

function WidgetDropdown({ icon, title, isOpen, onToggle, onClose, children }: WidgetDropdownProps) {
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onClose]);

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				onClick={onToggle}
				aria-label={title}
				className="
					p-1 rounded-[4px]
					hover:bg-[var(--surface-muted)]
					transition-colors duration-75
					focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
				"
				title={title}
			>
				{icon}
			</button>

			{/* Dropdown */}
			{isOpen && (
				<div
					className="
						absolute top-full right-0 mt-1
						w-[340px] max-h-[500px]
						bg-[var(--surface-raised)] border border-[var(--border-default)]
						rounded-xl shadow-2xl overflow-hidden
						z-[2000]
					"
					onClick={(e) => e.stopPropagation()}
				>
					{children}
				</div>
			)}
		</div>
	);
}

// ==========================================
// CLOCK COMPONENT
// ==========================================

function Clock() {
	const [time, setTime] = useState<string>('');

	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			const formatted = now.toLocaleTimeString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true,
			});
			setTime(formatted);
		};

		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, []);

	return (
		<span className="text-[13px] text-[var(--text-primary)] font-medium">
			{time}
		</span>
	);
}

// ==========================================
// API HEALTH INDICATOR
// ==========================================

function ApiHealthIndicator() {
	const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

	useEffect(() => {
		const checkHealth = async () => {
			try {
				const response = await fetch(`${API_BASE}/api/health`, {
					method: 'GET',
					signal: AbortSignal.timeout(3000),
				});
				setIsHealthy(response.ok);
			} catch {
				setIsHealthy(false);
			}
		};

		checkHealth();
		const interval = setInterval(checkHealth, 30000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="flex items-center gap-1" title={isHealthy ? 'API Connected' : 'API Disconnected'}>
			{isHealthy === null ? (
				<Wifi className="w-4 h-4 text-[var(--text-muted)]" />
			) : isHealthy ? (
				<Wifi className="w-4 h-4 text-[var(--text-primary)]" />
			) : (
				<WifiOff className="w-4 h-4 text-[var(--color-error)]" />
			)}
		</div>
	);
}

// ==========================================
// USAGE BATTERY
// ==========================================

interface UsageData {
	session: {
		percentage: number;
		resetAt: string;
		used: number;
		total: number;
	};
	weekly?: {
		percentage: number;
		resetAt: string;
		used: number;
		total: number;
	} | null;
	model: string | null;
	plan: string | null;
	lastUpdated: string;
	status: 'success' | 'error' | 'no_data' | 'parsing_failed';
	error?: string;
	message?: string;
}

function UsageBattery() {
	const [usage, setUsage] = useState<UsageData | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Fetch usage data
	useEffect(() => {
		fetchUsage();

		// Poll every 60 seconds
		const interval = setInterval(fetchUsage, 60000);
		return () => clearInterval(interval);
	}, []);

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen]);

	const fetchUsage = async () => {
		try {
			const response = await fetch(`${API_BASE}/api/usage/current`);
			const data = await response.json();
			setUsage(data);
		} catch (error) {
			console.error('Failed to fetch usage:', error);
			setUsage(null);
		}
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await fetch(`${API_BASE}/api/usage/refresh`, { method: 'POST' });
			// Wait a bit for refresh to complete
			setTimeout(() => {
				fetchUsage();
				setIsRefreshing(false);
			}, 3000);
		} catch (error) {
			console.error('Refresh failed:', error);
			setIsRefreshing(false);
		}
	};

	// Determine battery state based on usage
	const getBatteryState = () => {
		if (!usage || usage.status !== 'success') {
			return { color: 'text-[var(--text-muted)]', icon: Battery };
		}

		// Use the lower of session or weekly percentage
		const percentage = Math.min(
			100 - usage.session.percentage, // Invert: remaining percentage
			usage.weekly ? 100 - usage.weekly.percentage : 100
		);

		if (percentage >= 80) {
			return { color: 'text-green-500', icon: Battery };
		} else if (percentage >= 30) {
			return { color: 'text-yellow-500', icon: Battery };
		} else if (percentage >= 10) {
			return { color: 'text-orange-500', icon: BatteryWarning };
		} else {
			return { color: 'text-red-500', icon: BatteryWarning };
		}
	};

	const formatTimeUntil = (resetAt: string): string => {
		const now = new Date();
		const reset = new Date(resetAt);
		const diff = reset.getTime() - now.getTime();

		if (diff < 0) return 'Soon';

		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes}m`;
	};

	const formatDate = (dateStr: string): string => {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	};

	const formatNumber = (num: number): string => {
		return num.toLocaleString();
	};

	const { color, icon: Icon } = getBatteryState();

	return (
		<div className="relative" ref={dropdownRef}>
			{/* Battery Icon */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				aria-label="Claude Code Usage"
				className="
					p-1 rounded-[4px]
					hover:bg-[var(--surface-muted)]
					transition-colors duration-75
					focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
				"
				title="Claude Code Usage"
			>
				{isRefreshing ? (
					<BatteryCharging className={`w-4 h-4 ${color} animate-pulse`} />
				) : (
					<Icon className={`w-4 h-4 ${color}`} />
				)}
			</button>

			{/* Dropdown */}
			{isOpen && (
				<div
					className="
						absolute top-full right-0 mt-1
						w-[320px]
						bg-[var(--surface-raised)] border border-[var(--border-default)]
						rounded-xl shadow-2xl overflow-hidden
						z-[2000] p-4
					"
					onClick={(e) => e.stopPropagation()}
				>
					<h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
						Claude Code Usage
					</h3>

					{usage && usage.status === 'success' ? (
						<>
							{/* Session Usage */}
							<div className="mb-4">
								<div className="flex justify-between items-center mb-1">
									<span className="text-xs text-[var(--text-secondary)]">5-Hour Session</span>
									<span className="text-xs font-mono text-[var(--text-primary)]">
										{usage.session.percentage.toFixed(1)}%
									</span>
								</div>
								<div className="w-full bg-[var(--surface-muted)] rounded-full h-2 mb-1">
									<div
										className={`h-2 rounded-full transition-all ${usage.session.percentage >= 90 ? 'bg-red-500' :
												usage.session.percentage >= 70 ? 'bg-orange-500' :
													usage.session.percentage >= 20 ? 'bg-yellow-500' :
														'bg-green-500'
											}`}
										style={{ width: `${usage.session.percentage}%` }}
									/>
								</div>
								<div className="text-xs text-[var(--text-tertiary)] flex justify-between">
									<span>Resets in: {formatTimeUntil(usage.session.resetAt)}</span>
									<span>{formatNumber(usage.session.used)} / {formatNumber(usage.session.total)}</span>
								</div>
							</div>

							{/* Weekly Usage */}
							{usage.weekly && (
								<div className="mb-4">
									<div className="flex justify-between items-center mb-1">
										<span className="text-xs text-[var(--text-secondary)]">Weekly Limit</span>
										<span className="text-xs font-mono text-[var(--text-primary)]">
											{usage.weekly.percentage.toFixed(1)}%
										</span>
									</div>
									<div className="w-full bg-[var(--surface-muted)] rounded-full h-2 mb-1">
										<div
											className={`h-2 rounded-full transition-all ${usage.weekly.percentage >= 90 ? 'bg-red-500' :
													usage.weekly.percentage >= 70 ? 'bg-orange-500' :
														usage.weekly.percentage >= 20 ? 'bg-yellow-500' :
															'bg-green-500'
												}`}
											style={{ width: `${usage.weekly.percentage}%` }}
										/>
									</div>
									<div className="text-xs text-[var(--text-tertiary)] flex justify-between">
										<span>Resets: {formatDate(usage.weekly.resetAt)}</span>
										<span>{formatNumber(usage.weekly.used)} / {formatNumber(usage.weekly.total)}</span>
									</div>
								</div>
							)}

							{/* Metadata */}
							<div className="pt-3 border-t border-[var(--border-subtle)] space-y-1 mb-3">
								{usage.model && (
									<div className="flex justify-between text-xs">
										<span className="text-[var(--text-secondary)]">Model:</span>
										<span className="text-[var(--text-primary)] font-mono">{usage.model}</span>
									</div>
								)}
								{usage.plan && (
									<div className="flex justify-between text-xs">
										<span className="text-[var(--text-secondary)]">Plan:</span>
										<span className="text-[var(--text-primary)] capitalize">{usage.plan}</span>
									</div>
								)}
								<div className="flex justify-between text-xs">
									<span className="text-[var(--text-secondary)]">Updated:</span>
									<span className="text-[var(--text-tertiary)]">
										{new Date(usage.lastUpdated).toLocaleTimeString()}
									</span>
								</div>
							</div>

							{/* Refresh Button */}
							<button
								onClick={handleRefresh}
								disabled={isRefreshing}
								className="
									w-full py-1.5 px-3
									bg-blue-600 hover:bg-blue-700
									disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-tertiary)]
									text-white text-xs rounded
									transition-colors
									flex items-center justify-center gap-2
								"
							>
								<RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
								{isRefreshing ? 'Refreshing...' : 'Refresh Now'}
							</button>
						</>
					) : (
						<div className="text-center py-4">
							<p className="text-sm text-[var(--text-secondary)] mb-3">
								{usage?.error || usage?.message || 'No usage data available'}
							</p>
							<button
								onClick={handleRefresh}
								className="
									py-1.5 px-3
									bg-blue-600 hover:bg-blue-700
									text-white text-xs rounded
									transition-colors
									flex items-center justify-center gap-2 mx-auto
								"
							>
								<RefreshCw className="w-3 h-3" />
								Try Refresh
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ==========================================
// MAIN MENUBAR COMPONENT
// ==========================================

export function Menubar() {
	const pathname = usePathname();
	const [showAbout, setShowAbout] = useState(false);
	const [calendarDropdownOpen, setCalendarDropdownOpen] = useState(false);
	const [prioritiesDropdownOpen, setPrioritiesDropdownOpen] = useState(false);

	const darkMode = useWindowStore((state) => state.darkMode);
	const toggleDarkMode = useWindowStore((state) => state.toggleDarkMode);
	const windows = useWindowStore((state) => state.windows);
	const windowStack = useWindowStore((state) => state.windowStack);

	// Compute the focused window's app type (if any)
	// This subscribes to windows and windowStack changes
	const focusedAppType = useMemo(() => {
		for (const id of windowStack) {
			const win = windows.find((w) => w.id === id && !w.minimized);
			if (win) return win.appType || null;
		}
		return null;
	}, [windows, windowStack]);

	// Get app name based on focused window (for Core Apps) or pathname (for Custom Apps/Desktop)
	const appName = getAppName(pathname, focusedAppType);

	return (
		<>
			<div
				className="
          h-[25px] shrink-0
          bg-[var(--surface-base)]/80 backdrop-blur-xl
          border-b border-[var(--border-subtle)]
          flex items-center justify-between
          px-2
          z-[1000]
          select-none
        "
			>
				{/* Left Side: Claude Logo + App Name */}
				<div className="flex items-center gap-0.5">
					{/* Claude Logo / About */}
					<button
						onClick={() => setShowAbout(true)}
						aria-label="About Claude OS"
						className="
              px-2 py-0.5
              hover:bg-[var(--surface-muted)]
              rounded-[4px]
              transition-colors duration-75
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
            "
						title="About Claude OS"
					>
						<ClaudeLogo className="w-4 h-4 text-[var(--text-primary)]" />
					</button>

					{/* Active App Name (bold) */}
					<span className="px-2 text-[13px] font-semibold text-[var(--text-primary)]">
						{appName}
					</span>
				</div>

				{/* Center: Widgets */}
				<div className="flex items-center gap-2">
					{/* Calendar Widget Dropdown */}
					<WidgetDropdown
						icon={<Calendar className="w-4 h-4 text-[var(--text-primary)]" />}
						title="Calendar"
						isOpen={calendarDropdownOpen}
						onToggle={() => {
							setCalendarDropdownOpen(!calendarDropdownOpen);
							if (prioritiesDropdownOpen) setPrioritiesDropdownOpen(false);
						}}
						onClose={() => setCalendarDropdownOpen(false)}
					>
						<CalendarWidgetContent />
					</WidgetDropdown>

					{/* Priorities Widget Dropdown */}
					<WidgetDropdown
						icon={<CheckSquare className="w-4 h-4 text-[var(--text-primary)]" />}
						title="Priorities"
						isOpen={prioritiesDropdownOpen}
						onToggle={() => {
							setPrioritiesDropdownOpen(!prioritiesDropdownOpen);
							if (calendarDropdownOpen) setCalendarDropdownOpen(false);
						}}
						onClose={() => setPrioritiesDropdownOpen(false)}
					>
						<PrioritiesWidgetContent />
					</WidgetDropdown>
				</div>

				{/* Right Side: Status Items + Clock */}
				<div className="flex items-center gap-3">
					{/* Dark Mode Toggle */}
					<button
						onClick={toggleDarkMode}
						aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
						className="
              p-1 rounded-[4px]
              hover:bg-[var(--surface-muted)]
              transition-colors duration-75
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
            "
						title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
					>
						{darkMode ? (
							<Sun className="w-4 h-4 text-[var(--text-primary)]" />
						) : (
							<Moon className="w-4 h-4 text-[var(--text-primary)]" />
						)}
					</button>

					{/* API Health */}
					<ApiHealthIndicator />

					{/* Usage Battery */}
					<UsageBattery />

					{/* Clock */}
					<Clock />
				</div>
			</div>

			{/* About Dialog */}
			<AboutDialog isOpen={showAbout} onClose={() => setShowAbout(false)} />
		</>
	);
}

export default Menubar;
