'use client';

import { ClaudePanel } from '@/components/ClaudePanel';
import { ChatPanelProvider, useChatPanel } from '@/components/context/ChatPanelContext';
import { Dock } from '@/components/desktop/Dock';
import { Menubar } from '@/components/desktop/Menubar';
import {
	Activity,
	BarChart3,
	FileText,
	HelpCircle,
	History,
	Presentation,
	Settings,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CommandPalette, { CommandItem } from './CommandPalette';
import { HelpOverlay } from './HelpOverlay';


// View types for navigation
// Note: Calendar, Email, Contacts are Core Apps (accessed via Desktop Dock windows), not routes
export type ViewType = 'desk' | 'system' | 'activity';

// Map routes to view types
const ROUTE_TO_VIEW: Record<string, ViewType> = {
	'/desktop': 'desk',
	'/system': 'system',
	'/activity': 'activity',
};

// Get view type from pathname
function getViewFromPath(pathname: string): ViewType {
	// Check exact matches first
	if (ROUTE_TO_VIEW[pathname]) {
		return ROUTE_TO_VIEW[pathname];
	}
	// Check prefixes for nested routes
	if (pathname.startsWith('/desktop')) return 'desk';
	if (pathname.startsWith('/system')) return 'system';
	if (pathname.startsWith('/activity')) return 'activity';
	// Default
	return 'desk';
}

interface AppShellProps {
	children: React.ReactNode;
}

// Inner component to handle ⌘L toggle (needs to be inside ChatPanelProvider)
function ClaudePanelWithToggle() {
	const { isOpen, toggleVisibility } = useChatPanel();

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// ⌘L - Toggle Claude panel visibility
			if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
				e.preventDefault();
				toggleVisibility();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [toggleVisibility]);

	return <ClaudePanel isVisible={isOpen} />;
}

export function AppShell({ children }: AppShellProps) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const currentView = getViewFromPath(pathname);

	const [mounted, setMounted] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [showCommandPalette, setShowCommandPalette] = useState(false);

	// Workers system removed

	// Mark as mounted
	useEffect(() => {
		setMounted(true);
	}, []);

	// Navigate to a view
	const navigateToView = useCallback((view: ViewType) => {
		const routes: Record<ViewType, string> = {
			desk: '/desktop',
			system: '/system',
			activity: '/activity',
		};
		router.push(routes[view]);
	}, [router]);

	// Navigate to a specific sub-route (for command palette)
	const navigateToPath = useCallback((path: string) => {
		router.push(path);
	}, [router]);

	// Keyboard navigation - use capture phase for Cmd+K to prevent browser interception
	useEffect(() => {
		// Cmd+K handler in capture phase to intercept before browser
		const handleCmdK = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				setShowCommandPalette((prev) => !prev);
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			// Ignore shortcuts if typing in an input
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			// View switching with 1-4 (quick navigation)
			const viewKeys: Record<string, ViewType> = {
				'1': 'desk',
				'2': 'activity',
				'3': 'system',
			};

			if (viewKeys[e.key]) {
				e.preventDefault();
				navigateToView(viewKeys[e.key]);
				return;
			}

			// Help overlay with ?
			if (e.key === '?' || (e.shiftKey && e.key === '/')) {
				e.preventDefault();
				setShowHelp((prev) => !prev);
				return;
			}

			// Close help with Escape
			if (e.key === 'Escape' && showHelp) {
				e.preventDefault();
				setShowHelp(false);
				return;
			}
		};

		// Capture phase for Cmd+K - intercepts before browser's default handler
		document.addEventListener('keydown', handleCmdK, { capture: true });
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleCmdK, { capture: true });
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [showHelp, navigateToView]);

	// Command palette commands
	const commands: CommandItem[] = useMemo(() => [
		// Navigation
		{
			id: 'nav-desk',
			title: 'Go to Desktop',
			description: 'macOS-style desktop with Core Apps',
			icon: <Presentation className="w-4 h-4" />,
			shortcut: ['1'],
			category: 'Navigation',
			action: () => navigateToView('desk'),
		},
		{
			id: 'nav-activity',
			title: 'Go to Activity',
			description: 'Today\'s Claude sessions and tasks',
			icon: <Activity className="w-4 h-4" />,
			shortcut: ['2'],
			category: 'Navigation',
			action: () => navigateToView('activity'),
		},
		{
			id: 'nav-system',
			title: 'Go to System',
			description: 'Health, docs, metrics, and settings',
			icon: <Settings className="w-4 h-4" />,
			shortcut: ['3'],
			category: 'Navigation',
			action: () => navigateToView('system'),
		},
		// Claude sub-pages
		{
			id: 'nav-history',
			title: 'Go to Sessions',
			description: 'Past Claude sessions',
			icon: <History className="w-4 h-4" />,
			category: 'System',
			action: () => navigateToPath('/system/sessions'),
		},
		// System sub-pages
		{
			id: 'nav-health',
			title: 'Go to Health',
			description: 'System status and integrations',
			icon: <Activity className="w-4 h-4" />,
			category: 'System',
			action: () => navigateToPath('/system/health'),
		},
		{
			id: 'nav-docs',
			title: 'Go to Docs',
			description: 'System documentation',
			icon: <FileText className="w-4 h-4" />,
			category: 'System',
			action: () => navigateToPath('/system/docs'),
		},
		{
			id: 'nav-metrics',
			title: 'Go to Metrics',
			description: 'Task statistics and database',
			icon: <BarChart3 className="w-4 h-4" />,
			category: 'System',
			action: () => navigateToPath('/system/metrics'),
		},
		{
			id: 'nav-settings',
			title: 'Go to Settings',
			description: 'System configuration',
			icon: <Settings className="w-4 h-4" />,
			category: 'System',
			action: () => navigateToPath('/system/settings'),
		},
		// Actions
		{
			id: 'action-help',
			title: 'Show Keyboard Shortcuts',
			description: 'View all available shortcuts',
			icon: <HelpCircle className="w-4 h-4" />,
			shortcut: ['?'],
			category: 'Actions',
			action: () => setShowHelp(true),
		},
	], [navigateToView, navigateToPath]);

	return (

		<ChatPanelProvider>
			<div className="h-screen flex flex-col bg-gray-100 dark:bg-[#0d0d0d]">
				{/* Menubar - in flow, displaces content below */}
				<Menubar />

				{/* Main content area - fills remaining height */}
				<main className="flex-1 flex min-h-0">
					{/* Content area with Dock - shrinks when Claude Panel expands */}
					<div className="flex-1 relative min-w-0 flex flex-col">
						{children}
						{/* Dock - absolute within content area so it shrinks with panel */}
						<Dock />
					</div>

					{/* Claude Panel - in flow, pushes content left */}
					<ClaudePanelWithToggle />
				</main>


				{/* Help Overlay */}
				<HelpOverlay isOpen={showHelp} onClose={() => setShowHelp(false)} />

				{/* Command Palette */}
				<CommandPalette
					isOpen={showCommandPalette}
					onClose={() => setShowCommandPalette(false)}
					commands={commands}
				/>
			</div>
		</ChatPanelProvider>

	);
}

export default AppShell;
