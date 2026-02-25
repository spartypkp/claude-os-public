'use client';

import { forwardRef } from 'react';
import { UnderTheHood } from './UnderTheHood';
import type { ChapterData } from '../content/types';

interface ChapterSectionProps {
	chapter: ChapterData;
}

export const ChapterSection = forwardRef<HTMLElement, ChapterSectionProps>(
	function ChapterSection({ chapter }, ref) {
		const chapterNum = String(chapter.chapterNumber).padStart(2, '0');

		return (
			<section
				ref={ref}
				id={chapter.id}
				className="relative"
				style={{ paddingTop: '120px' }}
			>
				<div className="max-w-[760px] mx-auto px-6">
					{/* Part label + chapter number */}
					<div className="flex items-center gap-3 mb-5">
						<span
							className="text-xs uppercase tracking-[0.15em]"
							style={{ color: '#da7756' }}
						>
							Part {chapter.part}
						</span>
						<span
							className="text-xs font-mono"
							style={{ color: 'rgba(218, 119, 86, 0.5)' }}
						>
							{chapterNum}
						</span>
					</div>

					{/* Headline */}
					<h2
						className="text-[44px] font-semibold leading-[1.1] mb-4"
						style={{ color: '#f5f0e8' }}
					>
						{chapter.headline}
					</h2>

					{chapter.subheadline && (
						<p
							className="text-lg mb-8"
							style={{ color: 'rgba(245, 240, 232, 0.6)' }}
						>
							{chapter.subheadline}
						</p>
					)}
				</div>

				{/* Visual (wider) */}
				<div className="max-w-[900px] mx-auto px-6 my-10">
					{chapter.visual}
				</div>

				{/* Copy */}
				<div className="max-w-[760px] mx-auto px-6">
					<div className="space-y-5">
						{chapter.copy.map((paragraph, i) => (
							<p
								key={i}
								className="text-lg leading-[1.75]"
								style={{
									color: 'rgba(245, 240, 232, 0.8)',
									maxWidth: '65ch',
								}}
							>
								{paragraph}
							</p>
						))}
					</div>

					{/* Under the Hood */}
					{chapter.underTheHood && (
						<UnderTheHood
							headline={chapter.underTheHood.headline}
							copy={chapter.underTheHood.copy}
							codeSnippets={chapter.underTheHood.codeSnippets}
						/>
					)}
				</div>
			</section>
		);
	}
);
