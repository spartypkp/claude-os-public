'use client';

import { FileViewer } from '@/components/shared/FileViewer';
import { useParams } from 'next/navigation';

export default function DesktopFilePage() {
	const params = useParams();
	const pathSegments = params.path as string[];
	// Desktop route now serves files from Desktop/ (post-restructure)
	const filePath = `Desktop/${pathSegments.join('/')}`;

	return <FileViewer path={filePath} />;
}
