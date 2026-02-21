import { ClaudeLogo } from '@/components/ClaudePanel/ClaudeLogo';

interface AboutDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="
					w-[340px] rounded-2xl overflow-hidden
					bg-[var(--surface-raised)] border border-[var(--border-default)]
					shadow-2xl
				"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex flex-col items-center pt-8 pb-3 px-6">
					<div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-[#da7756] to-[#C15F3C] flex items-center justify-center mb-5 shadow-lg shadow-[#da7756]/25">
						<ClaudeLogo className="w-12 h-12 text-white" />
					</div>
					<h2 className="text-xl font-semibold text-[var(--text-primary)]">Claude OS</h2>
					<p className="text-[13px] text-[var(--text-tertiary)] mt-1">
						A system where Claude and Will figure out life together
					</p>
				</div>

				<div className="px-6 pb-5">
					<div className="space-y-2.5 text-xs text-[var(--text-secondary)]">
						<p>
							Claude reads files, writes to files, and remembers across conversations because the files persist. Multiple Claude instances run at once — Chief orchestrates, Specialists go deep.
						</p>
						<p className="text-[var(--text-tertiary)]">
							Neither party has complete information. Both learn together. The relationship itself is the alignment mechanism.
						</p>
					</div>
				</div>

				<div className="px-6 pb-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
					<span>Next.js + FastAPI + Claude Code</span>
					<span>Local-first. No cloud.</span>
				</div>

				<div className="px-6 pb-6 pt-3 flex justify-center">
					<button
						onClick={onClose}
						className="
							px-8 py-2 rounded-lg
							bg-gradient-to-r from-[#da7756] to-[#C15F3C] text-white text-sm font-medium
							hover:opacity-90 active:scale-[0.98]
							transition-all shadow-sm
						"
					>
						OK
					</button>
				</div>
			</div>
		</div>
	);
}
