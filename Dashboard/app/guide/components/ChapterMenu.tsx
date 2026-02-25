'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { List, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ChapterData, PartData } from '../content/types';

interface ChapterMenuProps {
	chapters: ChapterData[];
	parts: PartData[];
	activeChapterId: string | null;
}

export function ChapterMenu({ chapters, parts, activeChapterId }: ChapterMenuProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handleJump = useCallback((chapterId: string) => {
		const el = document.getElementById(chapterId);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth' });
			setIsOpen(false);
		}
	}, []);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setIsOpen(false);
			}
		};
		window.addEventListener('keydown', handleKey, { capture: true });
		return () => window.removeEventListener('keydown', handleKey, { capture: true });
	}, [isOpen]);

	// Group chapters by part
	const chaptersByPart = parts.map((part) => ({
		part,
		chapters: chapters.filter((c) => c.part === part.number),
	}));

	return (
		<>
			{/* Floating button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all"
				style={{
					backgroundColor: 'rgba(245, 240, 232, 0.08)',
					border: '1px solid rgba(245, 240, 232, 0.12)',
				}}
				aria-label="Chapter menu"
			>
				{isOpen ? (
					<X className="w-4 h-4" style={{ color: 'rgba(245, 240, 232, 0.7)' }} />
				) : (
					<List className="w-4 h-4" style={{ color: 'rgba(245, 240, 232, 0.7)' }} />
				)}
			</button>

			{/* Drawer */}
			<AnimatePresence>
				{isOpen && (
					<>
						{/* Backdrop */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="fixed inset-0 z-40"
							style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
							onClick={() => setIsOpen(false)}
						/>
						{/* Panel */}
						<motion.div
							initial={{ x: '100%' }}
							animate={{ x: 0 }}
							exit={{ x: '100%' }}
							transition={{ duration: 0.25, ease: 'easeOut' }}
							className="fixed top-0 right-0 bottom-0 z-50 w-80 overflow-y-auto"
							style={{
								backgroundColor: '#1a1a1a',
								borderLeft: '1px solid rgba(245, 240, 232, 0.08)',
							}}
						>
							<div className="p-6">
								<h3
									className="text-sm font-mono uppercase tracking-[0.15em] mb-6"
									style={{ color: 'rgba(218, 119, 86, 0.7)' }}
								>
									Chapters
								</h3>
								<div className="space-y-6">
									{chaptersByPart.map(({ part, chapters: partChapters }) => (
										<div key={part.number}>
											<p
												className="text-xs uppercase tracking-[0.15em] mb-2"
												style={{ color: 'rgba(218, 119, 86, 0.5)' }}
											>
												Part {part.number} &mdash; {part.title}
											</p>
											<div className="space-y-0.5">
												{partChapters.map((chapter) => {
													const num = String(chapter.chapterNumber).padStart(2, '0');
													const isActive = chapter.id === activeChapterId;
													return (
														<button
															key={chapter.id}
															onClick={() => handleJump(chapter.id)}
															className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-start gap-2.5"
															style={{
																backgroundColor: isActive
																	? 'rgba(218, 119, 86, 0.1)'
																	: 'transparent',
																color: isActive
																	? '#f5f0e8'
																	: 'rgba(245, 240, 232, 0.5)',
															}}
														>
															<span
																className="text-xs font-mono shrink-0 mt-0.5"
																style={{
																	color: isActive
																		? 'rgba(218, 119, 86, 0.8)'
																		: 'rgba(218, 119, 86, 0.35)',
																}}
															>
																{num}
															</span>
															<span>{chapter.headline}</span>
														</button>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	);
}
