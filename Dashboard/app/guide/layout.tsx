'use client';

import { AppLayout } from '@/components/core/AppLayout';
import { manifest } from './manifest';

export default function GuideLayout({ children }: { children: React.ReactNode }) {
	return <AppLayout manifest={manifest} fullBleed>{children}</AppLayout>;
}
