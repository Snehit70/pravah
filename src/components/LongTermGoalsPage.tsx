import { useEffect, useMemo, useState } from "react";
import { Reorder } from "framer-motion";
import { ArrowUpRight, GripVertical, Plus, Target, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";

const STORAGE_KEY = "pravah_long_term_goals";

interface GoalItem {
  id: string;
  text: string;
}

interface GoalReadModel {
  id: string;
  text: string;
  createdAt?: number;
}

interface GoalProgress {
  total: number;
  done: number;
}

interface LongTermGoalsPageProps {
  readOnly?: boolean;
  serverGoals?: GoalReadModel[];
  progressByGoalId?: Record<string, GoalProgress>;
}

export function LongTermGoalsPage({
  readOnly = false,
  serverGoals,
  progressByGoalId,
}: LongTermGoalsPageProps = {}) {
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

  const displayGoals = useMemo(() => {
    if (readOnly && serverGoals) {
      return [...serverGoals].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return goals;
  }, [goals, readOnly, serverGoals]);

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

  const removeGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-6">
        <section className="mb-6 border-b border-white/[0.07] pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                <Target size={14} />
                Long Horizon
              </div>
              <h1 className="text-2xl font-semibold text-zinc-100">Long-term Goals</h1>
            </div>
            <div className="tabular rounded-[6px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">
              {displayGoals.length} active
            </div>
          </div>
          {readOnly && (
            <p className="mt-3 text-xs text-zinc-500">
              Goals and task links are server-backed in this phase. Editing and linking controls land next.
            </p>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
            {!readOnly && (
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
                    "min-w-0 flex-1 rounded-[6px] border border-white/[0.09] bg-black/25",
                    "px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500",
                    "outline-none transition-colors focus:border-[oklch(0.78_0.14_260_/_0.45)]"
                  )}
                />
                <button
                  type="button"
                  onClick={addGoal}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-[6px]",
                    "border border-[oklch(0.78_0.14_260_/_0.4)]",
                    "bg-[oklch(0.72_0.16_260_/_0.2)] text-[oklch(0.78_0.14_260)]",
                    "transition-colors hover:bg-[oklch(0.72_0.16_260_/_0.28)]"
                  )}
                  aria-label="Add long-term goal"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}

            {displayGoals.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-white/[0.09] bg-black/20 px-4 py-10 text-center">
                <p className="text-sm text-zinc-400">No goals yet.</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {readOnly ? "Create a goal in mobile for now. Web editing comes next." : "Add one above, then drag to reorder."}
                </p>
              </div>
            ) : readOnly ? (
              <div className="space-y-2">
                {displayGoals.map((goal) => {
                  const progress = progressByGoalId?.[goal.id] ?? { total: 0, done: 0 };
                  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
                  return (
                    <div
                      key={goal.id}
                      className="rounded-[6px] border border-white/[0.07] bg-[#101013] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 text-sm text-zinc-200 break-words">{goal.text}</span>
                        <span className="tabular text-xs text-zinc-500">
                          {progress.done}/{progress.total} done
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-[oklch(0.78_0.14_260)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Reorder.Group axis="y" values={goals} onReorder={setGoals} className="space-y-2">
                {goals.map((goal) => (
                  <Reorder.Item
                    key={goal.id}
                    value={goal}
                    whileDrag={{ scale: 1.01 }}
                    className={cn(
                      "group flex items-center gap-3 rounded-[6px] border border-white/[0.07]",
                      "bg-[#101013] px-3 py-3 cursor-grab active:cursor-grabbing",
                      "shadow-sm transition-colors hover:border-white/[0.13] hover:bg-[#141418]"
                    )}
                  >
                    <GripVertical size={14} className="flex-shrink-0 text-zinc-600" />
                    <span className="min-w-0 flex-1 text-sm text-zinc-200 break-words">{goal.text}</span>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => removeGoal(goal.id)}
                      aria-label={`Delete goal: ${goal.text}`}
                      className={cn(
                        "flex-shrink-0 rounded-[5px] p-1.5",
                        "text-zinc-600 hover:text-red-300 hover:bg-red-500/10",
                        "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      )}
                    >
                      <Trash2 size={13} />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}

            <p className="mt-4 text-xs text-zinc-600">
              {readOnly ? "Source of truth: Convex goals + goal links." : "Saved locally in this browser."}
            </p>
          </section>

          <aside className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[6px] bg-[oklch(0.72_0.16_260_/_0.14)] text-[oklch(0.78_0.14_260)]">
              <ArrowUpRight size={16} />
            </div>
            <p className="text-sm font-medium text-zinc-200">Keep it spare</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              This list is for goals that should guide the timeline without becoming daily tasks yet.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

