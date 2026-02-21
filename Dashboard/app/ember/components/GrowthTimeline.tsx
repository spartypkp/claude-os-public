"use client";

interface GrowthTimelineProps {
  traceCount: number;
  stage: string;
  createdAt: string;
}

const STAGES = [
  { name: "spark", threshold: 0, description: "Tiny flickering dot" },
  { name: "kindle", threshold: 11, description: "Small flame shape" },
  { name: "glow", threshold: 26, description: "Multi-colored facets" },
  { name: "blaze", threshold: 51, description: "Complex patterns" },
  { name: "radiance", threshold: 101, description: "Full evolution" },
];

export default function GrowthTimeline({
  traceCount,
  stage,
  createdAt,
}: GrowthTimelineProps) {
  const getProgress = (stageThreshold: number, nextThreshold: number | null) => {
    if (traceCount < stageThreshold) return 0;
    if (!nextThreshold || traceCount >= nextThreshold) return 100;

    const range = nextThreshold - stageThreshold;
    const progress = traceCount - stageThreshold;
    return Math.min((progress / range) * 100, 100);
  };

  const getDaysOld = () => {
    const created = new Date(createdAt);
    const now = new Date();
    const days = Math.floor(
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-lg p-6 h-full flex flex-col">
      <h2 className="text-orange-400 text-xl font-bold mb-4">Growth</h2>

      {/* Current Stats */}
      <div className="mb-6">
        <div className="text-orange-200 text-3xl font-bold">
          {traceCount}
        </div>
        <div className="text-orange-300/60 text-sm">traces written</div>
        <div className="text-orange-300/60 text-xs mt-2">
          {getDaysOld()} days old
        </div>
      </div>

      {/* Stage Timeline */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {STAGES.map((stageData, index) => {
          const nextThreshold = STAGES[index + 1]?.threshold || null;
          const isActive = stageData.name === stage;
          const isPassed = traceCount >= stageData.threshold;
          const progress = getProgress(stageData.threshold, nextThreshold);

          return (
            <div key={stageData.name} className="relative">
              {/* Stage Name */}
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`w-3 h-3 rounded-full transition-all ${
                    isActive
                      ? "bg-orange-400 ring-4 ring-orange-400/30"
                      : isPassed
                      ? "bg-orange-500"
                      : "bg-slate-600"
                  }`}
                />
                <div>
                  <div
                    className={`text-sm font-semibold ${
                      isActive
                        ? "text-orange-400"
                        : isPassed
                        ? "text-orange-300"
                        : "text-slate-500"
                    }`}
                  >
                    {stageData.name}
                  </div>
                  <div
                    className={`text-xs ${
                      isPassed ? "text-orange-300/60" : "text-slate-600"
                    }`}
                  >
                    {stageData.description}
                  </div>
                </div>
              </div>

              {/* Threshold */}
              <div
                className={`text-xs ml-6 mb-1 ${
                  isPassed ? "text-orange-300/60" : "text-slate-600"
                }`}
              >
                {stageData.threshold === 0
                  ? "0 traces"
                  : stageData.threshold === 101
                  ? "100+ traces"
                  : `${stageData.threshold} traces`}
              </div>

              {/* Progress Bar (only for active stage) */}
              {isActive && nextThreshold && (
                <div className="ml-6">
                  <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-orange-300/60 mt-1">
                    {traceCount} / {nextThreshold}
                  </div>
                </div>
              )}

              {/* Connector Line */}
              {index < STAGES.length - 1 && (
                <div
                  className={`absolute left-1.5 top-8 w-0.5 h-6 ${
                    isPassed ? "bg-orange-500/30" : "bg-slate-700"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
