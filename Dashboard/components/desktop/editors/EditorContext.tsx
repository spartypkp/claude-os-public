'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type EditorType = 'markdown' | 'code' | 'plaintext';

interface EditorState {
	/** Which editor is rendering — drives PathBar control rendering */
	editorType: EditorType | null;
	/** Whether the editor is in edit mode vs view mode */
	isEditing: boolean;
	/** Whether there are unsaved changes */
	hasChanges: boolean;
	/** Whether the file is currently being saved */
	isSaving: boolean;
	/** Whether there's a conflict with external changes */
	hasConflict: boolean;
	/** Whether the file is read-only (system file) */
	isReadOnly: boolean;
	/** Whether the file is too large for editing */
	isLargeFile: boolean;
	/** Whether word wrap is enabled (plain text) */
	wordWrap: boolean;
	/** Language badge text (for code files) */
	language: string | null;
}

interface EditorActions {
	setEditorType: (type: EditorType | null) => void;
	setIsEditing: (editing: boolean) => void;
	setHasChanges: (changes: boolean) => void;
	setIsSaving: (saving: boolean) => void;
	setHasConflict: (conflict: boolean) => void;
	setIsReadOnly: (readOnly: boolean) => void;
	setIsLargeFile: (large: boolean) => void;
	setWordWrap: (wrap: boolean) => void;
	setLanguage: (lang: string | null) => void;
	/** Reset all state — call on editor unmount to prevent stale state flash */
	resetState: () => void;
}

const EditorContext = createContext<(EditorState & EditorActions) | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
	const [editorType, setEditorType] = useState<EditorType | null>(null);
	const [isEditing, setIsEditing] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasConflict, setHasConflict] = useState(false);
	const [isReadOnly, setIsReadOnly] = useState(false);
	const [isLargeFile, setIsLargeFile] = useState(false);
	const [wordWrap, setWordWrap] = useState(true);
	const [language, setLanguage] = useState<string | null>(null);

	const resetState = useCallback(() => {
		setEditorType(null);
		setIsEditing(false);
		setHasChanges(false);
		setIsSaving(false);
		setHasConflict(false);
		setIsReadOnly(false);
		setIsLargeFile(false);
		setWordWrap(true);
		setLanguage(null);
	}, []);

	return (
		<EditorContext.Provider value={{
			editorType, isEditing, hasChanges, isSaving, hasConflict, isReadOnly, isLargeFile, wordWrap, language,
			setEditorType, setIsEditing, setHasChanges, setIsSaving, setHasConflict, setIsReadOnly, setIsLargeFile, setWordWrap, setLanguage, resetState,
		}}>
			{children}
		</EditorContext.Provider>
	);
}

export function useEditorContext() {
	return useContext(EditorContext);
}
