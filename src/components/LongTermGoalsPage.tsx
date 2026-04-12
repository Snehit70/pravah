import { useEffect, useState } from "react";
import { Reorder } from "framer-motion";
import { Target, Plus, GripVertical } from "lucide-react";
import { TopNavbar, type AppPage } from "./TopNavbar";
import { cn } from "../lib/utils";

const STORAGE_KEY = "pravah_long_term_goals";

interface GoalItem {
  id: string;
  text: string;
}

interface LongTermGoalsPageProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

export function LongTermGoalsPage({ activePage, onNavigate }: LongTermGoalsPageProps) {
  const [draft, setDraft] = useState("");
  const [goals, setGoals] = useState<GoalItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as GoalItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (value) =>
          value &&
          typeof value === "object" &&
          typeof value.id === "string" &&
          typeof value.text === "string"
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }, [goals]);

  const addGoal = () => {
    const text = draft.trim();
    if (!text) return;
    setGoals((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
      },
    ]);
    setDraft("");
  };

  return (
    <div className="h-full flex flex-col bg-[#191919]">
      <TopNavbar
        activePage={activePage}
        onNavigate={onNavigate}
        centerContent="Long-term Goals"
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className={cn("rounded-2xl border border-white/10 bg-[#252525] p-5")}>
            <div className="mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-300 flex items-center justify-center">
                <Target size={16} />
              </div>
              <h2 className="text-zinc-100 font-medium">Long-term Goals List</h2>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addGoal();
                }}
                placeholder="Add a long-term goal..."
                className={cn(
                  "min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900",
                  "px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500",
                  "focus:outline-none focus:border-blue-500/60"
                )}
              />
              <button
                type="button"
                onClick={addGoal}
                className={cn(
                  "rounded-xl p-2.5",
                  "bg-blue-500/15 hover:bg-blue-500/25 text-blue-300",
                  "border border-blue-400/25 transition-colors"
                )}
                aria-label="Add long-term goal"
              >
                <Plus size={14} />
              </button>
            </div>

            {goals.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-3 text-sm text-zinc-400">
                No goals yet. Add one and drag to reorder.
              </p>
            ) : (
              <Reorder.Group axis="y" values={goals} onReorder={setGoals} className="space-y-2">
                {goals.map((goal) => (
                  <Reorder.Item
                    key={goal.id}
                    value={goal}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70",
                      "px-3 py-2.5 cursor-grab active:cursor-grabbing"
                    )}
                  >
                    <GripVertical size={14} className="text-zinc-500 flex-shrink-0" />
                    <span className="text-sm text-zinc-200">{goal.text}</span>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
