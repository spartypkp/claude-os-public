'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChapterSection } from './components/ChapterSection';
import { PartDivider } from './components/PartDivider';
import { ScrollProgress } from './components/ScrollProgress';
import { ChapterMenu } from './components/ChapterMenu';
import { chapters, parts } from './content/chapters';

export default function GuidePage() {
	const chapterRefs = useRef<Map<string, HTMLElement>>(new Map());
	const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
	const [currentPartLabel, setCurrentPartLabel] = useState<string | null>(null);

	// Track which chapter is in view via IntersectionObserver
	useEffect(() => {
		const observers: IntersectionObserver[] = [];

		chapterRefs.current.forEach((el, id) => {
			const observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting) {
							setActiveChapterId(id);
							const chapter = chapters.find((c) => c.id === id);
							if (chapter) {
								const part = parts.find((p) => p.number === chapter.part);
								setCurrentPartLabel(part ? `Part ${part.number} — ${part.title}` : null);
							}
						}
					});
				},
				{
					root: document.getElementById('guide-scroll-container'),
					rootMargin: '-30% 0px -60% 0px',
					threshold: 0,
				}
			);
			observer.observe(el);
			observers.push(observer);
		});

		return () => observers.forEach((o) => o.disconnect());
	}, []);

	const setChapterRef = useCallback((id: string) => (el: HTMLElement | null) => {
		if (el) {
			chapterRefs.current.set(id, el);
		} else {
			chapterRefs.current.delete(id);
		}
	}, []);

	// Group chapters by part for rendering
	const partGroups = parts.map((part) => ({
		part,
		chapters: chapters.filter((c) => c.part === part.number),
	}));

	return (
		<div
			id="guide-scroll-container"
			className="h-full overflow-y-auto"
			style={{ backgroundColor: '#0f0f0f' }}
		>
			<ScrollProgress currentPart={currentPartLabel} />
			<ChapterMenu
				chapters={chapters}
				parts={parts}
				activeChapterId={activeChapterId}
			/>

			{/* Hero / opening */}
			<div
				className="flex flex-col items-center justify-center text-center px-6"
				style={{ minHeight: '70vh' }}
			>
				<p
					className="text-xs font-mono uppercase tracking-[0.2em] mb-6"
					style={{ color: '#da7756' }}
				>
					Claude OS
				</p>
				<h1
					className="text-5xl md:text-6xl font-semibold leading-[1.1] mb-6"
					style={{ color: '#f5f0e8' }}
				>
					The Guide
				</h1>
				<p
					className="text-lg max-w-md"
					style={{ color: 'rgba(245, 240, 232, 0.5)' }}
				>
					A visual walkthrough of the system. 20 chapters, 8 parts. Scroll at your own pace.
				</p>
				{/* Scroll indicator */}
				<div className="mt-16 animate-bounce">
					<svg width="20" height="20" viewBox="0 0 20 20">
						<path
							d="M4 8 L10 14 L16 8"
							stroke="rgba(218, 119, 86, 0.4)"
							strokeWidth="1.5"
							fill="none"
						/>
					</svg>
				</div>
			</div>

			{/* Content */}
			{partGroups.map(({ part, chapters: partChapters }) => (
				<div key={part.number}>
					{/* Part divider */}
					<PartDivider part={part} />

					{/* Chapters in this part */}
					{partChapters.map((chapter) => (
						<ChapterSection
							key={chapter.id}
							ref={setChapterRef(chapter.id)}
							chapter={chapter}
						/>
					))}
				</div>
			))}

			{/* Footer */}
			<div
				className="text-center px-6"
				style={{ paddingTop: '160px', paddingBottom: '160px' }}
			>
				<p
					className="text-xs font-mono uppercase tracking-[0.15em] mb-4"
					style={{ color: 'rgba(218, 119, 86, 0.4)' }}
				>
					End of Guide
				</p>
				<p
					className="text-lg"
					style={{ color: 'rgba(245, 240, 232, 0.3)' }}
				>
					The system grows with you. Start simple, extend as you go.
				</p>
			</div>
		</div>
	);
}
