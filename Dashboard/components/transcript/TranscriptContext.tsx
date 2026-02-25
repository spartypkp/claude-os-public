'use client';

/**
 * TranscriptContext - Provides session context to nested transcript components.
 *
 * AgentSpawnCards need the active session ID to resolve subagent transcripts,
 * but they're deeply nested inside TurnBlock -> ToolOneLiner. Rather than
 * prop-drilling, we use context.
 */

import { createContext, useContext } from 'react';

interface TranscriptSessionContext {
	activeSessionId: string | null;
}

const TranscriptContext = createContext<TranscriptSessionContext>({
	activeSessionId: null,
});

export const TranscriptProvider = TranscriptContext.Provider;

export function useTranscriptSession() {
	return useContext(TranscriptContext);
}
