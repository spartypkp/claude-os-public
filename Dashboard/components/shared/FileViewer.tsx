'use client';

import { DocumentRouter } from '@/components/desktop/editors/DocumentRouter';
import { useRecentFiles } from '@/hooks/useRecentFiles';
import { getFileIconSpec } from '@/lib/fileTypes';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface FileViewerProps {
	path: string;
}

function getFileIcon(name: string) {
	const { icon: Icon, colorClass } = getFileIconSpec(name);
	return <Icon className={`w-5 h-5 ${colorClass}`} />;
}

export function FileViewer({ path }: FileViewerProps) {
	const router = useRouter();
	const { addRecentFile } = useRecentFiles();

	const fileName = path.split('/').pop() || path;

	useEffect(() => {
		addRecentFile(path);
	}, [path, addRecentFile]);

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			<div className="px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-base)] flex items-center gap-3">
				<button
					onClick={() => router.back()}
					className="btn btn-ghost btn-icon-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
					title="Go back"
				>
					<ArrowLeft className="w-4 h-4" />
				</button>

				{getFileIcon(fileName)}

				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium text-[var(--text-primary)] truncate">
						{fileName}
					</div>
					<div className="text-xs text-[var(--text-muted)] font-mono truncate">
						{path}
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-hidden">
				<DocumentRouter filePath={path} />
			</div>
		</div>
	);
}

export default FileViewer;
