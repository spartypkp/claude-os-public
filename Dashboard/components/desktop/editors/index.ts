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

// Component re-exports intentionally removed.
// All viewer/editor components are loaded dynamically via DocumentRouter.
// Importing them from this barrel defeats tree-shaking and pulls heavy deps
// (xlsx ~222KB, Monaco ~2MB) into the initial bundle.
export { DocumentRouter } from './DocumentRouter';
