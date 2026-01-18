'use client';

import { ApplicationShell } from './ApplicationShell';
import type { AppManifest } from '@/lib/appRegistry';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

// ============================================================================
// SUB-NAVIGATION COMPONENT
// ============================================================================

interface SubNavigationProps {
	routes: AppManifest['routes'];
	basePath: string;
}

function SubNavigation({ routes, basePath }: SubNavigationProps) {
	const pathname = usePathname();

	return (
		<div className="flex items-center gap-1">
			{routes.map((route) => {
				const Icon = route.icon;
				const isOverview = route.path === basePath;
				const isActive =
					pathname === route.path ||
					(!isOverview && pathname?.startsWith(route.path + '/')) ||
					(pathname === basePath && isOverview);

				return (
					<Link
						key={route.id}
						href={route.path}
						className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap
              ${isActive
								? 'bg-[#da7756]/15 text-[#da7756] dark:bg-[#da7756]/20'
								: 'text-gray-500 dark:text-[#888] hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-white'
							}
            `}
						title={route.shortcut ? `${route.label} (${route.shortcut})` : route.label}
					>
						<Icon className="w-3.5 h-3.5" />
						<span>{route.label}</span>
					</Link>
				);
			})}
		</div>
	);
}

// ============================================================================
// APP LAYOUT COMPONENT
// ============================================================================

interface AppLayoutProps {
	manifest: AppManifest;
	children: React.ReactNode;
}

/**
 * AppLayout - Shared layout wrapper for Custom Apps.
 * 
 * Provides:
 * - ApplicationShell with traffic lights and title
 * - Sub-navigation from manifest routes
 * - Keyboard shortcuts (1-9 for sub-routes, Escape to go back)
 */
export function AppLayout({ manifest, children }: AppLayoutProps) {
	const pathname = usePathname();
	const router = useRouter();
	const basePath = `/${manifest.id}`;

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			// Ignore if typing in an input
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			// Number keys (1-9) for sub-navigation
			if (e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const index = parseInt(e.key) - 1;
				if (index < manifest.routes.length) {
					e.preventDefault();
					router.push(manifest.routes[index].path);
				}
				return;
			}

			// Escape to go back
			if (e.key === 'Escape') {
				e.preventDefault();
				if (pathname === basePath) {
					// On app root, go to Desktop
					router.push('/desktop');
				} else {
					// On sub-page, go up one level
					const parts = pathname.split('/').filter(Boolean);
					if (parts.length > 2) {
						router.push('/' + parts.slice(0, -1).join('/'));
					} else {
						router.push(basePath);
					}
				}
				return;
			}
		},
		[pathname, router, basePath, manifest.routes]
	);

	useEffect(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	const Icon = manifest.icon;

	return (
		<ApplicationShell
			title={manifest.name}
			icon={<Icon className="w-4 h-4" />}
			subNav={<SubNavigation routes={manifest.routes} basePath={basePath} />}
		>
			{children}
		</ApplicationShell>
	);
}

export default AppLayout;

