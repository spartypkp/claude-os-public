'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PromptModalProps {
	isOpen: boolean;
	title: string;
	placeholder: string;
	defaultValue?: string;
	submitLabel?: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

export function PromptModal({
	isOpen,
	title,
	placeholder,
	defaultValue = '',
	submitLabel = 'Create',
	onSubmit,
	onCancel,
}: PromptModalProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState(defaultValue);

	// Reset value when modal opens
	useEffect(() => {
		if (isOpen) {
			setValue(defaultValue);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isOpen, defaultValue]);

	const handleSubmit = useCallback(() => {
		if (value.trim()) {
			onSubmit(value.trim());
			setValue('');
		}
	}, [value, onSubmit]);

	const handleCancel = useCallback(() => {
		setValue('');
		onCancel();
	}, [onCancel]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm"
			onClick={handleCancel}
		>
			<div
				className="w-[340px] rounded-xl bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="px-4 py-3 bg-gray-50 dark:bg-[#333] border-b border-gray-200 dark:border-white/10">
					<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
						{title}
					</h3>
				</div>

				{/* Content */}
				<div className="p-4">
					<input
						ref={inputRef}
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && value.trim()) {
								handleSubmit();
							} else if (e.key === 'Escape') {
								handleCancel();
							}
						}}
						placeholder={placeholder}
						className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-white/20 
							bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white
							placeholder-gray-400 dark:placeholder-gray-500
							focus:outline-none focus:ring-2 focus:ring-[#DA7756] focus:border-transparent
							transition-all"
						autoFocus
					/>
					<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
						Press Enter to {submitLabel.toLowerCase()}, Escape to cancel
					</p>
				</div>

				{/* Footer */}
				<div className="px-4 py-3 bg-gray-50 dark:bg-[#333] border-t border-gray-200 dark:border-white/10 flex justify-end gap-2">
					<button
						onClick={handleCancel}
						className="px-4 py-1.5 text-sm font-medium rounded-lg
							text-gray-600 dark:text-gray-300 
							hover:bg-gray-200 dark:hover:bg-white/10
							transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={!value.trim()}
						className="px-4 py-1.5 text-sm font-medium rounded-lg
							bg-[#DA7756] text-white
							hover:bg-[#c66a4d] disabled:opacity-50 disabled:cursor-not-allowed
							transition-colors"
					>
						{submitLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

// Hook for easier usage
export function usePromptModal() {
	const [modalState, setModalState] = useState<{
		isOpen: boolean;
		title: string;
		placeholder: string;
		defaultValue?: string;
		submitLabel?: string;
		onSubmit: (value: string) => void;
	}>({
		isOpen: false,
		title: '',
		placeholder: '',
		onSubmit: () => {},
	});

	const showPrompt = useCallback((
		title: string,
		placeholder: string,
		onSubmit: (value: string) => void,
		options?: { defaultValue?: string; submitLabel?: string }
	) => {
		setModalState({
			isOpen: true,
			title,
			placeholder,
			defaultValue: options?.defaultValue,
			submitLabel: options?.submitLabel,
			onSubmit: (value) => {
				onSubmit(value);
				setModalState(prev => ({ ...prev, isOpen: false }));
			},
		});
	}, []);

	const closePrompt = useCallback(() => {
		setModalState(prev => ({ ...prev, isOpen: false }));
	}, []);

	const PromptModalComponent = useCallback(() => (
		<PromptModal
			isOpen={modalState.isOpen}
			title={modalState.title}
			placeholder={modalState.placeholder}
			defaultValue={modalState.defaultValue}
			submitLabel={modalState.submitLabel}
			onSubmit={modalState.onSubmit}
			onCancel={closePrompt}
		/>
	), [modalState, closePrompt]);

	return { showPrompt, closePrompt, PromptModal: PromptModalComponent };
}

export default PromptModal;

