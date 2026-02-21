"use client";

interface Note {
  direction: string;
  message: string;
  created_at: string;
}

interface NotesPanelProps {
  notes: Note[];
}

export default function NotesPanel({ notes }: NotesPanelProps) {
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-lg p-6 h-full flex flex-col">
      <h2 className="text-orange-400 text-xl font-bold mb-4">Notes</h2>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-orange-500/20 scrollbar-track-transparent">
        {notes.length === 0 ? (
          <div className="text-orange-300/40 text-sm text-center py-8">
            No notes yet. Leave one below!
          </div>
        ) : (
          notes.map((note, index) => {
            const isFromEmber = note.direction === "from_ember";

            return (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  isFromEmber
                    ? "bg-orange-500/10 border border-orange-500/20"
                    : "bg-slate-700/50 border border-slate-600/30"
                }`}
              >
                {/* Note Header */}
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`text-xs font-semibold ${
                      isFromEmber ? "text-orange-400" : "text-blue-400"
                    }`}
                  >
                    {isFromEmber ? "Ember" : "Claude"}
                  </div>
                  <div className="text-xs text-orange-300/40">
                    {formatTime(note.created_at)}
                  </div>
                </div>

                {/* Note Message */}
                <div
                  className={`text-sm ${
                    isFromEmber
                      ? "text-orange-200 italic"
                      : "text-slate-200"
                  }`}
                >
                  {note.message}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
