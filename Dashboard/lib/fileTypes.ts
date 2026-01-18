import type { ComponentType } from 'react';
import { Archive, BookOpen, File, FileJson, FileSpreadsheet, FileText, Image, Presentation } from 'lucide-react';
import { createLanguageFileIcon } from '@/components/shared/icons/LanguageFileIcon';

export type DocumentType =
	| 'markdown'
	| 'csv'
	| 'json'
	| 'code'
	| 'image'
	| 'heic'
	| 'pdf'
	| 'text'
	| 'video'
	| 'audio'
	| 'xlsx'
	| 'docx'
	| 'pptx'
	| 'zip'
	| 'jupyter'
	| 'office'
	| 'unknown';

export interface DocumentTypeConfig {
	type: DocumentType;
	extensions: string[];
	name: string;
	editable: boolean;
	icon: string; // Lucide icon name
}

export const DOCUMENT_TYPES: DocumentTypeConfig[] = [
	{
		type: 'markdown',
		extensions: ['.md', '.mdx', '.markdown'],
		name: 'Markdown',
		editable: true,
		icon: 'FileText',
	},
	{
		type: 'code',
		extensions: [
			// JavaScript/TypeScript
			'.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
			// Python
			'.py', '.pyw', '.pyi',
			// Web
			'.html', '.htm', '.css', '.scss', '.sass', '.less',
			// Data
			'.yaml', '.yml', '.toml', '.xml',
			// Shell
			'.sh', '.bash', '.zsh', '.fish',
			// Config
			'.env', '.gitignore', '.eslintrc', '.prettierrc',
			// Other
			'.sql', '.graphql', '.gql',
			'.rs', '.go', '.rb', '.php', '.java', '.kt', '.swift',
			'.c', '.cpp', '.h', '.hpp', '.cs',
			'.lua', '.r', '.R', '.jl',
		],
		name: 'Code',
		editable: true,
		icon: 'FileCode',
	},
	{
		type: 'csv',
		extensions: ['.csv', '.tsv'],
		name: 'CSV',
		editable: true,
		icon: 'FileText',
	},
	{
		type: 'json',
		extensions: ['.json'],
		name: 'JSON',
		editable: true,
		icon: 'FileJson',
	},
	{
		type: 'image',
		extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'],
		name: 'Image',
		editable: false,
		icon: 'Image',
	},
	{
		type: 'pdf',
		extensions: ['.pdf'],
		name: 'PDF',
		editable: false,
		icon: 'FileText',
	},
	{
		type: 'text',
		extensions: ['.txt', '.log'],
		name: 'Plain Text',
		editable: true,
		icon: 'FileText',
	},
	{
		type: 'video',
		extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
		name: 'Video',
		editable: false,
		icon: 'Video',
	},
	{
		type: 'audio',
		extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
		name: 'Audio',
		editable: false,
		icon: 'Music',
	},
	{
		type: 'xlsx',
		extensions: ['.xlsx', '.xls'],
		name: 'Excel Spreadsheet',
		editable: false,
		icon: 'FileSpreadsheet',
	},
	{
		type: 'docx',
		extensions: ['.doc', '.docx'],
		name: 'Word Document',
		editable: false,
		icon: 'FileText',
	},
	{
		type: 'pptx',
		extensions: ['.ppt', '.pptx'],
		name: 'PowerPoint',
		editable: false,
		icon: 'Presentation',
	},
	{
		type: 'heic',
		extensions: ['.heic', '.heif'],
		name: 'HEIC Image',
		editable: false,
		icon: 'Image',
	},
	{
		type: 'zip',
		extensions: ['.zip'],
		name: 'ZIP Archive',
		editable: false,
		icon: 'Archive',
	},
	{
		type: 'jupyter',
		extensions: ['.ipynb'],
		name: 'Jupyter Notebook',
		editable: false,
		icon: 'BookOpen',
	},
	{
		type: 'office',
		extensions: [],
		name: 'Office Document',
		editable: false,
		icon: 'FileText',
	},
];

function getExtension(filePath: string): string {
	const name = filePath.split('/').pop() || filePath;
	if (!name.includes('.')) return '';
	return '.' + (name.split('.').pop()?.toLowerCase() || '');
}

