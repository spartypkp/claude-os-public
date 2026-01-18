'use client';

import { FileQuestion } from 'lucide-react';
import { AudioViewer } from './AudioViewer';
import { CodeEditor } from './CodeEditor';
import { CsvViewer } from './CsvViewer';
import { DocxViewer } from './DocxViewer';
import { HeicViewer } from './HeicViewer';
import { ImageViewer } from './ImageViewer';
import { JsonEditor } from './JsonEditor';
import { JupyterViewer } from './JupyterViewer';
import { MarkdownEditor } from './MarkdownEditor';
import { OfficeViewer } from './OfficeViewer';
import { PdfViewer } from './PdfViewer';
import { PptxViewer } from './PptxViewer';
import { XlsxViewer } from './XlsxViewer';
import { PlainTextEditor } from './PlainTextEditor';
import { VideoViewer } from './VideoViewer';
import { ZipViewer } from './ZipViewer';
import { getDocumentType } from './index';

interface DocumentRouterProps {
	filePath: string;
}

/**
 * Routes files to the appropriate editor based on their type.
 * This is the main entry point for opening files in windows.
 */
export function DocumentRouter({ filePath }: DocumentRouterProps) {
	const docType = getDocumentType(filePath);
	const fileName = filePath.split('/').pop() || filePath;

	switch (docType) {
		case 'markdown':
			return <MarkdownEditor filePath={filePath} />;

		case 'csv':
			return <CsvViewer filePath={filePath} />;

		case 'code':
			return <CodeEditor filePath={filePath} />;

		case 'json':
			return <JsonEditor filePath={filePath} />;

		case 'image':
			return <ImageViewer filePath={filePath} />;

		case 'text':
			return <PlainTextEditor filePath={filePath} />;

		case 'pdf':
			return <PdfViewer filePath={filePath} />;

		case 'video':
			return <VideoViewer filePath={filePath} />;

		case 'audio':
			return <AudioViewer filePath={filePath} />;

		case 'xlsx':
			return <XlsxViewer filePath={filePath} />;

		case 'docx':
			return <DocxViewer filePath={filePath} />;

		case 'pptx':
			return <PptxViewer filePath={filePath} />;

		case 'heic':
			return <HeicViewer filePath={filePath} />;

		case 'zip':
			return <ZipViewer filePath={filePath} />;

		case 'jupyter':
			return <JupyterViewer filePath={filePath} />;

		case 'office':
			return <OfficeViewer filePath={filePath} />;

		case 'unknown':
		default:
			return (
				<div className="h-full">
					<div className="flex items-center gap-2 px-3 py-2 text-xs border-b border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-tertiary)]">
						<FileQuestion className="w-3.5 h-3.5" />
						<span>Unknown type · Opening as plain text</span>
						<span className="font-mono text-[10px] text-[var(--text-muted)]">{fileName}</span>
					</div>
					<PlainTextEditor filePath={filePath} />
				</div>
			);
	}
}

export default DocumentRouter;
