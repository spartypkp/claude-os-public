/**
 * AddItemModal - Form to add a new reading list item.
 *
 * Clean modal with dark theme styling. Title is required,
 * everything else is optional.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface AddItemModalProps {
	onAdd: (item: { title: string; author?: string; type: string; tags?: string[] }) => void;
	onClose: () => void;
}

export function AddItemModal({ onAdd, onClose }: AddItemModalProps) {
	const [title, setTitle] = useState('');
	const [author, setAuthor] = useState('');
	const [type, setType] = useState('book');
	const [tagsInput, setTagsInput] = useState('');
	const titleRef = useRef<HTMLInputElement>(null);

	// Auto-focus title input
	useEffect(() => {
		titleRef.current?.focus();
	}, []);

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onClose]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		const tags = tagsInput
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		onAdd({
			title: title.trim(),
			author: author.trim() || undefined,
			type,
			tags: tags.length > 0 ? tags : undefined,
		});
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-white/5">
					<h3 className="text-sm font-medium text-white">Add to Reading List</h3>
					<button
						onClick={onClose}
						className="p-1 rounded text-[#888] hover:text-white hover:bg-white/10 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Form */}
				<form onSubmit={handleSubmit} className="p-4 space-y-4">
					{/* Title */}
					<div>
						<label className="block text-xs text-[#888] mb-1">Title *</label>
						<input
							ref={titleRef}
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Thinking Fast and Slow"
							className="w-full px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10
								text-white placeholder-[#555] focus:outline-none focus:border-emerald-500/50"
						/>
					</div>

					{/* Author */}
					<div>
						<label className="block text-xs text-[#888] mb-1">Author</label>
						<input
							type="text"
							value={author}
							onChange={(e) => setAuthor(e.target.value)}
							placeholder="e.g. Daniel Kahneman"
							className="w-full px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10
								text-white placeholder-[#555] focus:outline-none focus:border-emerald-500/50"
						/>
					</div>

					{/* Type */}
					<div>
						<label className="block text-xs text-[#888] mb-1">Type</label>
						<select
							value={type}
							onChange={(e) => setType(e.target.value)}
							className="w-full px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10
								text-white focus:outline-none focus:border-emerald-500/50"
						>
							<option value="book">Book</option>
							<option value="article">Article</option>
							<option value="paper">Paper</option>
							<option value="other">Other</option>
						</select>
					</div>

					{/* Tags */}
					<div>
						<label className="block text-xs text-[#888] mb-1">Tags (comma-separated)</label>
						<input
							type="text"
							value={tagsInput}
							onChange={(e) => setTagsInput(e.target.value)}
							placeholder="e.g. psychology, decision-making"
							className="w-full px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10
								text-white placeholder-[#555] focus:outline-none focus:border-emerald-500/50"
						/>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="px-3 py-1.5 rounded-md text-xs text-[#888]
								hover:bg-white/5 transition-colors"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!title.trim()}
							className="px-3 py-1.5 rounded-md text-xs bg-emerald-500/10 text-emerald-400
								hover:bg-emerald-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						>
							Add Item
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