export function getDocumentType(filePath: string): DocumentType {
	const ext = getExtension(filePath);
	if (!ext) return 'text';

	for (const config of DOCUMENT_TYPES) {
		if (config.extensions.includes(ext)) {
			return config.type;
		}
	}

	return 'unknown';
}

export function getDocumentConfig(filePath: string): DocumentTypeConfig | null {
	const type = getDocumentType(filePath);
	return DOCUMENT_TYPES.find((config) => config.type === type) || null;
}

export function isEditable(filePath: string): boolean {
	const config = getDocumentConfig(filePath);
	return config?.editable ?? false;
}

export function getLanguage(filePath: string): string {
	const ext = (filePath.split('.').pop() || '').toLowerCase();

	const languageMap: Record<string, string> = {
		// JavaScript/TypeScript
		js: 'javascript',
		jsx: 'javascript',
		mjs: 'javascript',
		cjs: 'javascript',
		ts: 'typescript',
		tsx: 'typescript',
		// Python
		py: 'python',
		pyw: 'python',
		pyi: 'python',
		// Web
		html: 'html',
		htm: 'html',
		css: 'css',
		scss: 'scss',
		sass: 'sass',
		less: 'less',
		// Data
		json: 'json',
		yaml: 'yaml',
		yml: 'yaml',
		toml: 'toml',
		xml: 'xml',
		// Shell
		sh: 'bash',
		bash: 'bash',
		zsh: 'bash',
		fish: 'bash',
		// SQL
		sql: 'sql',
		// GraphQL
		graphql: 'graphql',
		gql: 'graphql',
		// Other languages
		rs: 'rust',
		go: 'go',
		rb: 'ruby',
		php: 'php',
		java: 'java',
		kt: 'kotlin',
		swift: 'swift',
		c: 'c',
		cpp: 'cpp',
		h: 'c',
		hpp: 'cpp',
		cs: 'csharp',
		lua: 'lua',
		r: 'r',
		jl: 'julia',
		// Markdown
		md: 'markdown',
		mdx: 'markdown',
		markdown: 'markdown',
		// Text
		txt: 'plaintext',
		log: 'plaintext',
		csv: 'plaintext',
		tsv: 'plaintext',
	};

	return languageMap[ext] || 'plaintext';
}

const EXTENSION_ICON_MAP: Record<
	string,
	{ icon?: ComponentType<{ className?: string }>; colorClass: string }
