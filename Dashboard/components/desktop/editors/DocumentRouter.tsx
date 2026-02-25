'use client';

import dynamic from 'next/dynamic';
import { FileQuestion, Loader2 } from 'lucide-react';
import { getDocumentType } from './index';

// Lazy-load all editors — only the one matching the file type gets downloaded.
// This keeps Monaco (~2MB), xlsx (~500KB), and other heavy deps out of the initial bundle.
const loading = () => (
	<div className="flex items-center justify-center h-full">
		<Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
	</div>
);

const MarkdownEditor = dynamic(() => import('./MarkdownEditor').then(m => ({ default: m.MarkdownEditor })), { ssr: false, loading });
const CodeEditor = dynamic(() => import('./CodeEditor').then(m => ({ default: m.CodeEditor })), { ssr: false, loading });
const CsvViewer = dynamic(() => import('./CsvViewer').then(m => ({ default: m.CsvViewer })), { ssr: false, loading });
const DocxViewer = dynamic(() => import('./DocxViewer').then(m => ({ default: m.DocxViewer })), { ssr: false, loading });
const HeicViewer = dynamic(() => import('./HeicViewer').then(m => ({ default: m.HeicViewer })), { ssr: false, loading });
const ImageViewer = dynamic(() => import('./ImageViewer').then(m => ({ default: m.ImageViewer })), { ssr: false, loading });
const JsonEditor = dynamic(() => import('./JsonEditor').then(m => ({ default: m.JsonEditor })), { ssr: false, loading });
const JupyterViewer = dynamic(() => import('./JupyterViewer').then(m => ({ default: m.JupyterViewer })), { ssr: false, loading });
const OfficeViewer = dynamic(() => import('./OfficeViewer').then(m => ({ default: m.OfficeViewer })), { ssr: false, loading });
const PdfViewer = dynamic(() => import('./PdfViewer').then(m => ({ default: m.PdfViewer })), { ssr: false, loading });
const PlainTextEditor = dynamic(() => import('./PlainTextEditor').then(m => ({ default: m.PlainTextEditor })), { ssr: false, loading });
const PptxViewer = dynamic(() => import('./PptxViewer').then(m => ({ default: m.PptxViewer })), { ssr: false, loading });
const VideoViewer = dynamic(() => import('./VideoViewer').then(m => ({ default: m.VideoViewer })), { ssr: false, loading });
const XlsxViewer = dynamic(() => import('./XlsxViewer').then(m => ({ default: m.XlsxViewer })), { ssr: false, loading });
const ZipViewer = dynamic(() => import('./ZipViewer').then(m => ({ default: m.ZipViewer })), { ssr: false, loading });
const AudioViewer = dynamic(() => import('./AudioViewer').then(m => ({ default: m.AudioViewer })), { ssr: false, loading });

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
