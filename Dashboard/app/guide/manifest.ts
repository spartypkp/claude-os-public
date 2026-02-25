import { registerApp, type AppManifest } from '@/lib/appRegistry';
import { Compass } from 'lucide-react';

export const manifest: AppManifest = {
	id: 'guide',
	name: 'Guide',
	description: 'Visual guide to Claude OS',
	icon: Compass,
	gradient: 'from-orange-500 to-amber-600',

	routes: [
		{
			id: 'guide',
			label: 'Guide',
			path: '/guide',
			icon: Compass,
			shortcut: '1',
		},
	],
};

registerApp(manifest);
export default manifest;
