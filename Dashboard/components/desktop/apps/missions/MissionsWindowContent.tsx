'use client';

import { useMissionsQuery, useRunningMissionsQuery, useRolesQuery, useDutiesQuery, useRunningDutiesQuery, type Mission, type MissionExecution, type Duty, type DutyExecution } from '@/hooks/queries';
import {
	AlertCircle,
	Calendar,
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	Edit3,
	FileText,
	Loader2,
	Lock,
	Moon,
	Pause,
	Play,
	Plus,
	RefreshCw,
	Rocket,
	Shield,
	Sun,
	Timer,
	Trash2,
	X,
	Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Claude OS branded colors
const CLAUDE_CORAL = '#DA7756';
const CLAUDE_CORAL_DARK = '#C15F3C';
const CLAUDE_CORAL_LIGHT = '#E8A088';

// =============================================================================
// TYPES (imported from @/hooks/queries/useMissionsQuery)
// =============================================================================

interface CreateMissionForm {
	name: string;
	slug: string;
	description: string;
	prompt_file: string;
	schedule_type: 'time' | 'cron';
	schedule_time: string;
	schedule_cron: string;
	timeout_minutes: number;
	role: string;
	mode: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

function formatTime(isoString: string | null): string {
	if (!isoString) return '—';
	try {
		const date = new Date(isoString);
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});
	} catch {
		return '—';
	}
}

function formatDateTime(isoString: string | null): string {
	if (!isoString) return '—';
	try {
		const date = new Date(isoString);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();

		if (isToday) {
			return `Today at ${formatTime(isoString)}`;
		}

		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (date.toDateString() === yesterday.toDateString()) {
			return `Yesterday at ${formatTime(isoString)}`;
		}

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	} catch {
		return '—';
	}
}

function formatDuration(seconds: number | null): string {
	if (seconds === null) return '—';
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatSchedule(mission: Mission): string {
	if (mission.schedule_type === 'time' && mission.schedule_time) {
		const [hour, minute] = mission.schedule_time.split(':');
		const h = parseInt(hour, 10);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 || 12;
		return `${h12}:${minute} ${ampm}`;
	}
	if (mission.schedule_type === 'cron' && mission.schedule_cron) {
		return describeCron(mission.schedule_cron);
	}
	return 'Manual';
}

function describeCron(cron: string): string {
	// Simple cron descriptions
	const parts = cron.split(' ');
	if (parts.length !== 5) return cron;

	const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

	if (dayOfWeek === '0' && hour !== '*' && minute !== '*') {
		return `Sundays at ${parseInt(hour, 10) % 12 || 12}:${minute.padStart(2, '0')} ${parseInt(hour, 10) >= 12 ? 'PM' : 'AM'}`;
	}
	if (dayOfWeek === '1-5' && hour !== '*') {
		return `Weekdays at ${parseInt(hour, 10) % 12 || 12}:${minute.padStart(2, '0')} ${parseInt(hour, 10) >= 12 ? 'PM' : 'AM'}`;
	}
	if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && hour !== '*') {
		return `Daily at ${parseInt(hour, 10) % 12 || 12}:${minute.padStart(2, '0')} ${parseInt(hour, 10) >= 12 ? 'PM' : 'AM'}`;
	}

	return cron;
}

function getStatusColor(status: string | null): string {
	switch (status) {
		case 'completed':
			return 'text-emerald-500';
		case 'failed':
			return 'text-red-500';
		case 'timeout':
			return 'text-amber-500';
		case 'running':
			return 'text-blue-500';
		case 'cancelled':
			return 'text-gray-500';
		default:
			return 'text-gray-400';
	}
}

function getStatusBg(status: string | null): string {
	switch (status) {
		case 'completed':
			return 'bg-emerald-500/10 border-emerald-500/20';
		case 'failed':
			return 'bg-red-500/10 border-red-500/20';
		case 'timeout':
			return 'bg-amber-500/10 border-amber-500/20';
		case 'running':
			return 'bg-blue-500/10 border-blue-500/20';
		default:
			return 'bg-gray-500/10 border-gray-500/20';
	}
}

