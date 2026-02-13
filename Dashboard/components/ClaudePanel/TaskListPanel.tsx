'use client';

import type { TaskItem } from '@/hooks/useConversation';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, ListChecks, Loader2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

interface TaskListPanelProps {
	tasks: TaskItem[];
	collapsible?: boolean;
	defaultExpanded?: boolean;
}

/**
 * Task list panel showing Claude's active tasks.
 *
 * Reads from Claude Code's task files (~/.claude/tasks/{uuid}/*.json)
 * and displays the task list with live status updates.
 */
export function TaskListPanel({
	tasks,
	collapsible = true,
	defaultExpanded = true,
}: TaskListPanelProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	if (tasks.length === 0) {
		return null;
	}

	const completed = tasks.filter(t => t.status === 'completed').length;
	const inProgress = tasks.filter(t => t.status === 'in_progress').length;
	const total = tasks.length;

	return (
		<div className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/50">
			{/* Header */}
			<button
				onClick={() => collapsible && setIsExpanded(!isExpanded)}
				disabled={!collapsible}
				className={`
          w-full px-3 py-1.5 flex items-center gap-2
          ${collapsible ? 'hover:bg-[var(--surface-accent)]/50 cursor-pointer' : 'cursor-default'}
          transition-colors
        `}
			>
				{collapsible && (
					isExpanded
						? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
						: <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
				)}
				<ListChecks className="w-3 h-3 text-[var(--text-muted)]" />
				<span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-medium">
					Tasks
				</span>
				{inProgress > 0 && (
					<span className="text-[9px] text-[#da7756] bg-[#da7756]/10 px-1.5 py-0.5 rounded-full font-medium">
						{inProgress} active
					</span>
				)}
				<span className="text-[10px] text-[var(--text-muted)] ml-auto">
					{completed}/{total}
				</span>
			</button>

			{/* Task list */}
			{isExpanded && (
				<div className="px-3 pb-2 space-y-0.5">
					{tasks.map((task, index) => (
						<TaskRow key={task.id || `${task.content}-${index}`} task={task} />
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Individual task row
 */
function TaskRow({ task }: { task: TaskItem }) {
	const isCompleted = task.status === 'completed';
	const isInProgress = task.status === 'in_progress';
	const isBlocked = task.blockedBy && task.blockedBy.length > 0;
	const displayText = task.subject || task.content;

	return (
		<div className="flex items-center gap-1.5 py-0.5 group">
			{/* Status icon */}
			<div className="flex-shrink-0">
				{isCompleted ? (
					<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
				) : isInProgress ? (
					<Loader2 className="w-3.5 h-3.5 text-[#da7756] animate-spin" />
				) : (
					<Circle className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				)}
			</div>

			{/* Task ID */}
			{task.id && (
				<span className="text-[9px] font-mono text-[var(--text-muted)] flex-shrink-0 w-4 text-right">
					#{task.id}
				</span>
			)}

			{/* Task content — show activeForm when in progress, subject otherwise */}
			<span
				className={`
					text-xs leading-snug truncate
					${isCompleted
						? 'text-[var(--text-muted)] line-through'
						: isInProgress
							? 'text-[var(--text-primary)] font-medium'
							: 'text-[var(--text-secondary)]'
					}
				`}
				title={task.description || displayText}
			>
				{isInProgress && task.activeForm ? task.activeForm : displayText}
			</span>

			{/* Blocked indicator */}
			{isBlocked && !isCompleted && (
				<span className="flex items-center gap-0.5 text-[9px] text-[var(--color-warning)] flex-shrink-0 ml-auto">
					<ShieldAlert className="w-2.5 h-2.5" />
					blocked
				</span>
			)}
		</div>
	);
}

export default TaskListPanel;
