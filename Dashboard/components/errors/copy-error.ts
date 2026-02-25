/**
 * Copy-to-Claude Error Utility
 *
 * Formats error details into a structured report
 * that can be pasted directly into a Claude session.
 */

export function formatErrorReport(error: Error, componentName?: string): string {
	const lines = [
		`[Error${componentName ? ` in ${componentName}` : ''}]`,
		`Message: ${error.message}`,
		`Route: ${typeof window !== 'undefined' ? window.location.pathname : 'unknown'}`,
		`Time: ${new Date().toISOString()}`,
	];

	if (error.stack) {
		const stackLines = error.stack.split('\n').slice(0, 10).join('\n');
		lines.push(`Stack:\n${stackLines}`);
	}

	return lines.join('\n');
}

export async function copyErrorToClipboard(error: Error, componentName?: string): Promise<boolean> {
	const report = formatErrorReport(error, componentName);

	try {
		if ('clipboard' in navigator) {
			await navigator.clipboard.writeText(report);
			return true;
		}
		// Fallback for older browsers
		const el = document.createElement('textarea');
		el.value = report;
		el.style.position = 'fixed';
		el.style.opacity = '0';
		document.body.appendChild(el);
		el.select();
		document.execCommand('copy');
		document.body.removeChild(el);
		return true;
	} catch {
		console.error('[copy-error] Failed to copy to clipboard');
		return false;
	}
}
