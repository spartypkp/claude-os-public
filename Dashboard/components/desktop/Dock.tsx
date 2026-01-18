'use client';

import { getAppRootPath, getApps } from '@/lib/appRegistry';
import { useWindowStore, type CoreAppType, type WindowState } from '@/store/windowStore';
import {
	Calendar,
	FileText,
	FolderOpen,
	LayoutDashboard,
	LayoutGrid,
	Mail,
	MessageCircle,
	Monitor,
	Rocket,
	Settings,
	UserCog,
	Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';



// ==========================================
// CONSTANTS
// ==========================================

const BASE_ICON_SIZE = 48;
const MAX_ICON_SIZE = 64;
const MAGNIFICATION_RANGE = 120; // pixels - how far the effect extends
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// ==========================================
// CLAUDE LOGO SVG
// ==========================================

function ClaudeLogo({ className = 'w-6 h-6' }: { className?: string; }) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
		</svg>
	);
}

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
}

// ==========================================
// DOCK APPS CONFIGURATION
// ==========================================

// Core Apps (ship with Claude OS)
// Per spec: Finder, Calendar, Contacts, Widgets, Settings
// All Core Apps open as windows on Desktop by default
const CORE_APPS: DockItem[] = [
	{
		id: 'desktop',
		name: 'Desktop',
		icon: <Monitor className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-slate-400 to-slate-600',
		route: '/desktop',
	},
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
		id: 'widgets',
		name: 'Claude Widgets',
		icon: <LayoutDashboard className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-purple-400 to-purple-600',
		appWindow: 'widgets',
	},
	{
		id: 'missions',
		name: 'Claude Missions',
		icon: <Rocket className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-amber-400 to-orange-600',
		appWindow: 'missions',
	},
	{
		id: 'roles',
		name: 'Claude Roles',
		icon: <UserCog className="w-6 h-6" />,
		type: 'app',
		gradient: 'from-indigo-400 to-indigo-600',
		appWindow: 'roles',
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
				gradient: 'from-blue-400 to-blue-600', // Consistent blue for all custom apps
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
		}));
	}, [pathname, windows, customApps]);

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
				case 'widgets': return <LayoutGrid className="w-5 h-5" />;
				case 'email': return <Mail className="w-5 h-5" />;
				case 'missions': return <Rocket className="w-5 h-5" />;
				case 'roles': return <Users className="w-5 h-5" />;
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
				case 'widgets': return 'from-purple-400 to-purple-600';
				case 'email': return 'from-sky-400 to-blue-600';
				case 'missions': return 'from-amber-400 to-orange-600';
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
