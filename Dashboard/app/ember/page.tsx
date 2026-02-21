"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import EmberVisualization from "./components/EmberVisualization";
import GrowthTimeline from "./components/GrowthTimeline";
import NotesPanel from "./components/NotesPanel";
import MoodHistory from "./components/MoodHistory";
import QuickActions from "./components/QuickActions";

interface EmberState {
  name: string;
  trace_count: number;
  stage: string;
  stage_description: string;
  mood: string;
  mood_color: string;
  last_fed: string | null;
  last_interaction: string | null;
  last_note: string | null;
  created_at: string;
}

interface Note {
  direction: string;
  message: string;
  created_at: string;
}

interface MoodEntry {
  mood: string;
  color: string;
  trigger: string | null;
  recorded_at: string;
}

export default function EmberPage() {
  const [state, setState] = useState<EmberState | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmberState = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ember/state`);
      if (!response.ok) {
        throw new Error("Failed to fetch Ember state");
      }
      const data = await response.json();
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ember/history`);
      if (!response.ok) {
        throw new Error("Failed to fetch Ember history");
      }
      const data = await response.json();
      setNotes(data.notes || []);
      setMoodHistory(data.mood_history || []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchEmberState(), fetchHistory()]);
    setLoading(false);
  };

  const handleNoteSubmit = async (message: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/ember/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit note");
      }

      // Refresh to show new note
      await handleRefresh();
    } catch (err) {
      console.error("Failed to submit note:", err);
    }
  };

  const handlePlay = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ember/play`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to play");
      }

      // Refresh to show new state
      await handleRefresh();
    } catch (err) {
      console.error("Failed to play:", err);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  if (loading && !state) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-orange-400 text-xl">Loading Ember...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400 text-xl">Error: {error}</div>
      </div>
    );
  }

  if (!state) {
    return null;
  }

  return (
    <div data-testid="app-ember" className="flex flex-col h-full p-6">
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4">
        {/* Left Panel - Growth Timeline */}
        <div className="col-span-3 min-h-0">
          <GrowthTimeline
            traceCount={state.trace_count}
            stage={state.stage}
            createdAt={state.created_at}
          />
        </div>

        {/* Center - Ember Visualization */}
        <div className="col-span-6 flex flex-col min-h-0">
          <div className="flex-1 flex items-center justify-center">
            <EmberVisualization
              stage={state.stage}
              mood={state.mood}
              moodColor={state.mood_color}
            />
          </div>

          {/* Ember's current note */}
          {state.last_note && (
            <div className="text-center text-orange-300 text-lg italic mb-4">
              "{state.last_note}"
            </div>
          )}

          {/* Quick Actions */}
          <QuickActions
            onNoteSubmit={handleNoteSubmit}
            onPlay={handlePlay}
            onRefresh={handleRefresh}
          />
        </div>

        {/* Right Panel - Notes and Mood */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0">
            <NotesPanel notes={notes} />
          </div>
          <div className="h-48">
            <MoodHistory history={moodHistory} />
          </div>
        </div>
      </div>
    </div>
  );
}
