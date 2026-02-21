'use client';

import { useEffect, useState } from 'react';
import { Building2, Briefcase, Link as LinkIcon, Loader2, User } from 'lucide-react';
import { API_BASE } from '@/lib/api';

interface ContactData {
	id: string;
	name: string;
	company: string | null;
	role: string | null;
	current_state: string | null;
	relationship: string | null;
	tags: string[];
	linkedin_url: string | null;
}

interface SenderCardProps {
	senderEmail: string;
}

export function SenderCard({ senderEmail }: SenderCardProps) {
	const [contact, setContact] = useState<ContactData | null>(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function fetchContact() {
			setLoading(true);
			setNotFound(false);
			setContact(null);

			try {
				// Search contacts by email
				const searchRes = await fetch(
					`${API_BASE}/api/contacts?search=${encodeURIComponent(senderEmail)}&limit=1`
				);
				if (!searchRes.ok) {
					setNotFound(true);
					return;
				}

				const results = await searchRes.json();
				if (cancelled) return;

				if (!results || results.length === 0) {
					setNotFound(true);
					return;
				}

				// First result is the best match
				const c = results[0];
				setContact({
					id: c.id,
					name: c.name,
					company: c.company,
					role: c.role,
					current_state: c.current_state,
					relationship: c.relationship,
					tags: c.tags || [],
					linkedin_url: c.linkedin_url,
				});
			} catch {
				if (!cancelled) setNotFound(true);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		if (senderEmail) {
			fetchContact();
		} else {
			setLoading(false);
			setNotFound(true);
		}

		return () => {
			cancelled = true;
		};
	}, [senderEmail]);

	if (loading) {
		return (
			<div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-muted)]">
				<Loader2 className="w-3 h-3 animate-spin" />
				Looking up sender...
			</div>
		);
	}

	if (notFound || !contact) {
		return null;
	}

	return (
		<div className="flex items-start gap-3 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]/30">
			{/* Contact info */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-0.5">
					<span className="text-xs font-medium text-[var(--text-primary)] truncate">
						{contact.name}
					</span>
					{contact.relationship && (
						<span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
							{contact.relationship}
						</span>
					)}
					{contact.linkedin_url && (
						<a
							href={contact.linkedin_url}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="text-[var(--text-muted)] hover:text-sky-400 transition-colors"
						>
							<LinkIcon className="w-3 h-3" />
						</a>
					)}
				</div>

				{/* Company + Role */}
				{(contact.company || contact.role) && (
					<div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
						{contact.company && (
							<span className="flex items-center gap-1">
								<Building2 className="w-2.5 h-2.5" />
								{contact.company}
							</span>
						)}
						{contact.role && (
							<span className="flex items-center gap-1">
								<Briefcase className="w-2.5 h-2.5" />
								{contact.role}
							</span>
						)}
					</div>
				)}

				{/* Current state */}
				{contact.current_state && (
					<div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 truncate">
						{contact.current_state}
					</div>
				)}

				{/* Tags */}
				{contact.tags.length > 0 && (
					<div className="flex items-center gap-1 mt-1 flex-wrap">
						{contact.tags.slice(0, 4).map((tag) => (
							<span
								key={tag}
								className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-accent)] text-[var(--text-muted)]"
							>
								{tag}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
