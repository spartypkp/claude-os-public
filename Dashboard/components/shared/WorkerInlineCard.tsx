'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { useWorkerOutput } from '@/hooks/useWorkerOutput';
import { formatElapsedTime } from '@/hooks/useWorkers';
import { useWorkerStatusQuery } from '@/hooks/queries/useWorkerStatusQuery';

interface WorkerInlineCardProps {
  workerId: string;
  shortId?: string;
  title?: string;
  status?: string;
  createdAt?: string;
  instructionsPreview?: string;
  onClick?: () => void;
}

export function WorkerInlineCard({
  workerId,
  shortId,
  title,
  status: initialStatus,
  createdAt,
  instructionsPreview,
  onClick,
}: WorkerInlineCardProps) {
  const displayId = shortId || workerId.slice(0, 8);
  const [isExpanded, setIsExpanded] = useState(false);
  const activityRef = useRef<HTMLPreElement>(null);
  
  // Jan 2026: Use React Query instead of polling
  // SSE events will invalidate when worker completes
  const needsStatusFetch = !initialStatus || initialStatus === 'running' || initialStatus === 'pending';
  const { data: statusData } = useWorkerStatusQuery(workerId, needsStatusFetch);
  
  // Derive status from query or prop
  const status = statusData?.status 
    ? (statusData.status.includes('complete') ? 'complete' :
       statusData.status.includes('failed') ? 'failed' : 'running')
    : initialStatus;
  
  const isRunning = status === 'running' || status === 'pending' || !status;
  const { activity } = useWorkerOutput(workerId, isRunning);

  // Parse last tool from activity
  const lastTool = useMemo(() => {
    if (!activity) return null;
    const lines = activity.split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event = JSON.parse(lines[i]);
        if (event.type === 'tool_start') {
          const name = event.name || event.tool || 'Tool';
          const input = event.input || {};
          // Get first meaningful value from input
          let preview = '';
          for (const v of Object.values(input)) {
            if (typeof v === 'string' && v.length > 0) {
              preview = v.split('/').pop()?.slice(0, 40) || v.slice(0, 40);
              break;
            }
          }
          return `${name}${preview ? `: ${preview}` : ''}`;
        }
      } catch { continue; }
    }
    return null;
  }, [activity]);

  // Format activity for expanded view
  const formattedActivity = useMemo(() => {
    if (!activity) return '';
    const lines = activity.split('\n').filter(l => l.trim());
    const formatted: string[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'tool_start') {
          const input = event.input ? Object.values(event.input)[0] : '';
          const short = typeof input === 'string' ? input.split('/').pop()?.slice(0, 30) : '';
          formatted.push(`→ ${event.name} ${short || ''}`);
        } else if (event.type === 'text') {
          const text = event.content?.split('\n')[0]?.slice(0, 60);
          if (text) formatted.push(text);
        } else if (event.type === 'error') {
          formatted.push(`✗ ${event.content || 'Error'}`);
        }
      } catch { if (line.trim()) formatted.push(line); }
    }
    return formatted.join('\n');
  }, [activity]);

  // Auto-scroll
  useEffect(() => {
    if (activityRef.current && isRunning) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [formattedActivity, isRunning]);

  // Elapsed time
  const [elapsed, setElapsed] = useState(createdAt ? formatElapsedTime(createdAt) : '');
  useEffect(() => {
    if (!createdAt || !isRunning) return;
    const interval = setInterval(() => setElapsed(formatElapsedTime(createdAt)), 1000);
    return () => clearInterval(interval);
  }, [createdAt, isRunning]);

  // Status icon
  const StatusIcon = status === 'complete' ? CheckCircle2 : status === 'failed' ? XCircle : Loader2;
  const statusColor = status === 'complete' ? '#10b981' : status === 'failed' ? '#ef4444' : '#da7756';

  // One-liner text
  const oneLiner = lastTool || (title ? title : `Worker ${displayId}`);

  return (
    <div className="my-1.5">
      {/* Single row card */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="
          w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
          bg-gray-50/50 dark:bg-[#252525]
          border border-gray-200/50 dark:border-[#333]
          hover:bg-gray-100/50 dark:hover:bg-[#2a2a2a]
          transition-colors
        "
      >
        {/* Status icon */}
        <StatusIcon
          className={`w-3.5 h-3.5 flex-shrink-0 ${isRunning ? 'animate-spin' : ''}`}
          style={{ color: statusColor }}
        />

        {/* Worker: Last Tool */}
        <span className="flex-1 text-xs text-gray-700 dark:text-[#ccc] truncate">
          <span className="font-medium text-gray-900 dark:text-white">Worker</span>
          <span className="mx-1.5 text-gray-400">·</span>
          {oneLiner}
        </span>

        {/* Elapsed time */}
        {elapsed && (
          <span className="text-[10px] font-mono text-gray-500 dark:text-[#888] tabular-nums flex-shrink-0">
            {elapsed}
          </span>
        )}

        {/* Chevron */}
        <ChevronRight
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1.5 ml-6 pl-3 border-l border-gray-200 dark:border-[#333]">
          {/* Instructions */}
          {instructionsPreview && (
            <p className="text-[11px] text-gray-600 dark:text-[#999] mb-2 leading-relaxed">
              {instructionsPreview}
            </p>
          )}

          {/* Activity log - only show for running workers */}
          {isRunning && formattedActivity && (
            <pre
              ref={activityRef}
              className="font-mono text-[10px] text-gray-600 dark:text-[#aaa] bg-gray-50 dark:bg-[#1a1a1a] p-2 rounded border border-gray-200 dark:border-[#2a2a2a] max-h-28 overflow-y-auto whitespace-pre-wrap"
            >
              {formattedActivity}
            </pre>
          )}

          {/* View details - only for completed workers */}
          {onClick && !isRunning && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="mt-2 text-[10px] text-gray-600 dark:text-[#aaa] hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              View report →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default WorkerInlineCard;
