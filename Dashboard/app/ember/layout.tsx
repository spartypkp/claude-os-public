'use client';

import { AppLayout } from '@/components/core/AppLayout';
import { manifest } from './manifest';

export default function EmberLayout({ children }: { children: React.ReactNode }) {
	return <AppLayout manifest={manifest}>{children}</AppLayout>;
}
