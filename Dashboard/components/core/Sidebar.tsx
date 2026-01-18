'use client';

import { getApps } from '@/lib/appRegistry';
import {
	Cog,
	FolderOpen,
	PanelLeftClose,
	PanelLeftOpen,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Blueprint, BlueprintAccordion } from '@/components/shared/BlueprintAccordion';
import { SidebarTooltip } from './SidebarTooltip';

export type ViewType = 'desk' | 'system';

// ============================================================================
// DYNAMIC BLUEPRINTS FROM APP REGISTRY
// ============================================================================

function getBlueprints(): Blueprint[] {
	return getApps()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((app) => {
		const Icon = app.icon;
		return {
			id: app.id,
			name: app.name,
			icon: <Icon className="w-4 h-4" />,
			status: { label: '' }, // Will be filled by getBadge if available
			views: app.routes.map((route) => {
				const RouteIcon = route.icon;
				return {
					id: route.id,
					label: route.label,
					href: route.path,
					icon: <RouteIcon className="w-3.5 h-3.5" />,
				};
			}),
			getBadge: app.getBadge,
		};
	});
}

// ============================================================================
// CORE NAV ITEMS (Top Tier)
// ============================================================================

interface CoreNavItem {
	id: string;
	label: string;
	icon: React.ReactNode;
	href: string;
}

const coreNavItems: CoreNavItem[] = [
	{ id: 'domains', label: 'Domains', icon: <FolderOpen className="w-4 h-4" />, href: '/desktop' },
];

// ============================================================================
// SIDEBAR COMPONENT
// ============================================================================
// Note: Calendar and Email are Core Apps accessed via Desktop Dock, not sidebar routes

interface SidebarProps {
	isCollapsed?: boolean;
	onToggleCollapse?: () => void;
}

