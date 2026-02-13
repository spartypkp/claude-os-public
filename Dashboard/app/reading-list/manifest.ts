/**
 * Reading List App Manifest
 *
 * === CUSTOM APP PATTERN ===
 * Every custom app needs a manifest.ts that registers it with the app registry.
 * The manifest defines the app's identity (name, icon, gradient) and its routes.
 * The Dock and Sidebar discover apps from this registry automatically.
 */

import { registerApp, type AppManifest } from '@/lib/appRegistry';
import { BookOpen } from 'lucide-react';

export const manifest: AppManifest = {
	id: 'reading-list',
	name: 'Reading List',
	description: 'Track books, articles, and papers',
	icon: BookOpen,
	gradient: 'from-emerald-500 to-teal-600',

	routes: [
		{
			id: 'overview',
			label: 'Reading List',
			path: '/reading-list',
			icon: BookOpen,
			shortcut: '1',
		},
	],
};

registerApp(manifest);
export default manifest;
