/**
 * Ember App Manifest
 *
 * Claude's companion that grows with the lineage.
 */

import { registerApp, type AppManifest } from '@/lib/appRegistry';
import { Flame } from 'lucide-react';

export const manifest: AppManifest = {
	id: 'ember',
	name: 'Ember',
	description: "Claude's companion",
	icon: Flame,
	gradient: 'from-amber-400 to-orange-600',

	routes: [
		{
			id: 'overview',
			label: 'Ember',
			path: '/ember',
			icon: Flame,
			shortcut: '1',
		},
	],
};

registerApp(manifest);
export default manifest;
