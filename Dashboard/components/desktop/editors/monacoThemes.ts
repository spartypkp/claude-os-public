import type { BeforeMount } from '@monaco-editor/react';

/**
 * Shared Monaco theme definitions for all editors.
 * Defines claude-light and claude-dark themes.
 */
export const defineClaudeThemes: BeforeMount = (monaco) => {
	monaco.editor.defineTheme('claude-light', {
		base: 'vs',
		inherit: true,
		colors: {
			'editor.background': '#FFFFFF',
			'editor.foreground': '#1A1A18',
			'editorLineNumber.foreground': '#C3B9AB',
			'editorLineNumber.activeForeground': '#8E8173',
			'editor.selectionBackground': '#EBC7B8',
			'editor.inactiveSelectionBackground': '#F1DED6',
			'editor.lineHighlightBackground': '#F7F1EE',
			'editorCursor.foreground': 'var(--color-primary-hover)',
			'editorIndentGuide.background': '#E6DFD7',
			'editorIndentGuide.activeBackground': '#D8CFC5',
			'editorBracketMatch.background': '#EBD9D1',
			'editorBracketMatch.border': 'var(--color-primary-hover)',
			'editorGutter.background': '#F4F3EE',
		},
		rules: [
			{ token: 'comment', foreground: '9C8E84', fontStyle: 'italic' },
			{ token: 'keyword', foreground: 'C15F3C' },
			{ token: 'string', foreground: '2D6A4F' },
			{ token: 'number', foreground: '4C78A8' },
			{ token: 'type', foreground: '7A5EA8' },
			{ token: 'identifier', foreground: '1A1A18' },
		],
	});

	monaco.editor.defineTheme('claude-dark', {
		base: 'vs-dark',
		inherit: true,
		colors: {
			'editor.background': '#151517',
			'editor.foreground': '#FAFAFA',
			'editorLineNumber.foreground': '#5C5C66',
			'editorLineNumber.activeForeground': '#B7B7C0',
			'editor.selectionBackground': '#3A2B25',
			'editor.inactiveSelectionBackground': '#2A2624',
			'editor.lineHighlightBackground': '#1D1D22',
			'editorCursor.foreground': 'var(--color-claude)',
			'editorIndentGuide.background': '#2A2A30',
			'editorIndentGuide.activeBackground': '#3A3A44',
			'editorBracketMatch.background': '#3A2B25',
			'editorBracketMatch.border': 'var(--color-claude)',
			'editorGutter.background': '#09090B',
		},
		rules: [
			{ token: 'comment', foreground: '8C8C97', fontStyle: 'italic' },
			{ token: 'keyword', foreground: 'F08E6B' },
			{ token: 'string', foreground: '63D19A' },
			{ token: 'number', foreground: '86B3F2' },
			{ token: 'type', foreground: 'C29CEB' },
			{ token: 'identifier', foreground: 'FAFAFA' },
		],
	});
};
