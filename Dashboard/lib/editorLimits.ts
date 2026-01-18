export const MAX_EDITOR_CHARS = 500_000;

export function isLargeContent(content: string): boolean {
	return content.length > MAX_EDITOR_CHARS;
}
