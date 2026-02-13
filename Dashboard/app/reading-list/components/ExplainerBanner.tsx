/**
 * ExplainerBanner - Dismissible banner explaining how Custom Apps work.
 *
 * Shows the architecture pattern and invites users to build their own.
 * Dismissal persisted in localStorage.
 */

'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Server, Layout, ArrowRight, Lightbulb } from 'lucide-react';

const STORAGE_KEY = 'reading-list-explainer-dismissed';

export function ExplainerBanner() {
	const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		setDismissed(stored === 'true');
	}, []);

	const handleDismiss = () => {
		setDismissed(true);
		localStorage.setItem(STORAGE_KEY, 'true');
	};

	if (dismissed) return null;

	return (
		<div className="relative rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.06] via-teal-500/[0.04] to-blue-500/[0.06] overflow-hidden">
			<button
				onClick={handleDismiss}
				className="absolute top-3 right-3 p-1 rounded-md text-[#666] hover:text-white
					hover:bg-white/10 transition-colors z-10"
			>
				<X className="w-3.5 h-3.5" />
			</button>

			<div className="p-5">
				<div className="flex items-center gap-2 mb-3">
					<Lightbulb className="w-4 h-4 text-emerald-400" />
					<h3 className="text-sm font-medium text-white">
						This is an Example Custom App
					</h3>
				</div>

				<p className="text-xs text-[#999] leading-relaxed mb-4 max-w-xl">
					Custom Apps connect a spec file to a backend service and a Dashboard UI.
					Claude reads the blueprint, generates the code, and wires everything together.
				</p>

				{/* Architecture flow */}
				<div className="flex items-center gap-2 mb-4">
					<Step icon={FileText} label="APP-SPEC.md" sublabel="Blueprint" />
					<ArrowRight className="w-3 h-3 text-[#555] shrink-0" />
					<Step icon={Server} label="service.py" sublabel="Backend" />
					<ArrowRight className="w-3 h-3 text-[#555] shrink-0" />
					<Step icon={Layout} label="page.tsx" sublabel="Frontend" />
				</div>

				<p className="text-xs text-emerald-400/80">
					Ask Claude to build you a custom app for anything — fitness tracking, recipe
					collection, project management, habit streaks...
				</p>
			</div>
		</div>
	);
}

function Step({ icon: Icon, label, sublabel }: { icon: typeof FileText; label: string; sublabel: string }) {
	return (
		<div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5">
			<Icon className="w-3.5 h-3.5 text-[#888] shrink-0" />
			<div className="min-w-0">
				<div className="text-[11px] text-white font-medium truncate">{label}</div>
				<div className="text-[9px] text-[#666]">{sublabel}</div>
			</div>
		</div>
	);
}
