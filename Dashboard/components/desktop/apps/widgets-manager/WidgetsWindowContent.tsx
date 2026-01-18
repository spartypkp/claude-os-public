'use client';

import { useMenubarWidgets } from '@/store/windowStore';
import { useWidgetActions } from '@/store/windowStore';
import {
	Calendar,
	Check,
	Target,
	Users,
	X,
} from 'lucide-react';

// ==========================================
// WIDGET DEFINITIONS
// ==========================================

interface WidgetDefinition {
	type: 'priorities' | 'calendar' | 'sessions';
	name: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	gradient: string;
}

const AVAILABLE_WIDGETS: WidgetDefinition[] = [
	{
		type: 'priorities',
		name: 'Priorities',
		description: 'Your most important tasks',
		icon: Target,
		gradient: 'from-red-500 to-orange-500',
	},
	{
		type: 'calendar',
		name: 'Today',
		description: "Today's schedule",
		icon: Calendar,
		gradient: 'from-blue-500 to-cyan-500',
	},
	{
		type: 'sessions',
		name: 'Claude Team',
		description: 'Active Claude sessions',
		icon: Users,
		gradient: 'from-amber-500 to-yellow-500',
	},
];

// ==========================================
// COMPONENT
// ==========================================

/**
 * Menubar widget configuration.
 * Configure which widgets appear in the menubar.
 */
export function WidgetsWindowContent() {
	const menubarWidgets = useMenubarWidgets();
	const { toggleMenubarWidget } = useWidgetActions();

	const handleToggle = (type: 'priorities' | 'calendar' | 'sessions') => {
		toggleMenubarWidget(type);
	};

	return (
		<div className="flex flex-col h-full bg-gray-50 dark:bg-[#1a1a1a]">
			{/* Header */}
			<div className="px-5 py-4 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-white/10">
				<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
					Menubar Widgets
				</h2>
				<p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
					Configure which widgets appear in your menubar
				</p>
			</div>

			{/* Widget Grid */}
			<div className="flex-1 overflow-auto p-4">
				<div className="grid gap-3">
					{AVAILABLE_WIDGETS.map((widget) => {
						const Icon = widget.icon;
						const isEnabled = menubarWidgets.has(widget.type);

						return (
							<button
								key={widget.type}
								onClick={() => handleToggle(widget.type)}
								className={`
									group relative flex items-center gap-4 p-4 rounded-xl
									border-2 transition-all duration-200 text-left
									${isEnabled
										? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
										: 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#252525] hover:border-gray-300 dark:hover:border-white/20'
									}
								`}
							>
								{/* Icon */}
								<div className={`
									w-12 h-12 rounded-xl flex items-center justify-center
									bg-gradient-to-br ${widget.gradient}
									shadow-lg shadow-black/10
								`}>
									<Icon className="w-6 h-6 text-white" />
								</div>

								{/* Info */}
								<div className="flex-1 min-w-0">
									<div className="font-semibold text-gray-900 dark:text-white">
										{widget.name}
									</div>
									<div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
										{widget.description}
									</div>
								</div>

								{/* Toggle */}
								<div className={`
									w-8 h-8 rounded-full flex items-center justify-center
									transition-all duration-200
									${isEnabled
										? 'bg-blue-500 text-white'
										: 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-white/20'
									}
								`}>
									{isEnabled ? (
										<Check className="w-4 h-4" />
									) : (
										<X className="w-4 h-4" />
									)}
								</div>

								{/* Status badge */}
								{isEnabled && (
									<div className="absolute top-2 right-2 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
										Visible
									</div>
								)}
							</button>
						);
					})}
				</div>

				{/* Help text */}
				<div className="mt-6 p-4 rounded-xl bg-white dark:bg-[#252525] border border-gray-200 dark:border-white/10">
					<p className="text-sm text-gray-600 dark:text-gray-400">
						<strong className="text-gray-900 dark:text-white">Tip:</strong>{' '}
						Widgets appear as dropdown menus in the menubar at the top of your screen.
						Click a widget icon in the menubar to view its contents.
					</p>
				</div>
			</div>
		</div>
	);
}

export default WidgetsWindowContent;