export function Sidebar({
	isCollapsed = false,
	onToggleCollapse,
}: SidebarProps) {
	const [currentTime, setCurrentTime] = useState<Date | null>(null);
	const [expandedBlueprint, setExpandedBlueprint] = useState<string | null>(null);
	const pathname = usePathname();

	// Get blueprints from app registry (memoized)
	const blueprints = useMemo(() => getBlueprints(), []);

	// Auto-expand first blueprint or the one matching current path
	useEffect(() => {
		for (const bp of blueprints) {
			if (bp.views.some(v => pathname === v.href || pathname?.startsWith(v.href + '/'))) {
				setExpandedBlueprint(bp.id);
				return;
			}
		}
		// Default: expand first blueprint
		if (blueprints.length > 0 && !expandedBlueprint) {
			setExpandedBlueprint(blueprints[0].id);
		}
	}, [pathname, blueprints, expandedBlueprint]);

	// Time state for header display
	useEffect(() => {
		setCurrentTime(new Date());
		const interval = setInterval(() => setCurrentTime(new Date()), 60000);
		return () => clearInterval(interval);
	}, []);

	return (
		<aside
			className={`
        flex-shrink-0 flex flex-col
        border-r border-[var(--border-strong)]
        bg-[var(--surface-base)]
        transition-[width] duration-200 ease-in-out
        ${isCollapsed ? 'w-16' : 'w-64'}
      `}
		>
			{/* ================================================================== */}
			{/* DATE/TIME HEADER                                                   */}
			{/* ================================================================== */}
			<div className={`pt-3 pb-2 border-b border-[var(--border-subtle)] ${isCollapsed ? 'px-2' : 'px-4'}`}>
				{isCollapsed ? (
					<div className="flex justify-center">
						<button
							onClick={onToggleCollapse}
							className="p-1.5 rounded hover:bg-[var(--surface-muted)] text-[var(--color-claude)]/60 hover:text-[var(--color-claude)] transition-colors"
							title="Expand sidebar (⌘\)"
						>
							<PanelLeftOpen className="w-4 h-4" />
						</button>
					</div>
				) : (
					<div className="flex items-start justify-between">
						<div className="text-left flex-1">
							{currentTime && (
								<>
									<div className="text-base font-semibold text-[var(--text-primary)]">
										{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
									</div>
									<div className="text-[11px] text-[var(--text-muted)] tabular-nums">
										{currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
									</div>
								</>
							)}
						</div>
						<button
							onClick={onToggleCollapse}
							className="p-1.5 rounded hover:bg-[var(--surface-muted)] text-[var(--color-claude)]/60 hover:text-[var(--color-claude)] transition-colors -mr-1.5"
							title="Collapse sidebar (⌘\)"
						>
							<PanelLeftClose className="w-4 h-4" />
						</button>
					</div>
				)}
			</div>

			{/* Navigation Container */}
			<nav className="flex-1 py-2 overflow-y-auto flex flex-col">

				{/* ================================================================== */}
				{/* TOP TIER — CORE                                                    */}
				{/* Platform infrastructure, always there, muted feel                  */}
				{/* ================================================================== */}
				<div className="px-2">
					{isCollapsed ? (
						// Collapsed: Core icons
						<div className="flex flex-col items-center gap-1">
							{coreNavItems.map((item) => {
								const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
								return (
									<SidebarTooltip key={item.id} label={item.label}>
										<Link
											href={item.href}
											className={`
                        p-2 rounded flex items-center justify-center
                        transition-colors duration-75
                        ${isActive
													? 'bg-[var(--surface-accent)] text-[var(--color-claude)]'
													: 'text-[var(--color-claude)]/60 hover:bg-[var(--surface-muted)] hover:text-[var(--color-claude)]'
												}
                      `}
										>
											{item.icon}
										</Link>
									</SidebarTooltip>
								);
							})}
						</div>
					) : (
						// Expanded: Core nav items
						<>
							{/* Core Nav Links */}
							{coreNavItems.map((item) => {
								const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
								return (
									<Link
										key={item.id}
										href={item.href}
										className={`
                      flex items-center gap-2.5 px-3 py-1.5 rounded text-sm
                      transition-colors duration-75
                      ${isActive
												? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
												: 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
											}
                    `}
									>
										<span className={`flex-shrink-0 ${isActive ? 'text-[var(--color-claude)]' : 'text-[var(--color-claude)]/60'}`}>
											{item.icon}
										</span>
										<span className="text-[13px]">{item.label}</span>
									</Link>
								);
							})}
						</>
					)}
				</div>

				{/* ================================================================== */}
				{/* MIDDLE TIER — BLUEPRINTS                                           */}
				{/* User's installed domain modules, accordion pattern                 */}
				{/* Visual container with raised background                            */}
				{/* ================================================================== */}
				<div className={`mt-3 mx-2 ${isCollapsed ? '' : 'p-2 bg-[var(--surface-raised)] rounded-xl border border-[var(--border-subtle)]'}`}>
					{!isCollapsed && (
						<div className="px-2 py-1 mb-1">
							<span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								Blueprints
							</span>
						</div>
					)}

					{isCollapsed ? (
						// Collapsed: Blueprint icons with separator
						<div className="flex flex-col items-center gap-1 pt-2 border-t border-[var(--border-subtle)]">
							{blueprints.map((bp) => (
								<BlueprintAccordion
									key={bp.id}
									blueprint={bp}
									expanded={expandedBlueprint === bp.id}
									onToggle={() => setExpandedBlueprint(expandedBlueprint === bp.id ? null : bp.id)}
									isCollapsed={true}
								/>
							))}
						</div>
					) : (
						// Expanded: Blueprint accordions
						<>
							{blueprints.map((bp) => (
								<BlueprintAccordion
									key={bp.id}
									blueprint={bp}
									expanded={expandedBlueprint === bp.id}
									onToggle={() => setExpandedBlueprint(expandedBlueprint === bp.id ? null : bp.id)}
									isCollapsed={false}
								/>
							))}

							{/* Empty state hint for future */}
							{blueprints.length === 0 && (
								<div className="px-3 py-4 text-center">
									<p className="text-[11px] text-[var(--text-muted)]">
										No blueprints installed
									</p>
								</div>
							)}
						</>
					)}
				</div>

				{/* Spacer to push bottom tier down */}
				<div className="flex-1" />

				{/* ================================================================== */}
				{/* BOTTOM TIER — SYSTEM                                               */}
				{/* Platform configuration, rarely used, very muted                    */}
				{/* ================================================================== */}
				<div className={`px-2 pt-2 border-t border-[var(--border-subtle)] ${isCollapsed ? '' : ''}`}>
					{isCollapsed ? (
						<div className="flex flex-col items-center gap-1">
							<SidebarTooltip label="Settings">
								<Link
									href="/system"
									className={`
                    p-2 rounded flex items-center justify-center
                    transition-colors duration-75
                    ${pathname === '/system'
											? 'bg-[var(--surface-accent)] text-[var(--text-muted)]'
											: 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)]'
										}
                  `}
								>
									<Cog className="w-4 h-4" />
								</Link>
							</SidebarTooltip>
						</div>
					) : (
						<Link
							href="/system"
							className={`
                flex items-center gap-2.5 px-3 py-1.5 rounded text-sm
                transition-colors duration-75
                ${pathname === '/system'
									? 'bg-[var(--surface-accent)] text-[var(--text-secondary)]'
									: 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)]'
								}
              `}
						>
							<Cog className="w-4 h-4" />
							<span className="text-[13px]">Settings</span>
						</Link>
					)}
				</div>
			</nav>

			{/* ================================================================== */}
			{/* FOOTER                                                             */}
			{/* ================================================================== */}
			<div className={`border-t border-[var(--border-subtle)] py-3 ${isCollapsed ? 'px-2' : 'px-4'}`}>
				{isCollapsed ? (
					<SidebarTooltip label="Keyboard shortcuts">
						<div className="flex justify-center">
							<kbd className="px-1 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--text-muted)] font-mono text-[10px]">?</kbd>
						</div>
					</SidebarTooltip>
				) : (
					<div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
						<kbd className="px-1 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--text-muted)] font-mono">?</kbd>
						<span>shortcuts</span>
					</div>
				)}
			</div>
		</aside>
	);
}

export default Sidebar;

