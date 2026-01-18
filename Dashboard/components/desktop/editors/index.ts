export {
	DOCUMENT_TYPES,
	getDocumentType,
	getDocumentConfig,
	getLanguage,
	getFileIconSpec,
	isEditable,
	type DocumentType,
	type DocumentTypeConfig,
} from '@/lib/fileTypes';

// Re-export components
export { MarkdownEditor } from './MarkdownEditor';
export { CodeEditor } from './CodeEditor';
export { CsvViewer } from './CsvViewer';
export { JsonEditor } from './JsonEditor';
export { PdfViewer } from './PdfViewer';
export { ImageViewer } from './ImageViewer';
export { VideoViewer } from './VideoViewer';
export { AudioViewer } from './AudioViewer';
export { OfficeViewer } from './OfficeViewer';
export { XlsxViewer } from './XlsxViewer';
export { DocxViewer } from './DocxViewer';
export { PptxViewer } from './PptxViewer';
export { HeicViewer } from './HeicViewer';
export { ZipViewer } from './ZipViewer';
export { JupyterViewer } from './JupyterViewer';
export { PlainTextEditor } from './PlainTextEditor';
export { DocumentRouter } from './DocumentRouter';
