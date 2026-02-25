/**
 * File Mention Hook
 *
 * Detects '@' trigger in a textarea, tracks the query,
 * fetches + filters the file tree, and manages keyboard navigation.
 *
 * Usage:
 *   const mention = useFileMention({ textareaRef, onSelect });
 *   // In textarea onChange: call mention.handleChange(e)
 *   // In textarea onKeyDown: call mention.handleKeyDown(e) BEFORE other handlers
 *   // Render <FileMentionMenu {...mention.menuProps} /> when mention.isOpen
 */

import { fetchFileTree } from '@/lib/api';
import { FileTreeNode } from '@/lib/types';
import getCaretCoordinates from 'textarea-caret';
import { KeyboardEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface FlatFileEntry {
	name: string;
	path: string;
	/** Desktop-relative path for display and matching (e.g. "job-search/prep.md") */
	displayPath: string;
	type: 'file' | 'directory';
	/** Display path segments for breadcrumb rendering */
	segments: string[];
}

export interface MentionMenuProps {
	items: FlatFileEntry[];
	selectedIndex: number;
	position: { top: number; left: number } | null;
	onSelect: (item: FlatFileEntry) => void;
	onHover: (index: number) => void;
}

interface UseFileMentionOptions {
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	onSelect: (path: string) => void;
}

interface UseFileMentionReturn {
	isOpen: boolean;
	query: string;
	menuProps: MentionMenuProps;
	handleChange: (value: string, cursorPos: number) => void;
	handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
	close: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_RESULTS = 15;
const TREE_CACHE_MS = 30_000; // Re-fetch tree at most every 30s

/** Folders hidden from default view and search results */
const HIDDEN_FOLDERS = new Set(['conversations', 'logs', '.trash', 'Scheduled']);

// =============================================================================
// HELPERS
// =============================================================================

/** Flatten a FileTreeNode[] into a flat list of entries, skipping noise folders */
function flattenTree(nodes: FileTreeNode[], parentSegments: string[] = []): FlatFileEntry[] {
	const result: FlatFileEntry[] = [];

	for (const node of nodes) {
		const segments = [...parentSegments, node.name];

		// Skip hidden folders and all their children
		if (node.type === 'directory' && HIDDEN_FOLDERS.has(node.name)) continue;

		// Desktop-relative path: skip the leading "Desktop" segment
		const displayPath = segments.slice(1).join('/');
		result.push({
			name: node.name,
			path: node.path,
			displayPath,
			type: node.type,
			segments,
		});
		if (node.children) {
			result.push(...flattenTree(node.children, segments));
		}
	}

	return result;
}

/** Case-insensitive substring or fuzzy match on name only */
function nameMatches(query: string, name: string): boolean {
	const q = query.toLowerCase();
	const n = name.toLowerCase();

	// Substring match (always checked)
	if (n.includes(q)) return true;

	// Fuzzy only for longer queries (4+ chars) to avoid false positives
	if (q.length < 4) return false;

	let qi = 0;
	for (let ni = 0; ni < n.length && qi < q.length; ni++) {
		if (n[ni] === q[qi]) qi++;
	}
	return qi === q.length;
}

/** Check if entry matches the query — name fuzzy + path substring */
function entryMatches(query: string, entry: FlatFileEntry): boolean {
	if (nameMatches(query, entry.name)) return true;
	// Path matching: strict includes only (no fuzzy to avoid false positives)
	return entry.displayPath.toLowerCase().includes(query.toLowerCase());
}

/** Score a match — lower is better. Prefers prefix matches and shorter paths. */
function matchScore(query: string, entry: FlatFileEntry): number {
	const q = query.toLowerCase();
	const name = entry.name.toLowerCase();

	// Exact name match = best
	if (name === q) return 0;
	// Name starts with query
	if (name.startsWith(q)) return 1;
	// Name contains query
	if (name.includes(q)) return 2;
	// Name fuzzy match
	if (nameMatches(q, name)) return 3;
	// Path contains query
	if (entry.displayPath.toLowerCase().includes(q)) return 4;
	return 5;
}

// =============================================================================
// HOOK
// =============================================================================

export function useFileMention({ textareaRef, onSelect }: UseFileMentionOptions): UseFileMentionReturn {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

	// File tree cache
	const [flatFiles, setFlatFiles] = useState<FlatFileEntry[]>([]);
	const lastFetchRef = useRef(0);
	const fetchingRef = useRef(false);

	// Track the cursor position where @ was typed
	const triggerPosRef = useRef<number>(-1);

	// Fetch and cache file tree
	const ensureTree = useCallback(async () => {
		const now = Date.now();
		if (flatFiles.length > 0 && now - lastFetchRef.current < TREE_CACHE_MS) return;
		if (fetchingRef.current) return;

		fetchingRef.current = true;
		try {
			const response = await fetchFileTree();
			// Flatten starting from Desktop's children (skip the Desktop root node itself)
			const rootChildren = response.tree?.[0]?.children || response.tree || [];
			const flat = flattenTree(rootChildren, ['Desktop']);
			setFlatFiles(flat);
			lastFetchRef.current = Date.now();
		} catch {
			// Silently fail — menu just won't have items
		} finally {
			fetchingRef.current = false;
		}
	}, [flatFiles.length]);

	// Filter items based on query
	const filteredItems = useMemo(() => {
		if (!query) {
			// No query — show Desktop's direct children (files first, then folders)
			return flatFiles
				.filter(f => f.segments.length === 2)
				.sort((a, b) => {
					if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
					return a.name.localeCompare(b.name);
				})
				.slice(0, MAX_RESULTS);
		}

		return flatFiles
			.filter(f => entryMatches(query, f))
			.sort((a, b) => matchScore(query, a) - matchScore(query, b))
			.slice(0, MAX_RESULTS);
	}, [flatFiles, query]);

	// Reset selected index when items change
	useEffect(() => {
		setSelectedIndex(0);
	}, [filteredItems.length, query]);

	// Calculate dropdown position from caret
	const updatePosition = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea || triggerPosRef.current < 0) return;

		const caret = getCaretCoordinates(textarea, triggerPosRef.current);
		const rect = textarea.getBoundingClientRect();

		setPosition({
			top: rect.top + caret.top - textarea.scrollTop,
			left: rect.left + caret.left,
		});
	}, [textareaRef]);

	// Close the menu
	const close = useCallback(() => {
		setIsOpen(false);
		setQuery('');
		setSelectedIndex(0);
		triggerPosRef.current = -1;
		setPosition(null);
	}, []);

	// Handle text changes — detect @ trigger and update query
	const handleChange = useCallback((value: string, cursorPos: number) => {
		// Look for @ trigger before cursor
		const textBefore = value.slice(0, cursorPos);
		const match = textBefore.match(/@([^\s@]*)$/);

		if (match) {
			const atPos = cursorPos - match[0].length;

			// Only trigger if @ is at start of input or preceded by whitespace
			if (atPos === 0 || /\s/.test(value[atPos - 1])) {
				if (!isOpen) {
					triggerPosRef.current = atPos;
					ensureTree();
				}
				setIsOpen(true);
				setQuery(match[1]);
				// Recalculate position
				setTimeout(() => updatePosition(), 0);
				return;
			}
		}

		// No trigger found — close if open
		if (isOpen) {
			close();
		}
	}, [isOpen, ensureTree, updatePosition, close]);

	// Handle selection
	const handleSelect = useCallback((item: FlatFileEntry) => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		// Remove the @query from the textarea value
		const value = textarea.value;
		const triggerPos = triggerPosRef.current;
		if (triggerPos < 0) return;

		const before = value.slice(0, triggerPos);
		const afterQuery = value.slice(triggerPos + 1 + query.length); // +1 for the @
		const newValue = before + afterQuery;

		// Use nativeInputValueSetter to preserve React's controlled state
		const nativeSetter = Object.getOwnPropertyDescriptor(
			window.HTMLTextAreaElement.prototype, 'value'
		)?.set;
		if (nativeSetter) {
			nativeSetter.call(textarea, newValue);
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
		}

		// Set cursor position
		const newCursorPos = triggerPos;
		textarea.setSelectionRange(newCursorPos, newCursorPos);

		// Attach the file
		onSelect(item.path);
		close();
		textarea.focus();
	}, [textareaRef, query, onSelect, close]);

	// Handle keyboard navigation
	const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
		if (!isOpen || filteredItems.length === 0) return false;

		// Guard against IME composition
		if (e.nativeEvent.isComposing) return false;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				setSelectedIndex(prev => (prev + 1) % filteredItems.length);
				return true;

			case 'ArrowUp':
				e.preventDefault();
				setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
				return true;

			case 'Tab':
			case 'Enter':
				e.preventDefault();
				e.stopPropagation();
				handleSelect(filteredItems[selectedIndex]);
				return true;

			case 'Escape':
				e.preventDefault();
				close();
				return true;

			default:
				return false;
		}
	}, [isOpen, filteredItems, selectedIndex, handleSelect, close]);

	// Close on click outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('[data-file-mention-menu]')) {
				close();
			}
		};

		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [isOpen, close]);

	const menuProps: MentionMenuProps = {
		items: filteredItems,
		selectedIndex,
		position,
		onSelect: handleSelect,
		onHover: setSelectedIndex,
	};

	return {
		isOpen,
		query,
		menuProps,
		handleChange,
		handleKeyDown,
		close,
	};
}
