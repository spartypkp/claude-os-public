'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  FileText,
  BookOpen,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  XCircle,
  RefreshCw,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { fetchSystemDocs, fetchFileContent } from '@/lib/api';
import { SystemDocsData, SystemDocFile, FileContent } from '@/lib/types';

const SCROLL_STEP = 60;

// Doc category section
function DocCategory({
  title,
  icon,
  files,
  selectedPath,
  onSelect,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ReactNode;
  files: SystemDocFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (files.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] rounded-md transition-colors"
      >
        <span className="text-[var(--text-muted)]">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="text-[var(--color-warning)]">
          {expanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </span>
        <span className="flex-1 text-left">{title}</span>
        <span className="text-xs text-[var(--text-muted)]">{files.length}</span>
      </button>

      {expanded && (
        <div className="ml-4 space-y-0.5 mt-0.5">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => file.exists && onSelect(file.path)}
              disabled={!file.exists}
              className={`
                w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors
                ${!file.exists
                  ? 'opacity-40 cursor-not-allowed'
                  : selectedPath === file.path
                    ? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              {file.path.endsWith('LIFE-SPEC.md') ? (
                <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
              ) : file.path.endsWith('CLAUDE.md') ? (
                <FileText className="w-4 h-4 text-[var(--color-info)]" />
              ) : (
                <FileText className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <span className="flex-1 text-left truncate">{file.name}</span>
              {file.lines && (
                <span className="text-xs text-[var(--text-muted)] tabular-nums">{file.lines}L</span>
              )}
              {!file.exists && (
                <span className="text-xs text-[var(--text-muted)]">N/A</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocsTab() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<SystemDocsData | null>(null);

  // Selected file state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [copied, setCopied] = useState(false);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingGRef = useRef(false);
  const gTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load docs list
  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchSystemDocs();
      setDocs(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load docs:', err);
      setError('Failed to load system documentation');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadDocs();
  }, [mounted, loadDocs]);

  // Load file content when selected
  const loadFileContent = useCallback(async (path: string) => {
    setFileLoading(true);
    setFileError(null);
    try {
      const data = await fetchFileContent(path);
      setFileContent(data);
    } catch (err) {
      console.error('Failed to load file:', err);
      setFileError('Failed to load file');
    } finally {
      setFileLoading(false);
    }
  }, []);

  // Handle file selection
  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
    loadFileContent(path);
    setScrollPercent(0);
  }, [loadFileContent]);

  // Copy path to clipboard
  const handleCopyPath = useCallback(async () => {
    if (!selectedPath) return;
    try {
      await navigator.clipboard.writeText(selectedPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [selectedPath]);

  // Track scroll position
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      const percent = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * 100) : 0;
      setScrollPercent(percent);
    };

    el.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [fileContent]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!selectedPath) return;

      const el = contentRef.current;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          el?.scrollBy({ top: SCROLL_STEP, behavior: 'smooth' });
          break;

        case 'k':
          e.preventDefault();
          el?.scrollBy({ top: -SCROLL_STEP, behavior: 'smooth' });
          break;

        case 'g':
          e.preventDefault();
          if (pendingGRef.current) {
            el?.scrollTo({ top: 0, behavior: 'smooth' });
            pendingGRef.current = false;
            if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
          } else {
            pendingGRef.current = true;
            gTimeoutRef.current = setTimeout(() => {
              pendingGRef.current = false;
            }, 500);
          }
          break;

        case 'G':
          e.preventDefault();
          if (el) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }
          pendingGRef.current = false;
          break;

        case 'Escape':
          e.preventDefault();
          setSelectedPath(null);
          setFileContent(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
    };
  }, [selectedPath]);

  if (!mounted || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-[var(--color-error)]" />
          <p className="text-[var(--text-secondary)] mb-4">{error}</p>
          <button onClick={loadDocs} className="btn btn-ghost flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - File Tree */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">System Documentation</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Prompts and specifications</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {docs && (
            <>
              <DocCategory
                title="System Prompts"
                icon={<BookOpen className="w-4 h-4" />}
                files={docs.system_prompts}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
              />
              <DocCategory
                title="Roles"
                icon={<Folder className="w-4 h-4" />}
                files={docs.roles}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
              />
              <DocCategory
                title="Modes"
                icon={<Folder className="w-4 h-4" />}
                files={docs.modes}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
              />
              <DocCategory
                title="System Architecture"
                icon={<Folder className="w-4 h-4" />}
                files={docs.system_specs}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
              />
              <DocCategory
                title="Application SPECs"
                icon={<Folder className="w-4 h-4" />}
                files={docs.application_specs}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
              />
            </>
          )}
        </div>
      </div>

      {/* Right Panel - Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-sunken)]">
        {selectedPath ? (
          <>
            {/* File Header */}
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-base)] flex items-center gap-3">
              {selectedPath.endsWith('LIFE-SPEC.md') ? (
                <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
              ) : selectedPath.endsWith('CLAUDE.md') ? (
                <FileText className="w-4 h-4 text-[var(--color-info)]" />
              ) : (
                <FileText className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                {selectedPath.split('/').pop()}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono truncate flex-1">
                {selectedPath}
              </span>
              <button
                onClick={handleCopyPath}
                className="btn btn-ghost btn-icon-sm"
                title="Copy path"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[var(--color-success)]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <span className="text-xs text-[var(--text-muted)] tabular-nums w-8 text-right">
                {scrollPercent}%
              </span>
              <button
                onClick={() => { setSelectedPath(null); setFileContent(null); }}
                className="btn btn-ghost btn-icon-sm"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File Content */}
            {fileLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : fileError ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <XCircle className="w-10 h-10 mx-auto mb-3 text-[var(--color-error)]" />
                  <p className="text-sm text-[var(--text-secondary)]">{fileError}</p>
                </div>
              </div>
            ) : fileContent ? (
              <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{fileContent.content}</ReactMarkdown>
                </div>
              </div>
            ) : null}

            {/* Keyboard hints */}
            <div className="flex-shrink-0 px-4 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--surface-base)] flex items-center gap-4 text-xs text-[var(--text-muted)]">
              <span><kbd className="kbd">j</kbd>/<kbd className="kbd">k</kbd> scroll</span>
              <span><kbd className="kbd">gg</kbd> top</span>
              <span><kbd className="kbd">G</kbd> bottom</span>
              <span><kbd className="kbd">Esc</kbd> close</span>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
              <p className="text-[var(--text-tertiary)] text-sm">Select a document to view</p>
              <p className="text-[var(--text-muted)] text-xs mt-1">System prompts and architecture specs</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocsTab;
