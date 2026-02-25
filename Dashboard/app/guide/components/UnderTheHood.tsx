'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { CodeSnippet } from '../content/types';

interface UnderTheHoodProps {
	headline: string;
	copy: string[];
	codeSnippets?: CodeSnippet[];
}

export function UnderTheHood({ headline, copy, codeSnippets }: UnderTheHoodProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="mt-12">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2.5 group cursor-pointer"
			>
				<span
					className="text-xs font-mono uppercase tracking-[0.15em]"
					style={{ color: '#da7756' }}
				>
					Under the Hood
				</span>
				<motion.div
					animate={{ rotate: isOpen ? 180 : 0 }}
					transition={{ duration: 0.25, ease: 'easeInOut' }}
				>
					<ChevronDown
						className="w-4 h-4 transition-colors"
						style={{ color: 'rgba(218, 119, 86, 0.6)' }}
					/>
				</motion.div>
			</button>

			<AnimatePresence initial={false}>
				{isOpen && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.3, ease: 'easeInOut' }}
						className="overflow-hidden"
					>
						<div
							className="mt-4 rounded-lg px-6 py-5"
							style={{
								backgroundColor: 'rgba(218, 119, 86, 0.04)',
								borderLeft: '2px solid rgba(218, 119, 86, 0.3)',
							}}
						>
							{headline && (
								<h4
									className="text-sm font-medium mb-3"
									style={{ color: 'rgba(245, 240, 232, 0.9)' }}
								>
									{headline}
								</h4>
							)}
							<div className="space-y-3">
								{copy.map((paragraph, i) => (
									<p
										key={i}
										className="text-[15px] leading-relaxed"
										style={{ color: 'rgba(245, 240, 232, 0.6)' }}
									>
										{paragraph}
									</p>
								))}
							</div>
							{codeSnippets && codeSnippets.length > 0 && (
								<div className="mt-4 space-y-3">
									{codeSnippets.map((snippet, i) => (
										<div key={i}>
											{snippet.label && (
												<p
													className="text-xs font-mono mb-1.5"
													style={{ color: 'rgba(218, 119, 86, 0.6)' }}
												>
													{snippet.label}
												</p>
											)}
											<pre
												className="rounded-md px-4 py-3 overflow-x-auto"
												style={{ backgroundColor: '#0d0d0d' }}
											>
												<code
													className="text-[13px] font-mono leading-relaxed"
													style={{ color: 'rgba(245, 240, 232, 0.6)' }}
												>
													{snippet.code}
												</code>
											</pre>
										</div>
									))}
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
