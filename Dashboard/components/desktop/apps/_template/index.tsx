'use client';

/**
 * Template for New Core Desktop App
 *
 * To create a new core app:
 * 1. Copy this folder to desktop/apps/[appname]/
 * 2. Rename this file to [AppName]WindowContent.tsx
 * 3. Update the component name and content
 * 4. Add CoreAppType in store/windowStore.ts
 * 5. Import and register in desktop/ClaudeOS.tsx
 * 6. Add icon to desktop/Dock.tsx
 */

interface TemplateWindowContentProps {
	windowId: string;
}

export function TemplateWindowContent({ windowId }: TemplateWindowContentProps) {
	return (
		<div className="flex flex-col h-full bg-[#1a1a1e] text-white">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
				<h2 className="text-sm font-medium">App Name</h2>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-4">
				<p className="text-sm text-gray-400">
					Replace this with your app content.
				</p>
			</div>
		</div>
	);
}

