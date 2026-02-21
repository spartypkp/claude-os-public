'use client';

import { getAppRootPath, getApps } from '@/lib/appRegistry';
import { useWindowStore, type CoreAppType, type WindowState } from '@/store/windowStore';
import {
	BarChart3,
	Calendar,
	FileText,
	FolderGit2,
	FolderOpen,
	Mail,
	MessageCircle,
	Settings,
	Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Import app manifests to trigger registration
import '@/app/ember/manifest';
import '@/app/job-search/manifest';
import '@/app/release/manifest';
import '@/app/training-will/manifest';
import '@/app/turbine/manifest';

// ==========================================
// CONSTANTS
// ==========================================

import { API_BASE } from '@/lib/api';
import { useEmailBadgeQuery } from '@/hooks/queries';

const BASE_ICON_SIZE = 48;
const MAX_ICON_SIZE = 64;
const MAGNIFICATION_RANGE = 120; // pixels - how far the effect extends

// ==========================================
// TYPES
// ==========================================

interface DockItem {
	id: string;
	name: string;
	icon: React.ReactNode;
	type: 'app' | 'system';
	gradient: string;
	route?: string;
	/** If set, opens as a window on Desktop instead of navigating */
	appWindow?: CoreAppType;
	isRunning?: boolean;
	/** Red notification badge number (bottom-right corner) */
	badge?: number;
}

// ==========================================
// DOCK APPS CONFIGURATION
// ==========================================

// Core Apps (ship with Claude OS)
// Per spec: Finder, Calendar, Contacts, Widgets, Settings
// All Core Apps open as windows on Desktop by default
const CORE_APPS: DockItem[] = [
	{
		id: 'finder',
		name: 'Claude Finder',
		icon: <FolderOpen className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-blue-400 to-blue-600',
		appWindow: 'finder',
	},
	{
		id: 'calendar',
		name: 'Claude Calendar',
		icon: <Calendar className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-red-400 to-red-600',
		appWindow: 'calendar',
	},
	{
		id: 'contacts',
		name: 'Claude Contacts',
		icon: <Users className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-green-400 to-green-600',
		appWindow: 'contacts',
	},
	{
		id: 'email',
		name: 'Claude Mail',
		icon: <Mail className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-sky-400 to-blue-600',
		appWindow: 'email',
	},
	{
		id: 'messages',
		name: 'Claude Messages',
		icon: <MessageCircle className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-[#DA7756] to-[#C15F3C]',
		appWindow: 'messages',
	},
	{
		id: 'projects',
		name: 'Projects',
		icon: <FolderGit2 className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-cyan-400 to-teal-600',
		appWindow: 'projects',
	},
	{
		id: 'analytics',
		name: 'Observatory',
		icon: <BarChart3 className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-violet-400 to-purple-600',
		appWindow: 'analytics',
	},
	{
		id: 'settings',
		name: 'Claude Settings',
		icon: <Settings className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-slate-500 to-slate-700',
		appWindow: 'settings',
	},
];

// Custom Apps - dynamically loaded from app registry
// Each app registers itself via manifest.ts
// Sort by ID for deterministic order (prevents hydration mismatch)
function getCustomApps(): DockItem[] {
	return getApps()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((app) => {
		const Icon = app.icon;
		return {
			id: app.id,
			name: app.name,
			icon: <Icon className="w-6 h-6" />,
			type: 'app' as const,
			gradient: app.gradient,
			route: getAppRootPath(app),
		};
	});
}

// ==========================================
// DOCK ICON COMPONENT
// ==========================================

interface DockIconProps {
	item: DockItem;
	scale: number;
	onClick: () => void;
	onMouseEnter: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
}

const DockIcon = React.memo(function DockIcon({ item, scale, onClick, onMouseEnter, onContextMenu }: DockIconProps) {
	const size = BASE_ICON_SIZE * scale;

	return (
		<div
			className="relative flex flex-col items-center"
			style={{
				// Adjust margin based on scale to keep spacing consistent
				marginBottom: (scale - 1) * BASE_ICON_SIZE * 0.5,
			}}
		>
			{/* Icon button */}
			<button
				data-testid={`dock-icon-${item.id}`}
				onClick={onClick}
				onMouseEnter={onMouseEnter}
				onContextMenu={onContextMenu}
				aria-label={item.name}
				className="relative group transition-transform duration-75 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 focus-visible:rounded-xl"
				style={{
					width: size,
					height: size,
				}}
			>
				{/* Icon background with gradient */}
				<div
					className={`
            absolute inset-0 rounded-xl
            bg-gradient-to-br ${item.gradient}
            shadow-lg shadow-black/40
            ring-1 ring-white/20
            flex items-center justify-center
            transition-all duration-75
            group-hover:ring-white/30
          `}
				>
					{/* Icon */}
					<div className="text-white drop-shadow-sm" style={{ transform: `scale(${scale})` }}>
						{item.icon}
					</div>
				</div>

				{/* Tooltip on hover */}
				<div className="
          absolute -top-10 left-1/2 -translate-x-1/2
          px-3 py-1.5 rounded-lg
          bg-[var(--surface-raised)] border border-[var(--border-default)]
          text-xs font-medium text-[var(--text-primary)]
          whitespace-nowrap
          opacity-0 group-hover:opacity-100
          pointer-events-none
          transition-opacity duration-150
          shadow-xl
        ">
					{item.name}
				</div>
			</button>

			{/* Running indicator dot */}
			{item.isRunning && (
				<div className="
          absolute -bottom-1.5 left-1/2 -translate-x-1/2
          w-1.5 h-1.5 rounded-full
          bg-[var(--text-primary)]
          shadow-sm
        " />
			)}

			{/* Notification badge */}
			{item.badge != null && item.badge > 0 && (
				<div className="
					absolute -bottom-0.5 -right-0.5
					min-w-[18px] h-[18px] px-1
					rounded-full bg-red-500
					text-white text-[10px] font-bold
					flex items-center justify-center
					leading-none
					shadow-md
					pointer-events-none
				">
					{item.badge > 99 ? '99+' : item.badge}
				</div>
			)}
		</div>
	);
});

// ==========================================
// MAIN DOCK COMPONENT
// ==========================================

export function Dock() {
	const router = useRouter();
	const pathname = usePathname();
	const dockRef = useRef<HTMLDivElement>(null);
	const [mouseX, setMouseX] = useState<number | null>(null);

	// Throttle mouse position updates using RAF for smooth 60fps animation
	const mouseXRef = useRef<number | null>(null);
	const rafRef = useRef<number | null>(null);

	// Get window store for opening app windows and managing minimized windows
	const {
		openAppWindow,
		unminimizeWindow,
		getMinimizedWindows,
		hasOpenWindow,
		windows,
		openContextMenu
	} = useWindowStore();

	// Get minimized windows
	const minimizedWindows = useMemo(() => {
		return windows.filter(w => w.minimized);
	}, [windows]);

	// Get custom apps from registry (memoized)
	const customApps = useMemo(() => getCustomApps(), []);

	// Email triage badge count
	const { data: emailBadgeData } = useEmailBadgeQuery();
	const emailTriageCount = emailBadgeData?.unread_count ?? 0;

	// Combine all apps (for magnification calculation)
	const allApps = useMemo(() => {
		// Add isRunning based on:
		// - For Core Apps (appWindow): check if they have open windows
		// - For Custom Apps (route): check if current route matches
		return [...CORE_APPS, ...customApps].map(app => ({
			...app,
			isRunning: app.appWindow
				? windows.some(w => w.appType === app.appWindow && !w.minimized)
				: app.route
					? pathname?.startsWith(app.route)
					: false,
			badge: app.id === 'email' ? emailTriageCount : undefined,
		}));
	}, [pathname, windows, customApps, emailTriageCount]);

	const dockItems = useMemo(() => {
		return allApps;
	}, [allApps]);

	// Calculate magnification scale for each icon
	const getScale = useCallback((index: number): number => {
		if (mouseX === null || !dockRef.current) return 1;

		const dockRect = dockRef.current.getBoundingClientRect();
		const itemCount = dockItems.length;
		const itemWidth = BASE_ICON_SIZE + 8; // icon + gap

		// Calculate icon center position
		const startX = dockRect.left + 16; // padding
		const iconCenterX = startX + (index * itemWidth) + (BASE_ICON_SIZE / 2);

		// Distance from mouse to icon center
		const distance = Math.abs(mouseX - iconCenterX);

		if (distance > MAGNIFICATION_RANGE) return 1;

		// Smooth magnification curve (cosine for natural feel)
		const factor = 1 - (distance / MAGNIFICATION_RANGE);
		const maxScale = MAX_ICON_SIZE / BASE_ICON_SIZE;
		return 1 + (factor * factor * (maxScale - 1)); // Quadratic for smoother falloff
	}, [mouseX, dockItems.length]);

	// Track mouse position with RAF throttling for smooth 60fps animation
	// This prevents excessive re-renders while maintaining smooth magnification
	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		mouseXRef.current = e.clientX;

		// Only schedule RAF if one isn't already pending
		if (rafRef.current === null) {
			rafRef.current = requestAnimationFrame(() => {
				setMouseX(mouseXRef.current);
				rafRef.current = null;
			});
		}
	}, []);

	const handleMouseLeave = useCallback(() => {
		// Cancel any pending RAF
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		mouseXRef.current = null;
		setMouseX(null);
	}, []);

	// Cleanup RAF on unmount
	useEffect(() => {
		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, []);

	// Handle icon clicks
	const handleItemClick = useCallback((item: DockItem) => {
		if (item.appWindow) {
			// Open as window on Desktop (Core Apps)
			// First navigate to desktop if not there
			if (pathname !== '/desktop' && !pathname.startsWith('/desktop')) {
				router.push('/desktop');
			}
			// Then open the app window
			openAppWindow(item.appWindow);
		} else if (item.route) {
			// Navigate to app route (Custom Apps)
			router.push(item.route);
		}
	}, [router, pathname, openAppWindow]);

	// Handle click on minimized window
	const handleMinimizedClick = useCallback((win: WindowState) => {
		// Navigate to desktop if not there
		if (pathname !== '/desktop' && !pathname.startsWith('/desktop')) {
			router.push('/desktop');
		}
		// Restore the window
		unminimizeWindow(win.id);
	}, [pathname, router, unminimizeWindow]);

	// Handle context menu for core apps
	const handleAppContextMenu = useCallback((item: DockItem, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const isRunning = windows.some(w => w.appType === item.appWindow && !w.minimized);
		openContextMenu(e.clientX, e.clientY, 'dock-app', undefined, {
			dockAppId: item.id,
			dockAppName: item.name,
			dockAppType: item.appWindow,
			dockAppIsRunning: isRunning,
		});
	}, [openContextMenu, windows]);

	// Handle context menu for minimized windows
	const handleMinimizedContextMenu = useCallback((win: WindowState, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, 'dock-minimized', undefined, {
			minimizedWindowId: win.id,
			minimizedWindowTitle: win.title,
		});
	}, [openContextMenu]);

	// Calculate positions for magnification
	const coreAppsStart = 0;
	const customAppsStart = CORE_APPS.length;
	const minimizedStart = CORE_APPS.length + customApps.length;
	const hasCustomApps = customApps.length > 0;
	const hasMinimizedWindows = minimizedWindows.length > 0;

	// Helper to get icon for minimized window
	const getMinimizedWindowIcon = (win: WindowState) => {
		if (win.appType) {
			switch (win.appType) {
				case 'finder': return <FolderOpen className="w-5 h-5" />;
				case 'calendar': return <Calendar className="w-5 h-5" />;
				case 'contacts': return <Users className="w-5 h-5" />;
				case 'settings': return <Settings className="w-5 h-5" />;
	
				case 'email': return <Mail className="w-5 h-5" />;
				case 'analytics': return <BarChart3 className="w-5 h-5" />;
				case 'projects': return <FolderGit2 className="w-5 h-5" />;
			}
		}
		return <FileText className="w-5 h-5" />;
	};

	// Helper to get gradient for minimized window
	const getMinimizedWindowGradient = (win: WindowState) => {
		if (win.appType) {
			switch (win.appType) {
				case 'finder': return 'from-blue-400 to-blue-600';
				case 'calendar': return 'from-red-400 to-red-600';
				case 'contacts': return 'from-green-400 to-green-600';
				case 'settings': return 'from-slate-500 to-slate-700';
	
				case 'email': return 'from-sky-400 to-blue-600';
				case 'analytics': return 'from-violet-400 to-purple-600';
				case 'projects': return 'from-cyan-400 to-teal-600';
			}
		}
		return 'from-gray-400 to-gray-600';
	};

	// Separator component
	const Separator = () => (
		<div className="
      w-px h-12 mx-1
      bg-[var(--border-default)]
      self-center
    " />
	);

	return (
		<div
			className="
        absolute bottom-2 left-[60%] -translate-x-1/2
        z-50
      "
		>
			{/* Dock container with glass effect */}
			<div
				ref={dockRef}
				data-testid="dock"
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				className="
          flex items-end gap-2 px-4 pb-2 pt-3
          bg-[var(--surface-base)]/60 backdrop-blur-xl
          border border-[var(--border-default)]
          rounded-2xl
          shadow-2xl
        "
			>
				{/* Core Apps */}
				{allApps.slice(0, CORE_APPS.length).map((item, index) => (
					<DockIcon
						key={item.id}
						item={item}
						scale={getScale(coreAppsStart + index)}
						onClick={() => handleItemClick(item)}
						onMouseEnter={() => { }}
						onContextMenu={item.appWindow ? (e) => handleAppContextMenu(item, e) : undefined}
					/>
				))}

				{/* Separator before Custom Apps */}
				{hasCustomApps && <Separator />}

				{/* Custom Apps (Blueprints) */}
				{allApps.slice(CORE_APPS.length).map((item, index) => (
					<DockIcon
						key={item.id}
						item={item}
						scale={getScale(customAppsStart + index)}
						onClick={() => handleItemClick(item)}
						onMouseEnter={() => { }}
					/>
				))}

				{/* Separator before minimized windows */}
				{hasMinimizedWindows && <Separator />}

				{/* Minimized Windows */}
				{minimizedWindows.map((win, index) => (
					<DockIcon
						key={win.id}
						item={{
							id: win.id,
							name: win.title,
							icon: getMinimizedWindowIcon(win),
							type: 'app',
							gradient: getMinimizedWindowGradient(win),
						}}
						scale={getScale(minimizedStart + index)}
						onClick={() => handleMinimizedClick(win)}
						onMouseEnter={() => { }}
						onContextMenu={(e) => handleMinimizedContextMenu(win, e)}
					/>
				))}
			</div>
		</div>
	);
}

export default Dock;