function slugify(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

// =============================================================================
// OVERNIGHT TASKS SECTION
// =============================================================================

interface OvernightTasksSectionProps {
	onRefresh: () => void;
}

function OvernightTasksSection({ onRefresh }: OvernightTasksSectionProps) {
	const [tasks, setTasks] = useState<string[]>([]);
	const [newTask, setNewTask] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	// Fetch current tasks
	useEffect(() => {
		async function fetchTasks() {
			try {
				const response = await fetch(`${API_BASE}/api/files/read?path=Desktop/overnight-tasks.md`);
				if (response.ok) {
					const data = await response.json();
					const content = data.content || '';
					// Parse tasks (lines starting with -)
					const lines = content.split('\n');
					const taskLines = lines.filter((line: string) => line.trim().startsWith('-')).map((line: string) => line.trim().slice(1).trim());
					setTasks(taskLines);
				}
			} catch {
				// Silent fail
			} finally {
				setLoading(false);
			}
		}
		fetchTasks();
	}, []);

	const handleAddTask = async () => {
		if (!newTask.trim()) return;

		setSaving(true);
		try {
			// Append to file
			const response = await fetch(`${API_BASE}/api/files/append`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: 'Desktop/overnight-tasks.md',
					content: `\n- ${newTask.trim()}`,
				}),
			});

			if (response.ok) {
				setTasks((prev) => [...prev, newTask.trim()]);
				setNewTask('');
			}
		} catch {
			// Silent fail
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="rounded-xl p-4 border"
			style={{
				background: `linear-gradient(135deg, ${CLAUDE_CORAL}08 0%, ${CLAUDE_CORAL}03 100%)`,
				borderColor: `${CLAUDE_CORAL}20`,
			}}
		>
			<div className="flex items-center gap-2 mb-3">
				<div
					className="p-1.5 rounded-lg"
					style={{ backgroundColor: `${CLAUDE_CORAL}15` }}
				>
					<Moon className="w-4 h-4" style={{ color: CLAUDE_CORAL }} />
				</div>
				<h3 className="font-semibold text-gray-800 dark:text-gray-100">
					Tonight&apos;s Queue
				</h3>
				<span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
					Processes at 1 AM
				</span>
			</div>

			{/* Task input */}
			<div className="flex gap-2 mb-3">
				<input
					type="text"
					value={newTask}
					onChange={(e) => setNewTask(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
					placeholder="Add task for tonight..."
					className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2"
					style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
				/>
				<button
					onClick={handleAddTask}
					disabled={!newTask.trim() || saving}
					className="px-3 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-50 transition-all hover:opacity-90"
					style={{ backgroundColor: CLAUDE_CORAL }}
				>
					{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
				</button>
			</div>

			{/* Task list */}
			{loading ? (
				<div className="flex items-center justify-center py-4">
					<Loader2 className="w-4 h-4 animate-spin text-gray-400" />
				</div>
			) : tasks.length === 0 ? (
				<p className="text-sm text-gray-500 dark:text-gray-400 py-2 text-center">
					No tasks queued for tonight
				</p>
			) : (
				<div className="space-y-1.5 max-h-32 overflow-y-auto">
					{tasks.map((task, i) => (
						<div
							key={i}
							className="flex items-start gap-2 text-sm py-1.5 px-2 rounded-lg bg-white/50 dark:bg-gray-800/50"
						>
							<span className="text-gray-400 mt-0.5">•</span>
							<span className="text-gray-700 dark:text-gray-300">{task}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// CHIEF DUTIES SECTION (Critical scheduled Chief work)
// =============================================================================

interface ChiefDutiesSectionProps {
	duties: Duty[];
	runningDuties: DutyExecution[];
	isLoading: boolean;
	onRunNow: (slug: string) => void;
}

function formatScheduleTimeLocal(time: string): string {
	try {
		const [hour, minute] = time.split(':');
		const h = parseInt(hour, 10);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 || 12;
		return `${h12}:${minute} ${ampm}`;
	} catch {
		return time;
	}
}

function ChiefDutiesSection({ duties, runningDuties, isLoading, onRunNow }: ChiefDutiesSectionProps) {
	if (isLoading) {
		return (
			<div
				className="rounded-xl p-4 border"
				style={{
					background: `linear-gradient(135deg, ${CLAUDE_CORAL}08 0%, ${CLAUDE_CORAL}03 100%)`,
					borderColor: `${CLAUDE_CORAL}20`,
				}}
			>
				<div className="flex items-center justify-center py-4">
					<Loader2 className="w-4 h-4 animate-spin text-gray-400" />
				</div>
			</div>
		);
	}

	const runningSlug = runningDuties.length > 0 ? runningDuties[0].duty_slug : null;

	return (
		<div
			className="rounded-xl p-4 border"
			style={{
				background: `linear-gradient(135deg, ${CLAUDE_CORAL}08 0%, ${CLAUDE_CORAL}03 100%)`,
				borderColor: `${CLAUDE_CORAL}20`,
			}}
		>
			<div className="flex items-center gap-2 mb-3">
				<div
					className="p-1.5 rounded-lg"
					style={{ backgroundColor: `${CLAUDE_CORAL}15` }}
				>
					<Shield className="w-4 h-4" style={{ color: CLAUDE_CORAL }} />
				</div>
				<h3 className="font-semibold text-gray-800 dark:text-gray-100">
					Chief Duties
				</h3>
				<span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
					Critical Chief work
				</span>
			</div>

			{duties.length === 0 ? (
				<p className="text-sm text-gray-500 dark:text-gray-400 py-2 text-center">
					No duties configured
				</p>
			) : (
				<div className="space-y-2">
					{duties.map((duty) => {
						const isRunning = runningSlug === duty.slug;
						return (
							<div
								key={duty.id}
								className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/50 dark:bg-gray-800/50 border ${
									isRunning
										? 'border-blue-200 dark:border-blue-800'
										: 'border-transparent'
								}`}
							>
								{/* Status */}
								{isRunning ? (
									<div className="relative">
										<div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
									</div>
								) : (
									<div className={`w-2.5 h-2.5 rounded-full ${duty.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
								)}

								{/* Name */}
								<div className="flex-1 min-w-0">
									<span className="font-medium text-gray-800 dark:text-gray-100 text-sm">
										{duty.name}
									</span>
									{duty.description && (
										<p className="text-xs text-gray-500 dark:text-gray-400 truncate">
											{duty.description}
										</p>
									)}
								</div>

								{/* Schedule */}
								<div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
									<Clock className="w-3 h-3" />
									<span>{formatScheduleTimeLocal(duty.schedule_time)} PT</span>
								</div>

								{/* Last status */}
								{duty.last_status && (
									<span className={`text-xs px-1.5 py-0.5 rounded ${getStatusBg(duty.last_status)} ${getStatusColor(duty.last_status)}`}>
										{duty.last_status}
									</span>
								)}

								{/* Run button */}
								<button
									onClick={() => onRunNow(duty.slug)}
									disabled={!duty.enabled || isRunning}
									className="p-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 disabled:opacity-50 transition-all"
									title="Run now"
								>
									{isRunning ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<Play className="w-3.5 h-3.5" />
									)}
								</button>
							</div>
						);
					})}
				</div>
			)}

			{/* Info text */}
			<p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
				Duties run IN Chief&apos;s context • Self-healing schedule
			</p>
		</div>
	);
}

// =============================================================================
// RUNNING MISSIONS BANNER
// =============================================================================

interface RunningBannerProps {
	executions: MissionExecution[];
	missions: Mission[];
}

function RunningBanner({ executions, missions }: RunningBannerProps) {
	if (executions.length === 0) return null;

	const getMissionName = (slug: string) => {
		const mission = missions.find((m) => m.slug === slug);
		return mission?.name || slug;
	};

	return (
		<div className="mx-4 mt-3 rounded-xl overflow-hidden border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
			{executions.map((exec) => (
				<div key={exec.id} className="flex items-center gap-3 px-4 py-3">
					<div className="relative">
						<div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
						<div className="absolute inset-0 w-3 h-3 rounded-full bg-blue-400 animate-ping" />
					</div>
					<div className="flex-1">
						<span className="font-medium text-blue-800 dark:text-blue-200">
							{getMissionName(exec.mission_slug)}
						</span>
						<span className="text-sm text-blue-600 dark:text-blue-400 ml-2">
							Running since {formatTime(exec.started_at)}
						</span>
					</div>
					<Rocket className="w-4 h-4 text-blue-500" />
				</div>
			))}
		</div>
	);
}

// =============================================================================
// MISSION CARD
// =============================================================================

interface MissionCardProps {
	mission: Mission;
	onToggle: () => void;
	onRunNow: () => void;
	onEdit?: () => void;
	onDelete?: () => void;
	isExpanded: boolean;
	toggleExpanded: () => void;
	history: MissionExecution[];
	isLoadingHistory: boolean;
}

function MissionCard({
	mission,
	onToggle,
	onRunNow,
	onEdit,
	onDelete,
	isExpanded,
	toggleExpanded,
	history,
	isLoadingHistory,
}: MissionCardProps) {
	const isCore = mission.source === 'core_default';
	const canEdit = mission.source === 'user';
	const canDelete = mission.source === 'user';

	return (
		<div
			className={`rounded-xl overflow-hidden transition-all border ${mission.enabled
				? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
				: 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 opacity-60'
				}`}
		>
			{/* Header */}
			<div
				className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
				onClick={toggleExpanded}
			>
				{/* Expand icon */}
				<button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
					{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
				</button>

			{/* Status indicator */}
			{isCore ? (
					<div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
						<Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
					</div>
				) : (
					<div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700">
						<Zap className="w-4 h-4 text-gray-500 dark:text-gray-400" />
					</div>
				)}

				{/* Name and info */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className={`font-medium ${mission.enabled ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400'}`}>
							{mission.name}
						</span>
					</div>
					{mission.description && (
						<p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
							{mission.description}
						</p>
					)}
				</div>

				{/* Schedule */}
				<div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
					<Clock className="w-3.5 h-3.5" />
					<span>{formatSchedule(mission)}</span>
				</div>

				{/* Role/Mode badge */}
				<span className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono">
					{mission.role}/{mission.mode}
				</span>

				{/* Last status */}
				{mission.last_status && (
					<span className={`text-xs px-2 py-1 rounded-lg border ${getStatusBg(mission.last_status)} ${getStatusColor(mission.last_status)}`}>
						{mission.last_status}
					</span>
				)}

				{/* Actions */}
				<div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
					<button
							onClick={onToggle}
							className={`p-2 rounded-lg transition-all ${mission.enabled
								? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
								: 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'
								}`}
							title={mission.enabled ? 'Disable' : 'Enable'}
						>
							{mission.enabled ? <Check className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
						</button>
					<button
						onClick={onRunNow}
						disabled={!mission.enabled}
						className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 disabled:opacity-50 transition-all"
						title="Run now"
					>
						<Play className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Expanded content */}
			{isExpanded && (
				<div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-4">
					{/* Details grid */}
					<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
						<div>
							<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Prompt</span>
							<p className="text-sm font-mono mt-1 text-gray-700 dark:text-gray-300 truncate">
								{mission.prompt_file || 'inline'}
							</p>
						</div>
						<div>
							<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Timeout</span>
							<p className="text-sm mt-1 text-gray-700 dark:text-gray-300">{mission.timeout_minutes} minutes</p>
						</div>
						<div>
							<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Next Run</span>
							<p className="text-sm mt-1 text-gray-700 dark:text-gray-300">{formatDateTime(mission.next_run)}</p>
						</div>
						<div>
							<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Run</span>
							<p className="text-sm mt-1 text-gray-700 dark:text-gray-300">{formatDateTime(mission.last_run)}</p>
						</div>
					</div>

					{/* Edit/Delete buttons for user missions */}
					{(canEdit || canDelete) && (
						<div className="flex gap-2 mb-4">
							{canEdit && onEdit && (
								<button
									onClick={onEdit}
									className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
								>
									<Edit3 className="w-3.5 h-3.5" />
									Edit
								</button>
							)}
							{canDelete && onDelete && (
								<button
									onClick={onDelete}
									className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
								>
									<Trash2 className="w-3.5 h-3.5" />
									Delete
								</button>
							)}
						</div>
					)}

					{/* Recent executions */}
					<div>
						<h4 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
							Recent Executions
						</h4>
						{isLoadingHistory ? (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="w-4 h-4 animate-spin text-gray-400" />
							</div>
						) : history.length === 0 ? (
							<p className="text-sm text-gray-400 py-2">No executions yet</p>
						) : (
							<div className="space-y-1.5">
								{history.slice(0, 5).map((exec) => (
									<div
										key={exec.id}
										className="flex items-center gap-3 text-sm py-2 px-3 rounded-lg bg-white dark:bg-gray-800"
									>
										<span className={`w-2 h-2 rounded-full ${getStatusColor(exec.status).replace('text-', 'bg-')}`} />
										<span className="text-gray-600 dark:text-gray-300">{formatDateTime(exec.started_at)}</span>
										<span className="text-gray-400">•</span>
										<span className="text-gray-500 dark:text-gray-400">{formatDuration(exec.duration_seconds)}</span>
										{exec.error_message && (
											<span className="text-red-500 text-xs truncate flex-1">{exec.error_message}</span>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// CREATE MISSION MODAL
// =============================================================================

interface CreateMissionModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (form: CreateMissionForm) => Promise<void>;
}

function CreateMissionModal({ isOpen, onClose, onSubmit }: CreateMissionModalProps) {
	const [form, setForm] = useState<CreateMissionForm>({
		name: '',
		slug: '',
		description: '',
		prompt_file: 'Desktop/working/',
		schedule_type: 'time',
		schedule_time: '09:00',
		schedule_cron: '0 9 * * *',
		timeout_minutes: 60,
		role: 'chief',
		mode: 'autonomous',
	});
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch roles dynamically
	const { data: roles } = useRolesQuery();

	// Auto-generate slug from name
	useEffect(() => {
		if (form.name && !form.slug) {
			setForm((f) => ({ ...f, slug: slugify(form.name) }));
		}
	}, [form.name, form.slug]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);

		try {
			await onSubmit(form);
			onClose();
			setForm({
				name: '',
				slug: '',
				description: '',
				prompt_file: 'Desktop/working/',
				schedule_type: 'time',
				schedule_time: '09:00',
				schedule_cron: '0 9 * * *',
				timeout_minutes: 60,
				role: 'chief',
				mode: 'autonomous',
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create mission');
		} finally {
			setSubmitting(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
				{/* Header */}
				<div
					className="px-6 py-4 flex items-center justify-between"
					style={{ background: `linear-gradient(135deg, ${CLAUDE_CORAL} 0%, ${CLAUDE_CORAL_DARK} 100%)` }}
				>
					<div className="flex items-center gap-3">
						<Plus className="w-5 h-5 text-white" />
						<h2 className="text-lg font-semibold text-white">Create Mission</h2>
					</div>
					<button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
						<X className="w-5 h-5 text-white" />
					</button>
				</div>

				{/* Form */}
				<form onSubmit={handleSubmit} className="p-6 space-y-4">
					{error && (
						<div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
							<AlertCircle className="w-4 h-4" />
							{error}
						</div>
					)}

					{/* Name & Slug */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
							<input
								type="text"
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
								placeholder="Weekly Review"
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
							<input
								type="text"
								value={form.slug}
								onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
								placeholder="weekly-review"
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-sm focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
								required
							/>
						</div>
					</div>

					{/* Description */}
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
						<input
							type="text"
							value={form.description}
							onChange={(e) => setForm({ ...form, description: e.target.value })}
							placeholder="Review the past week and plan ahead"
							className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
							style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
						/>
					</div>

					{/* Prompt file */}
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt File</label>
						<div className="flex items-center gap-2">
							<FileText className="w-4 h-4 text-gray-400" />
							<input
								type="text"
								value={form.prompt_file}
								onChange={(e) => setForm({ ...form, prompt_file: e.target.value })}
								placeholder="Desktop/working/weekly-review.md"
								className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-sm focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
								required
							/>
						</div>
					</div>

					{/* Schedule */}
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Schedule</label>
						<div className="flex gap-2 mb-2">
							<button
								type="button"
								onClick={() => setForm({ ...form, schedule_type: 'time' })}
								className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${form.schedule_type === 'time'
									? 'border-transparent text-white'
									: 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
									}`}
								style={form.schedule_type === 'time' ? { backgroundColor: CLAUDE_CORAL } : {}}
							>
								<Clock className="w-4 h-4 inline mr-1.5" />
								Daily Time
							</button>
							<button
								type="button"
								onClick={() => setForm({ ...form, schedule_type: 'cron' })}
								className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${form.schedule_type === 'cron'
									? 'border-transparent text-white'
									: 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
									}`}
								style={form.schedule_type === 'cron' ? { backgroundColor: CLAUDE_CORAL } : {}}
							>
								<Calendar className="w-4 h-4 inline mr-1.5" />
								Cron
							</button>
						</div>
						{form.schedule_type === 'time' ? (
							<input
								type="time"
								value={form.schedule_time}
								onChange={(e) => setForm({ ...form, schedule_time: e.target.value })}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
							/>
						) : (
							<input
								type="text"
								value={form.schedule_cron}
								onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })}
								placeholder="0 9 * * *"
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-sm focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
							/>
						)}
					</div>

					{/* Role & Mode */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
							<select
								value={form.role}
								onChange={(e) => setForm({ ...form, role: e.target.value })}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
							>
								{roles?.map(role => {
									const isChief = role.slug === 'chief';
									const label = isChief ? `${role.slug} (exclusive)` : `${role.slug} (parallel)`;
									return <option key={role.slug} value={role.slug}>{label}</option>;
								})}
							</select>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mode</label>
							<select
								value={form.mode}
								onChange={(e) => setForm({ ...form, mode: e.target.value })}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
							>
								<option value="autonomous">autonomous (unattended)</option>
								<option value="ask">ask (interactive)</option>
							</select>
						</div>
					</div>

					{/* Timeout */}
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Timeout (minutes)
						</label>
						<div className="flex items-center gap-2">
							<Timer className="w-4 h-4 text-gray-400" />
							<input
								type="number"
								value={form.timeout_minutes}
								onChange={(e) => setForm({ ...form, timeout_minutes: parseInt(e.target.value, 10) || 60 })}
								min={5}
								max={480}
								className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2"
								style={{ '--tw-ring-color': CLAUDE_CORAL } as React.CSSProperties}
							/>
						</div>
					</div>

					{/* Submit */}
					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={submitting || !form.name || !form.slug}
							className="flex-1 px-4 py-2.5 rounded-lg text-white font-medium disabled:opacity-50 transition-all hover:opacity-90 flex items-center justify-center gap-2"
							style={{ backgroundColor: CLAUDE_CORAL }}
						>
							{submitting ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Creating...
								</>
							) : (
								<>
									<Plus className="w-4 h-4" />
									Create Mission
								</>
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function MissionsWindowContent() {
	// Jan 2026: Use React Query instead of polling - SSE events handle updates
	const { data: missionsData, isLoading: loading, error: missionsError, refetch: refetchMissions } = useMissionsQuery();
	const { data: runningData } = useRunningMissionsQuery();

	// Duties queries (Chief duties - critical scheduled Chief work)
	const { data: dutiesData, isLoading: dutiesLoading } = useDutiesQuery();
	const { data: runningDutiesData } = useRunningDutiesQuery();

	// Filter out Chief missions - they're now duties
	const missions = (missionsData?.missions || []).filter((m) => m.role !== 'chief');
	const runningExecutions = runningData?.running || [];
	const duties = dutiesData?.duties || [];
	const runningDuties = runningDutiesData?.executions || [];
	const error = missionsError ? (missionsError instanceof Error ? missionsError.message : 'Failed to load missions') : null;

	// UI state
	const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
	const [historyCache, setHistoryCache] = useState<Record<string, MissionExecution[]>>({});
	const [loadingHistory, setLoadingHistory] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);

	// Fetch history when expanding (still manual since it's on-demand)
	const fetchHistory = useCallback(
		async (slug: string) => {
			if (historyCache[slug]) return;

			setLoadingHistory(slug);
			try {
				const response = await fetch(`${API_BASE}/api/missions/${slug}/history?limit=5`);
				if (!response.ok) throw new Error('Failed to fetch history');
				const data = await response.json();
				setHistoryCache((prev) => ({ ...prev, [slug]: data.executions || [] }));
			} catch {
				setHistoryCache((prev) => ({ ...prev, [slug]: [] }));
			} finally {
				setLoadingHistory(null);
			}
		},
		[historyCache]
	);

	// Invalidate history cache when mission completes (SSE will handle main data)
	// This is handled automatically by React Query cache invalidation

	// Handle expand/collapse
	const handleToggleExpand = useCallback(
		(slug: string) => {
			if (expandedSlug === slug) {
				setExpandedSlug(null);
			} else {
				setExpandedSlug(slug);
				fetchHistory(slug);
			}
		},
		[expandedSlug, fetchHistory]
	);

	// Enable/disable mission
	// Jan 2026: SSE mission.updated event will invalidate cache automatically
	const handleToggle = useCallback(
		async (slug: string, currentEnabled: boolean) => {
			try {
				const endpoint = currentEnabled ? 'disable' : 'enable';
				const response = await fetch(`${API_BASE}/api/missions/${slug}/${endpoint}`, { method: 'POST' });
				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.detail || 'Failed to toggle mission');
				}
				// SSE event will invalidate cache
			} catch (err) {
				console.error('Failed to toggle mission:', err);
			}
		},
		[]
	);

	// Run mission now
	// Jan 2026: SSE mission.started event will invalidate cache automatically
	const handleRunNow = useCallback(
		async (slug: string) => {
			try {
				const response = await fetch(`${API_BASE}/api/missions/${slug}/run`, { method: 'POST' });
				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.detail || 'Failed to run mission');
				}
				// SSE event will invalidate cache
			} catch (err) {
				console.error('Failed to run mission:', err);
			}
		},
		[]
	);

	// Delete mission
	// Jan 2026: SSE mission.deleted event will invalidate cache automatically
	const handleDelete = useCallback(
		async (slug: string) => {
			if (!confirm(`Delete mission "${slug}"? This cannot be undone.`)) return;

			try {
				const response = await fetch(`${API_BASE}/api/missions/${slug}`, { method: 'DELETE' });
				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.detail || 'Failed to delete mission');
				}
				// SSE event will invalidate cache
			} catch (err) {
				console.error('Failed to delete mission:', err);
			}
		},
		[]
	);

	// Create mission
	// Jan 2026: SSE mission.created event will invalidate cache automatically
	const handleCreate = useCallback(
		async (form: CreateMissionForm) => {
			const response = await fetch(`${API_BASE}/api/missions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: form.name,
					slug: form.slug,
					description: form.description || null,
					prompt_file: form.prompt_file,
					schedule_type: form.schedule_type,
					schedule_time: form.schedule_type === 'time' ? form.schedule_time : null,
					schedule_cron: form.schedule_type === 'cron' ? form.schedule_cron : null,
					timeout_minutes: form.timeout_minutes,
					role: form.role,
					mode: form.mode,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.detail || 'Failed to create mission');
			}
			// SSE event will invalidate cache
		},
		[]
	);

	// Run duty now (Chief duties)
	const handleRunDuty = useCallback(
		async (slug: string) => {
			try {
				const response = await fetch(`${API_BASE}/api/duties/${slug}/run`, { method: 'POST' });
				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.detail || 'Failed to run duty');
				}
				// SSE event will invalidate cache
			} catch (err) {
				console.error('Failed to run duty:', err);
			}
		},
		[]
	);

	// Group missions
	const groupedMissions = useMemo(() => {
		const groups: Record<string, Mission[]> = {
			core: [],
			app: [],
			user: [],
		};

		for (const m of missions) {
			if (m.source === 'core_default') {
				groups.core.push(m);
			} else if (m.source === 'custom_app') {
				groups.app.push(m);
			} else {
				groups.user.push(m);
			}
		}

		return groups;
	}, [missions]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="w-8 h-8 animate-spin" style={{ color: CLAUDE_CORAL }} />
					<span className="text-sm text-gray-500">Loading missions...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900">
			{/* Header */}
			<div
				className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"
				style={{ background: `linear-gradient(135deg, ${CLAUDE_CORAL}08 0%, transparent 100%)` }}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-xl" style={{ backgroundColor: `${CLAUDE_CORAL}15` }}>
							<Rocket className="w-5 h-5" style={{ color: CLAUDE_CORAL }} />
						</div>
						<div>
							<h2 className="font-semibold text-gray-800 dark:text-gray-100">Missions</h2>
							<p className="text-xs text-gray-500 dark:text-gray-400">Autonomous scheduled work</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => refetchMissions()}
							className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
							title="Refresh"
						>
							<RefreshCw className="w-4 h-4" />
						</button>
						<button
							onClick={() => setShowCreateModal(true)}
							className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90"
							style={{ backgroundColor: CLAUDE_CORAL }}
						>
							<Plus className="w-4 h-4" />
							New Mission
						</button>
					</div>
				</div>
			</div>

			{/* Running banner */}
			<RunningBanner executions={runningExecutions} missions={missions} />

			{/* Error banner */}
			{error && (
				<div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2 border border-red-200 dark:border-red-800">
					<AlertCircle className="w-4 h-4" />
					{error}
					<button onClick={() => refetchMissions()} className="ml-auto hover:text-red-800 dark:hover:text-red-200" title="Retry">
						<RefreshCw className="w-4 h-4" />
					</button>
				</div>
			)}

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-6">
				{/* Chief Duties (critical scheduled Chief work) */}
				<ChiefDutiesSection
					duties={duties}
					runningDuties={runningDuties}
					isLoading={dutiesLoading}
					onRunNow={handleRunDuty}
				/>

				{/* Core missions */}
				{groupedMissions.core.length > 0 && (
					<section>
						<h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
							<Shield className="w-4 h-4" style={{ color: CLAUDE_CORAL }} />
							Core Missions
						</h3>
						<div className="space-y-2">
							{groupedMissions.core.map((m) => (
								<MissionCard
									key={m.id}
									mission={m}
									onToggle={() => handleToggle(m.slug, m.enabled)}
									onRunNow={() => handleRunNow(m.slug)}
									isExpanded={expandedSlug === m.slug}
									toggleExpanded={() => handleToggleExpand(m.slug)}
									history={historyCache[m.slug] || []}
									isLoadingHistory={loadingHistory === m.slug}
								/>
							))}
						</div>
					</section>
				)}

				{/* App missions */}
				{groupedMissions.app.length > 0 && (
					<section>
						<h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
							<Zap className="w-4 h-4 text-purple-500" />
							App Missions
						</h3>
						<div className="space-y-2">
							{groupedMissions.app.map((m) => (
								<MissionCard
									key={m.id}
									mission={m}
									onToggle={() => handleToggle(m.slug, m.enabled)}
									onRunNow={() => handleRunNow(m.slug)}
									isExpanded={expandedSlug === m.slug}
									toggleExpanded={() => handleToggleExpand(m.slug)}
									history={historyCache[m.slug] || []}
									isLoadingHistory={loadingHistory === m.slug}
								/>
							))}
						</div>
					</section>
				)}

				{/* User missions */}
				{groupedMissions.user.length > 0 && (
					<section>
						<h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
							<Sun className="w-4 h-4 text-emerald-500" />
							Custom Missions
						</h3>
						<div className="space-y-2">
							{groupedMissions.user.map((m) => (
								<MissionCard
									key={m.id}
									mission={m}
									onToggle={() => handleToggle(m.slug, m.enabled)}
									onRunNow={() => handleRunNow(m.slug)}
									onEdit={() => {
										/* TODO: Edit modal */
									}}
									onDelete={() => handleDelete(m.slug)}
									isExpanded={expandedSlug === m.slug}
									toggleExpanded={() => handleToggleExpand(m.slug)}
									history={historyCache[m.slug] || []}
									isLoadingHistory={loadingHistory === m.slug}
								/>
							))}
						</div>
					</section>
				)}

				{/* Empty state */}
				{missions.length === 0 && (
					<div className="flex flex-col items-center justify-center py-16 text-center">
						<div
							className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
							style={{ backgroundColor: `${CLAUDE_CORAL}15` }}
						>
							<Rocket className="w-8 h-8" style={{ color: CLAUDE_CORAL }} />
						</div>
						<h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">No Missions Yet</h3>
						<p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
							Missions run autonomously on schedule. Core missions will appear after database initialization.
						</p>
						<button
							onClick={() => setShowCreateModal(true)}
							className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-all hover:opacity-90"
							style={{ backgroundColor: CLAUDE_CORAL }}
						>
							<Plus className="w-4 h-4" />
							Create Your First Mission
						</button>
					</div>
				)}
			</div>

			{/* Create modal */}
			<CreateMissionModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} />
		</div>
	);
}
