import { CoreAppType } from '@/store/windowStore';

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
	if (focusedAppType && CORE_APP_NAMES[focusedAppType]) {
		return CORE_APP_NAMES[focusedAppType];
	}
	if (pathname.startsWith('/system')) return 'System';
	return 'Desktop';
}
