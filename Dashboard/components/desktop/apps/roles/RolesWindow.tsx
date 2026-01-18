'use client';

import { useEffect, useState } from 'react';
import { Shield, Plus, Edit2, Trash2, Save, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface Role {
	slug: string;
	name: string;
	auto_include: string[];
	content: string;
	is_protected: boolean;
	modes: string[];
}

const ROLE_TEMPLATE = `---
auto_include:
  - Desktop/IDENTITY.md
---

<session-role>
# {Role Name}

{One sentence: what this role does}

## What You Own

**{Domain}:** {What area this role manages}

**{Deliverables}:** {What this role produces}

**TODAY.md section:** {Which section they write to}

## How You Work

{Key principles, decision frameworks, style guidelines}

## Your Section in TODAY.md

**BEFORE YOUR SESSION ENDS**, update the **{Role}** section:

- **Active** - In-progress work
- **Done** - Completed today

{Role-specific instructions}

## Examples

{Show what good looks like - real examples of this role in action}

</session-role>
`;

export function RolesWindow() {
	const [roles, setRoles] = useState<Role[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedRole, setSelectedRole] = useState<Role | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [editContent, setEditContent] = useState('');
	const [editAutoInclude, setEditAutoInclude] = useState<string>('');
	const [newSlug, setNewSlug] = useState('');
	const [newName, setNewName] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	const fetchRoles = async () => {
		try {
			const response = await fetch(`${API_BASE}/api/roles/`);
			const data = await response.json();
			if (data.success) {
				setRoles(data.roles);
			}
		} catch (error) {
			console.error('Failed to fetch roles:', error);
			toast.error('Failed to load roles');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchRoles();
	}, []);

	const handleSelectRole = (role: Role) => {
		setSelectedRole(role);
		setIsCreating(false);
		setEditContent(role.content);
		setEditAutoInclude((role.auto_include || []).join('\n'));
	};

	const handleCreate = () => {
		setIsCreating(true);
		setSelectedRole(null);
		setNewSlug('');
		setNewName('');
		setEditContent(ROLE_TEMPLATE);
		setEditAutoInclude('Desktop/IDENTITY.md');
	};

	const handleSaveNew = async () => {
		if (!newSlug || !newName) {
			toast.error('Slug and name are required');
			return;
		}

		setIsSaving(true);
		try {
			const response = await fetch(`${API_BASE}/api/roles/`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slug: newSlug,
					name: newName,
					content: editContent,
					auto_include: editAutoInclude.split('\n').filter(l => l.trim()),
				}),
			});

			const data = await response.json();

			if (data.success) {
				toast.success(`Role "${newName}" created`);
				await fetchRoles();
				setIsCreating(false);
			} else {
				toast.error(data.detail || 'Failed to create role');
			}
		} catch (error) {
			console.error('Failed to create role:', error);
			toast.error('Failed to create role');
		} finally {
			setIsSaving(false);
		}
	};

	const handleSaveEdit = async () => {
		if (!selectedRole) return;

		setIsSaving(true);
		try {
			const response = await fetch(`${API_BASE}/api/roles/${selectedRole.slug}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: editContent,
					auto_include: editAutoInclude.split('\n').filter(l => l.trim()),
				}),
			});

			const data = await response.json();

			if (data.success) {
				toast.success(`Role "${selectedRole.name}" updated`);
				await fetchRoles();
				const updated = data.role;
				setSelectedRole(updated);
				setEditContent(updated.content);
			} else {
				toast.error(data.detail || 'Failed to update role');
			}
		} catch (error) {
			console.error('Failed to update role:', error);
			toast.error('Failed to update role');
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (slug: string) => {
		if (!confirm(`Are you sure you want to delete the "${slug}" role?`)) {
			return;
		}

		try {
			const response = await fetch(`${API_BASE}/api/roles/${slug}`, {
				method: 'DELETE',
			});

			const data = await response.json();

			if (data.success) {
				toast.success(`Role "${slug}" deleted`);
				await fetchRoles();
				if (selectedRole?.slug === slug) {
					setSelectedRole(null);
				}
			} else {
				toast.error(data.detail || 'Failed to delete role');
			}
		} catch (error) {
			console.error('Failed to delete role:', error);
			toast.error('Failed to delete role');
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-sm text-gray-500 dark:text-[#888]">Loading roles...</div>
			</div>
		);
	}

	return (
		<div className="flex h-full">
			{/* Sidebar - Role List */}
			<div className="w-64 border-r border-gray-200 dark:border-[#3a3a3a] flex flex-col">
				{/* Header */}
				<div className="px-4 py-3 border-b border-gray-200 dark:border-[#3a3a3a] flex items-center justify-between">
					<h2 className="text-sm font-semibold text-gray-900 dark:text-white">Roles</h2>
					<button
						onClick={handleCreate}
						className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-[#333] transition-colors"
						title="Create new role"
					>
						<Plus className="w-4 h-4 text-gray-600 dark:text-[#aaa]" />
					</button>
				</div>

				{/* Role List */}
				<div className="flex-1 overflow-y-auto">
					{roles.map((role) => (
						<button
							key={role.slug}
							onClick={() => handleSelectRole(role)}
							className={`
								w-full px-4 py-2.5 text-left border-b border-gray-100 dark:border-[#2a2a2a]
								hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors
								${selectedRole?.slug === role.slug ? 'bg-blue-50 dark:bg-blue-500/10' : ''}
							`}
						>
							<div className="flex items-center justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium text-gray-900 dark:text-white truncate">
											{role.name}
										</span>
										{role.is_protected && (
											<span title="Protected role"><Shield className="w-3.5 h-3.5 text-amber-500" /></span>
										)}
									</div>
									<div className="text-xs text-gray-500 dark:text-[#888] truncate">
										{role.slug}
									</div>
								</div>
							</div>
							{role.modes.length > 0 && (
								<div className="mt-1 text-xs text-gray-400 dark:text-[#666]">
									{role.modes.length} mode{role.modes.length > 1 ? 's' : ''}
								</div>
							)}
						</button>
					))}
				</div>
			</div>

			{/* Main Content Area */}
			<div className="flex-1 flex flex-col">
				{isCreating ? (
					/* Create New Role */
					<>
						<div className="px-6 py-4 border-b border-gray-200 dark:border-[#3a3a3a] flex items-center justify-between">
							<div>
								<h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Role</h2>
								<p className="text-sm text-gray-500 dark:text-[#888] mt-0.5">
									Define a new Claude role with specialized behavior
								</p>
							</div>
							<div className="flex items-center gap-2">
								<button
									onClick={() => setIsCreating(false)}
									className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
								>
									<X className="w-4 h-4" />
								</button>
								<button
									onClick={handleSaveNew}
									disabled={isSaving || !newSlug || !newName}
									className="px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
								>
									<Save className="w-4 h-4" />
									<span>Create</span>
								</button>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto p-6">
							{/* Role Metadata */}
							<div className="space-y-4 mb-6">
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
										Slug (lowercase, no spaces)
									</label>
									<input
										type="text"
										value={newSlug}
										onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
										placeholder="finance"
										className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-[#444] rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
										Display Name
									</label>
									<input
										type="text"
										value={newName}
										onChange={(e) => setNewName(e.target.value)}
										placeholder="Finance"
										className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-[#444] rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
										Auto-Include Files (one per line)
									</label>
									<textarea
										value={editAutoInclude}
										onChange={(e) => setEditAutoInclude(e.target.value)}
										rows={3}
										className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-[#444] rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
										placeholder="Desktop/IDENTITY.md"
									/>
									<p className="text-xs text-gray-500 dark:text-[#888] mt-1">
										Files automatically loaded when this role starts
									</p>
								</div>
							</div>

							{/* Role Content */}
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
									Role Content
								</label>
								<textarea
									value={editContent}
									onChange={(e) => setEditContent(e.target.value)}
									rows={20}
									className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-[#444] rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
								/>
							</div>
						</div>
					</>
				) : selectedRole ? (
					/* Edit Selected Role */
					<>
						<div className="px-6 py-4 border-b border-gray-200 dark:border-[#3a3a3a] flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div>
									<div className="flex items-center gap-2">
										<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
											{selectedRole.name}
										</h2>
										{selectedRole.is_protected && (
											<div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
												<Shield className="w-3 h-3" />
												<span className="text-xs font-medium">Protected</span>
											</div>
										)}
									</div>
									<p className="text-sm text-gray-500 dark:text-[#888]">{selectedRole.slug}</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{!selectedRole.is_protected && (
									<button
										onClick={() => handleDelete(selectedRole.slug)}
										className="px-3 py-1.5 text-sm rounded border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
									>
										<Trash2 className="w-4 h-4" />
										<span>Delete</span>
									</button>
								)}
								<button
									onClick={handleSaveEdit}
									disabled={isSaving}
									className="px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
								>
									<Save className="w-4 h-4" />
									<span>Save</span>
								</button>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto p-6">
							{selectedRole.is_protected && (
								<div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
									<div className="flex items-start gap-2">
										<Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
										<div className="flex-1">
											<p className="text-sm font-medium text-amber-900 dark:text-amber-200">
												Protected System Role
											</p>
											<p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
												This is a core system role. You can edit its content but cannot delete it.
											</p>
										</div>
									</div>
								</div>
							)}

							{/* Auto-Include Files */}
							<div className="mb-6">
								<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
									Auto-Include Files (one per line)
								</label>
								<textarea
									value={editAutoInclude}
									onChange={(e) => setEditAutoInclude(e.target.value)}
									rows={3}
									className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-[#444] rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white"
								/>
								<p className="text-xs text-gray-500 dark:text-[#888] mt-1">
									Files automatically loaded when this role starts
								</p>
							</div>

							{/* Modes */}
							{selectedRole.modes.length > 0 && (
								<div className="mb-6">
									<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
										Available Modes
									</label>
									<div className="flex flex-wrap gap-2">
										{selectedRole.modes.map((mode) => (
											<span
												key={mode}
												className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
											>
												{mode}
											</span>
										))}
									</div>
								</div>
							)}

							{/* Role Content */}
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-[#ccc] mb-1.5">
									Role Content
								</label>
								<textarea
									value={editContent}
									onChange={(e) => setEditContent(e.target.value)}
									rows={20}
									className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-[#444] rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white resize-none"
								/>
							</div>
						</div>
					</>
				) : (
					/* Empty State */
					<div className="flex-1 flex items-center justify-center">
						<div className="text-center">
							<FileText className="w-12 h-12 text-gray-300 dark:text-[#555] mx-auto mb-3" />
							<p className="text-sm text-gray-500 dark:text-[#888]">
								Select a role to view or edit
							</p>
							<button
								onClick={handleCreate}
								className="mt-4 px-4 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors inline-flex items-center gap-2"
							>
								<Plus className="w-4 h-4" />
								<span>Create New Role</span>
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
