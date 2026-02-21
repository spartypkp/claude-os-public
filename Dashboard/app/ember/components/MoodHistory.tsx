"use client";

interface MoodEntry {
  mood: string;
  color: string;
  trigger: string | null;
  recorded_at: string;
}

interface MoodHistoryProps {
  history: MoodEntry[];
}

export default function MoodHistory({ history }: MoodHistoryProps) {
  const getMoodLabel = (mood: string) => {
    const labels: Record<string, string> = {
      bright: "Bright",
      warm: "Warm",
      resting: "Resting",
      waiting: "Waiting",
    };
    return labels[mood] || mood;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = date.toDateString();
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Group by day
  const groupedByDay = history.reduce((acc, entry) => {
    const date = formatDate(entry.recorded_at);
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, MoodEntry[]>);

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-lg p-6 h-full flex flex-col">
      <h2 className="text-orange-400 text-xl font-bold mb-4">Mood</h2>

      {/* Mood Bars */}
      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-orange-500/20 scrollbar-track-transparent">
        {Object.keys(groupedByDay).length === 0 ? (
          <div className="text-orange-300/40 text-sm text-center py-4">
            No mood history yet
          </div>
        ) : (
          Object.entries(groupedByDay).map(([date, entries]) => {
            // Use the most recent mood for the day
            const latestMood = entries[0];

            return (
              <div key={date}>
                {/* Date Label */}
                <div className="text-xs text-orange-300/60 mb-1">{date}</div>

                {/* Mood Bar */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{
                      backgroundColor: latestMood.color,
                      boxShadow: `0 0 10px ${latestMood.color}40`,
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-sm text-orange-200">
                      {getMoodLabel(latestMood.mood)}
                    </div>
                    {latestMood.trigger && (
                      <div className="text-xs text-orange-300/40 mt-0.5">
                        {latestMood.trigger}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-orange-300/40">
                    {entries.length}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