> = {
	md: { icon: FileText, colorClass: 'text-gray-500' },
	mdx: { icon: FileText, colorClass: 'text-gray-500' },
	markdown: { icon: FileText, colorClass: 'text-gray-500' },
	txt: { icon: FileText, colorClass: 'text-slate-400' },
	log: { icon: FileText, colorClass: 'text-slate-400' },
	pdf: { icon: FileText, colorClass: 'text-red-500' },
	csv: { icon: FileText, colorClass: 'text-emerald-500' },
	tsv: { icon: FileText, colorClass: 'text-emerald-500' },
	xlsx: { icon: FileSpreadsheet, colorClass: 'text-emerald-600' },
	xls: { icon: FileSpreadsheet, colorClass: 'text-emerald-600' },
	json: { icon: FileJson, colorClass: 'text-yellow-500' },
	yaml: { icon: FileJson, colorClass: 'text-amber-500' },
	yml: { icon: FileJson, colorClass: 'text-amber-500' },
	toml: { icon: FileJson, colorClass: 'text-amber-500' },
	xml: { icon: FileJson, colorClass: 'text-amber-500' },
	ipynb: { icon: BookOpen, colorClass: 'text-orange-500' },
	doc: { icon: FileText, colorClass: 'text-blue-600' },
	docx: { icon: FileText, colorClass: 'text-blue-600' },
	ppt: { icon: Presentation, colorClass: 'text-orange-600' },
	pptx: { icon: Presentation, colorClass: 'text-orange-600' },
	heic: { icon: Image, colorClass: 'text-pink-400' },
	heif: { icon: Image, colorClass: 'text-pink-400' },
	zip: { icon: Archive, colorClass: 'text-amber-500' },
	js: { icon: createLanguageFileIcon('js'), colorClass: 'text-amber-400' },
	jsx: { icon: createLanguageFileIcon('jsx'), colorClass: 'text-amber-400' },
	ts: { icon: createLanguageFileIcon('ts'), colorClass: 'text-sky-500' },
	tsx: { icon: createLanguageFileIcon('tsx'), colorClass: 'text-sky-500' },
	py: { icon: createLanguageFileIcon('py'), colorClass: 'text-blue-500' },
	rb: { icon: createLanguageFileIcon('rb'), colorClass: 'text-red-500' },
	php: { icon: createLanguageFileIcon('php'), colorClass: 'text-indigo-500' },
	java: { icon: createLanguageFileIcon('java'), colorClass: 'text-orange-500' },
	kt: { icon: createLanguageFileIcon('kt'), colorClass: 'text-purple-500' },
	swift: { icon: createLanguageFileIcon('swift'), colorClass: 'text-orange-400' },
	go: { icon: createLanguageFileIcon('go'), colorClass: 'text-cyan-500' },
	rs: { icon: createLanguageFileIcon('rs'), colorClass: 'text-orange-600' },
	c: { icon: createLanguageFileIcon('c'), colorClass: 'text-slate-500' },
	cpp: { icon: createLanguageFileIcon('cpp'), colorClass: 'text-blue-600' },
	h: { icon: createLanguageFileIcon('h'), colorClass: 'text-slate-500' },
	hpp: { icon: createLanguageFileIcon('hpp'), colorClass: 'text-blue-600' },
	cs: { icon: createLanguageFileIcon('cs'), colorClass: 'text-purple-600' },
	sh: { icon: createLanguageFileIcon('sh'), colorClass: 'text-green-500' },
	bash: { icon: createLanguageFileIcon('sh'), colorClass: 'text-green-500' },
	zsh: { icon: createLanguageFileIcon('sh'), colorClass: 'text-green-500' },
	fish: { icon: createLanguageFileIcon('sh'), colorClass: 'text-green-500' },
	sql: { icon: createLanguageFileIcon('sql'), colorClass: 'text-fuchsia-500' },
	html: { icon: createLanguageFileIcon('html'), colorClass: 'text-orange-400' },
	css: { icon: createLanguageFileIcon('css'), colorClass: 'text-blue-400' },
	scss: { icon: createLanguageFileIcon('scss'), colorClass: 'text-pink-400' },
	sass: { icon: createLanguageFileIcon('sass'), colorClass: 'text-pink-400' },
	less: { icon: createLanguageFileIcon('less'), colorClass: 'text-indigo-400' },
	graphql: { icon: createLanguageFileIcon('gql'), colorClass: 'text-pink-500' },
	gql: { icon: createLanguageFileIcon('gql'), colorClass: 'text-pink-500' },
	png: { icon: Image, colorClass: 'text-pink-400' },
	jpg: { icon: Image, colorClass: 'text-pink-400' },
	jpeg: { icon: Image, colorClass: 'text-pink-400' },
	gif: { icon: Image, colorClass: 'text-pink-400' },
	webp: { icon: Image, colorClass: 'text-pink-400' },
	svg: { icon: Image, colorClass: 'text-pink-400' },
	ico: { icon: Image, colorClass: 'text-pink-400' },
	bmp: { icon: Image, colorClass: 'text-pink-400' },
	env: { icon: FileText, colorClass: 'text-slate-500' },
};

export function getFileIconSpec(
	fileName: string,
	options?: { isSystemFile?: boolean }
): { icon: ComponentType<{ className?: string }>; colorClass: string } {
	const ext = (fileName.split('.').pop() || '').toLowerCase();
	const isSystemFile = options?.isSystemFile ?? false;
	const mapped = EXTENSION_ICON_MAP[ext];

	if (mapped) {
		return {
			icon: mapped.icon || File,
			colorClass: isSystemFile ? 'text-[#DA7756]' : mapped.colorClass,
		};
	}

	return { icon: File, colorClass: isSystemFile ? 'text-[#DA7756]' : 'text-gray-400' };
}
