import type { ReactNode } from 'react';

export type CodeSnippet = {
	language: string;
	code: string;
	label?: string;
};

export type ChapterData = {
	id: string;
	chapterNumber: number;
	part: number;
	partLabel: string;
	headline: string;
	subheadline?: string;
	visual: ReactNode;
	copy: string[];
	underTheHood?: {
		headline: string;
		copy: string[];
		codeSnippets?: CodeSnippet[];
	};
};

export type PartData = {
	number: number;
	label: string;
	title: string;
	teaser: string;
};
