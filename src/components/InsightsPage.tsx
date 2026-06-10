import { useMemo, useState } from "react";
import type { Task } from "../types";
import { cn, getLocalDateString } from "../lib/utils";
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";

type InsightsTab = "stats" | "completed";

interface InsightsPageProps {
  tasks: Task[];
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export function InsightsPage({ tasks }: InsightsPageProps) {
  const [activeTab, setActiveTab] = useState<InsightsTab>("stats");

  const stats = useMemo(() => {
    const today = getLocalDateString();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(isTaskCompleted).length;
    const scheduledTasks = tasks.filter(isTaskOnTimeline);
    const overdueTasks = scheduledTasks.filter(
      (task) => {
        const date = task.deadline;
        return typeof date === "string" && date < today;
      }
    ).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return { totalTasks, completedTasks, overdueTasks, completionRate };
  }, [tasks]);

  const completed = useMemo(
    () =>
      tasks
        .filter(isTaskCompleted)
        .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)),
    [tasks]
  );

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-6">
        <section className="mb-6 border-b border-white/[0.07] pb-5">
          <h1 className="text-2xl font-semibold text-zinc-100">Insights</h1>
          <p className="mt-1 text-sm text-zinc-500">A quick view of completion and backlog health.</p>
        </section>

        <div
          className="mb-5 inline-flex w-fit gap-0.5 rounded-[6px] border border-white/[0.07] bg-white/[0.03] p-[3px]"
          role="tablist"
          aria-label="Insights tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "stats"}
            onClick={() => setActiveTab("stats")}
            className={cn(
              "rounded-[4px] px-3 py-1.5 text-xs transition-colors",
              activeTab === "stats"
                ? "bg-[oklch(0.72_0.16_260_/_0.2)] text-[oklch(0.78_0.14_260)]"
                : "text-zinc-400 hover:text-zinc-100"
            )}
          >
            Stats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "completed"}
            onClick={() => setActiveTab("completed")}
            className={cn(
              "rounded-[4px] px-3 py-1.5 text-xs transition-colors",
              activeTab === "completed"
                ? "bg-[oklch(0.72_0.16_260_/_0.2)] text-[oklch(0.78_0.14_260)]"
                : "text-zinc-400 hover:text-zinc-100"
            )}
          >
            Completed
          </button>
        </div>

        {activeTab === "stats" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Total Tasks" value={String(stats.totalTasks)} hint="Across inbox, scheduled, and completed." />
            <MetricCard label="Completed" value={String(stats.completedTasks)} hint="Tasks marked done." />
            <MetricCard label="Completion Rate" value={`${stats.completionRate}%`} hint="Completed divided by total tasks." />
            <MetricCard label="Overdue" value={String(stats.overdueTasks)} hint="Scheduled before today and still open." />
          </div>
        ) : (
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
            <h2 className="text-sm font-medium text-zinc-200">Completed Tasks</h2>
            {completed.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No completed tasks yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {completed.map((task) => (
                  <li key={task._id} className="rounded-[6px] border border-white/[0.07] bg-[#101013] px-3 py-2">
                    <p className="text-sm text-zinc-100">{task.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
