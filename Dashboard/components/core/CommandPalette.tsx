'use client';

import { useState, useCallback, useMemo, useRef, memo, useLayoutEffect } from 'react';
import { Search, Command, X, CornerDownLeft } from 'lucide-react';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  category: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

// Simple fuzzy match function
function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Direct substring match
  if (lowerText.includes(lowerQuery)) return true;

  // Fuzzy match - all query chars must appear in order
  let queryIdx = 0;
  for (const char of lowerText) {
    if (char === lowerQuery[queryIdx]) {
      queryIdx++;
      if (queryIdx === lowerQuery.length) return true;
    }
  }
  return false;
}

function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  // Filter and group commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    return commands.filter(cmd => {
      const searchText = [cmd.title, cmd.description, ...(cmd.keywords || [])].join(' ');
      return fuzzyMatch(searchText, query);
    });
  }, [commands, query]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  const flatList = useMemo(() => filteredCommands, [filteredCommands]);

  // Focus input when opening
  useLayoutEffect(() => {
    if (isOpen) {
      // Focus after a frame to ensure element is rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Reset query when dialog opens (from close->open transition)
  // This is done in a callback from the parent or via key prop
  const handleReset = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Keep selected item in view
  useLayoutEffect(() => {
    const selectedElement = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Check if we need to reset on open
  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    if (isOpen && !wasOpen) {
      // Just opened - schedule reset for next frame to avoid the lint warning
      requestAnimationFrame(handleReset);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, handleReset]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          flatList[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [flatList, selectedIndex, onClose]);

  // Lock body scroll when open
  useLayoutEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[var(--z-modal-backdrop)] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Command Palette */}
      <div
        id="modal-command-palette"
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[95%] max-w-[560px] z-[var(--z-modal)] animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="bg-[var(--cmd-bg)] border border-[var(--cmd-border)] rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
            <Search className="w-5 h-5 text-[var(--color-claude)]/70 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] focus:outline-none"
              aria-label="Search commands"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 hover:bg-[var(--surface-muted)] rounded transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
              </button>
            )}
            <div className="flex items-center gap-1">
              <kbd className="kbd">esc</kbd>
            </div>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[360px] overflow-y-auto py-2"
            role="listbox"
          >
            {flatList.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-[var(--text-tertiary)] text-sm">No commands found</div>
                <div className="text-[var(--text-muted)] text-xs mt-1">Try a different search term</div>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {category}
                  </div>
                  {items.map(item => {
                    const globalIndex = flatList.findIndex(i => i.id === item.id);
                    const isSelected = globalIndex === selectedIndex;

                    return (
                      <button
                        key={item.id}
                        id={`cmd-${item.id}`}
                        data-index={globalIndex}
                        onClick={() => {
                          item.action();
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-[var(--cmd-item-active)] text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--cmd-item-hover)]'
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        {item.icon && (
                          <span className={`flex-shrink-0 ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--text-muted)]'}`}>
                            {item.icon}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.title}</div>
                          {item.description && (
                            <div className="text-xs text-[var(--text-muted)] truncate">{item.description}</div>
                          )}
                        </div>
                        {item.shortcut && item.shortcut.length > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {item.shortcut.map((key, idx) => (
                              <kbd key={idx} className="kbd">{key}</kbd>
                            ))}
                          </div>
                        )}
                        {isSelected && (
                          <CornerDownLeft className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="kbd">↑</kbd>
                <kbd className="kbd">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">↵</kbd>
                select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Command className="w-3 h-3" />
              <span>K to open</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(CommandPalette);
