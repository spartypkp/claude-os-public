/**
 * === CUSTOM APP PATTERN ===
 * layout.tsx wraps your app pages in AppLayout, which provides:
 * - ApplicationShell with window chrome (traffic lights, title bar)
 * - Sub-navigation from manifest routes
 * - Keyboard shortcuts (number keys for routes, Escape to go back)
 *
 * This is the same for every custom app — just change the manifest import.
 */

'use client';

import { AppLayout } from '@/components/core/AppLayout';
import { manifest } from './manifest';

export default function ReadingListLayout({ children }: { children: React.ReactNode }) {
	return <AppLayout manifest={manifest}>{children}</AppLayout>;
}
