import { CoreAppType } from '@/store/windowStore';
import { getApps } from '@/lib/appRegistry';

export const CORE_APP_NAMES: Record<CoreAppType, string> = {
	finder: 'Finder',
	calendar: 'Calendar',
	settings: 'Settings',
	contacts: 'Contacts',
	email: 'Mail',
	messages: 'Messages',
	analytics: 'Observatory',
	projects: 'Projects',
};

export function getAppName(pathname: string, focusedAppType?: CoreAppType | null): string {
	// Core Apps (windows on Desktop)
	if (focusedAppType && CORE_APP_NAMES[focusedAppType]) {
		return CORE_APP_NAMES[focusedAppType];
	}
	// Custom Apps (fullscreen routes) — resolve from app registry
	for (const app of getApps()) {
		if (pathname.startsWith(`/${app.id}`)) {
			return app.name;
		}
	}
	// Built-in routes
	if (pathname.startsWith('/system')) return 'System';
	return 'Desktop';
}
