'use client';

import type { TaskItem } from '@/hooks/useClaudeConversation';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, ListChecks, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface TaskListPanelProps {
	tasks: TaskItem[];
	collapsible?: boolean;
	defaultExpanded?: boolean;
}

/**
 * Task list panel showing Claude's todo checklist.
 * 
 * Reads from Claude Code's todo files (~/.claude/todos/{uuid}.json)
 * and displays the task list with live status updates.
 */
export function TaskListPanel({
	tasks,
	collapsible = true,
	defaultExpanded = true,
}: TaskListPanelProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	// Don't render if no tasks
	if (tasks.length === 0) {
		return null;
	}

	// Count tasks by status
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
				<span className="text-[10px] text-[var(--text-muted)] ml-auto">
					{completed}/{total}
				</span>
			</button>

			{/* Task list */}
			{isExpanded && (
				<div className="px-3 pb-2 space-y-1">
					{tasks.map((task, index) => (
						<TaskRow key={`${task.content}-${index}`} task={task} />
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Individual task row
 */
function TaskRow({ task }: { task: TaskItem; }) {
	const isCompleted = task.status === 'completed';
	const isInProgress = task.status === 'in_progress';

	return (
		<div className="flex items-start gap-2 py-0.5">
			{/* Status icon */}
			<div className="flex-shrink-0 mt-0.5">
				{isCompleted ? (
					<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
				) : isInProgress ? (
					<Loader2 className="w-3.5 h-3.5 text-[#da7756] animate-spin" />
				) : (
					<Circle className="w-3.5 h-3.5 text-[var(--text-muted)]" />
				)}
			</div>

			{/* Task content */}
			<span
				className={`
          text-xs leading-snug
          ${isCompleted
						? 'text-[var(--text-muted)] line-through'
						: isInProgress
							? 'text-[var(--text-primary)] font-medium'
							: 'text-[var(--text-secondary)]'
					}
        `}
			>
				{task.content}
			</span>
		</div>
	);
}

export default TaskListPanel;

