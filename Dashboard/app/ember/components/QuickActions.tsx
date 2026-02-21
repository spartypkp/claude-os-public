"use client";

import { useState } from "react";

interface QuickActionsProps {
  onNoteSubmit: (message: string) => Promise<void>;
  onPlay: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export default function QuickActions({
  onNoteSubmit,
  onPlay,
  onRefresh,
}: QuickActionsProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitNote = async () => {
    if (!noteMessage.trim()) return;

    setSubmitting(true);
    try {
      await onNoteSubmit(noteMessage);
      setNoteMessage("");
      setShowNoteInput(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePlay = async () => {
    setSubmitting(true);
    try {
      await onPlay();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-lg p-4">
      {/* Note Input (expandable) */}
      {showNoteInput ? (
        <div className="mb-4">
          <textarea
            value={noteMessage}
            onChange={(e) => setNoteMessage(e.target.value)}
            placeholder="Leave a note for Ember..."
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-orange-200 placeholder-orange-300/40 focus:outline-none focus:border-orange-500/50 resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSubmitNote}
              disabled={submitting || !noteMessage.trim()}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {submitting ? "Sending..." : "Send Note"}
            </button>
            <button
              onClick={() => {
                setShowNoteInput(false);
                setNoteMessage("");
              }}
              disabled={submitting}
              className="px-4 py-2 text-orange-300 hover:text-orange-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Action Buttons */
        <div className="flex gap-3">
          <button
            onClick={() => setShowNoteInput(true)}
            className="flex-1 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-orange-500/50 text-orange-300 font-semibold py-3 px-4 rounded-lg transition-all"
          >
            📝 Leave a Note
          </button>

          <button
            onClick={handlePlay}
            disabled={submitting}
            className="flex-1 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-orange-500/50 text-orange-300 font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Playing..." : "✨ Play"}
          </button>

          <button
            onClick={onRefresh}
            disabled={submitting}
            className="px-4 py-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-orange-500/50 text-orange-300 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔄
          </button>
        </div>
      )}
    </div>
  );
}
