'use client';

import { useMemo, useState } from 'react';
import { Calendar, CheckSquare, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useWindowStore } from '@/store/windowStore';

import { CalendarWidgetContent } from '../widgets/CalendarWidgetContent';
import { PrioritiesWidgetContent } from '../widgets/PrioritiesWidgetContent';

import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';
import { AboutDialog } from './AboutDialog';
import { WidgetDropdown } from './WidgetDropdown';
import { CalendarInlineLabel } from './CalendarInlineLabel';
import { PriorityBadge } from './PriorityBadge';
import { ClaudeStatus } from './ClaudeStatus';
import { ConnectionStatus } from './ConnectionStatus';
import { UsageBattery } from './UsageBattery';
import { Clock } from './Clock';
import { getAppName } from './utils';

export function Menubar() {
	const pathname = usePathname();
	const [showAbout, setShowAbout] = useState(false);
	const [calendarDropdownOpen, setCalendarDropdownOpen] = useState(false);
	const [prioritiesDropdownOpen, setPrioritiesDropdownOpen] = useState(false);

	const darkMode = useWindowStore((state) => state.darkMode);
	const toggleDarkMode = useWindowStore((state) => state.toggleDarkMode);
	const windows = useWindowStore((state) => state.windows);
	const windowStack = useWindowStore((state) => state.windowStack);

	const focusedAppType = useMemo(() => {
		for (const id of windowStack) {
			const win = windows.find((w) => w.id === id && !w.minimized);
			if (win) return win.appType || null;
		}
		return null;
	}, [windows, windowStack]);

	const appName = getAppName(pathname, focusedAppType);

	return (
		<>
			<div
				data-testid="menubar"
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
				{/* Left Side: Claude Logo + App Name + Status */}
				<div className="flex items-center gap-0.5 min-w-0">
					<button
						data-testid="about-button"
						onClick={() => setShowAbout(true)}
						aria-label="About Claude OS"
						className="
							px-2 py-0.5
							hover:bg-[var(--surface-muted)]
							rounded-[4px]
							transition-colors duration-75
							focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
							shrink-0
						"
						title="About Claude OS"
					>
						<ClaudeLogo className="w-4 h-4 text-[#da7756]" />
					</button>

					<span className="px-2 text-[13px] font-semibold text-[var(--text-primary)] shrink-0">
						{appName}
					</span>

					<ClaudeStatus />
				</div>

				{/* Center: Widgets */}
				<div className="flex items-center gap-1">
					<WidgetDropdown
						icon={<Calendar className="w-4 h-4 text-red-500" />}
						label={<CalendarInlineLabel />}
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

					<WidgetDropdown
						icon={<CheckSquare className="w-4 h-4 text-amber-500" />}
						label={<PriorityBadge />}
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
					<button
						data-testid="dark-mode-toggle"
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

					<ConnectionStatus />
					<UsageBattery />
					<Clock />
				</div>
			</div>

			<AboutDialog isOpen={showAbout} onClose={() => setShowAbout(false)} />
		</>
	);
}

export default Menubar;
