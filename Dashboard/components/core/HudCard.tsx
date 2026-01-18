'use client';

import { useState, useEffect } from 'react';
import { X, FileText, GitCompare, Image } from 'lucide-react';
import { StagedItem } from '@/lib/types';
import { MermaidRenderer } from '@/components/shared/MermaidRenderer';
import { formatDistanceToNow } from 'date-fns';

interface HudCardProps {
  item: StagedItem;
  onDismiss: () => void;
}

// Get icon for content type
function ContentTypeIcon({ type }: { type: StagedItem['content_type'] }) {
  switch (type) {
    case 'mermaid':
      return <GitCompare className="w-4 h-4" />;
    case 'comparison':
      return <GitCompare className="w-4 h-4" />;
    case 'file':
      return <FileText className="w-4 h-4" />;
    default:
      return <Image className="w-4 h-4" />;
  }
}

export function HudCard({ item, onDismiss }: HudCardProps) {
  const { title, content, content_type, created_at } = item;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Format time only on client to prevent hydration mismatch
  const timeAgo = mounted
    ? formatDistanceToNow(new Date(created_at), { addSuffix: true })
    : '';

  // Render content based on type
  const renderContent = () => {
    switch (content_type) {
      case 'mermaid':
        return (
          <MermaidRenderer
            code={content}
            className="w-full"
          />
        );

      case 'markdown':
      default:
        // Simple whitespace-preserving text display
        // ReactMarkdown causes React 19 hydration issues
        return (
          <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
            {content}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-overlay)] rounded-xl border border-[var(--border-default)] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[var(--text-muted)]">
            <ContentTypeIcon type={content_type} />
          </span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {title}
          </h3>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderContent()}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <p className="text-xs text-[var(--text-muted)] tabular-nums">
          {timeAgo}
        </p>
      </div>
    </div>
  );
}

export default HudCard;
