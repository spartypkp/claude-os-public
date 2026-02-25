import { ExternalLink } from 'lucide-react';

/**
 * Custom link component for ReactMarkdown — styled and opens in new tab.
 * Shared between TranscriptViewer and SystemMessages.
 */
export function MarkdownLink({ href, children }: { href?: string; children?: React.ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 underline underline-offset-2 decoration-[var(--color-primary)]/40 hover:decoration-[var(--color-primary)] transition-colors inline-flex items-center gap-0.5"
		>
			{children}
			<ExternalLink className="w-3 h-3 opacity-60" />
		</a>
	);
}
