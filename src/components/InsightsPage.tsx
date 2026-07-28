import { useMemo, useState } from "react";
import type { Task } from "../types";
import { cn, getLocalDateString } from "../lib/utils";
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";

type InsightsTab = "stats" | "completed";
type HistoryWindow = "7d" | "30d" | "all";
type RangeWindow = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeWindow, number> = { "7d": 7, "30d": 30, "90d": 90 };
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface InsightsPageProps {
  tasks: Task[];
  completedTasks?: Task[];
  goals?: Array<{ id: string; text: string }>;
  progressByGoalId?: Record<string, { total: number; done: number }>;
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

function completionTimestamp(task: Task): number {
  return task.completedAt ?? task.updatedAt;
}

function localDayStart(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function completionSeries(tasks: Task[], now: number, days: number): number[] {
  const start = localDayStart(now);
  start.setDate(start.getDate() - (days - 1));
  const counts = new Array<number>(days).fill(0);
  for (const task of tasks) {
    if (!isTaskCompleted(task) || task.completedAt === undefined) continue;
    const completed = new Date(task.completedAt);
    const day = localDayStart(task.completedAt);
    const index = Math.round((day.getTime() - start.getTime()) / 86_400_000);
    if (completed.getTime() <= now && index >= 0 && index < days) counts[index] += 1;
  }
  return counts;
}

function streakFor(tasks: Task[], now: number): number {
  const completedDays = new Set(
    tasks
      .filter((task) => isTaskCompleted(task) && task.completedAt !== undefined)
      .map((task) => getLocalDateString(new Date(task.completedAt as number)))
  );
  if (completedDays.size === 0) return 0;
  const cursor = localDayStart(now);
  if (!completedDays.has(getLocalDateString(cursor))) cursor.setDate(cursor.getDate() - 1);
  if (!completedDays.has(getLocalDateString(cursor))) return 0;
  let count = 0;
  while (completedDays.has(getLocalDateString(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function longestStreakFor(tasks: Task[]): number {
  const sorted = [...new Set(
    tasks
      .filter((task) => isTaskCompleted(task) && task.completedAt !== undefined)
      .map((task) => getLocalDateString(new Date(task.completedAt as number)))
  )].sort();
  let longest = sorted.length > 0 ? 1 : 0;
  let current = longest;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = localDayStart(Date.parse(`${sorted[index - 1]}T12:00:00`));
    const currentDate = localDayStart(Date.parse(`${sorted[index]}T12:00:00`));
    if (Math.round((currentDate.getTime() - previous.getTime()) / 86_400_000) === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12} ${period}`;
}

export function InsightsPage({
  tasks,
  completedTasks: completedTaskSource,
  goals = [],
  progressByGoalId = {},
}: InsightsPageProps) {
  const [activeTab, setActiveTab] = useState<InsightsTab>("stats");
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>("30d");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyNow] = useState(() => Date.now());
  const [range, setRange] = useState<RangeWindow>("30d");

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

  const analyticsTasks = completedTaskSource ?? tasks.filter(isTaskCompleted);
  const analytics = useMemo(() => {
    const days = RANGE_DAYS[range];
    const series = completionSeries(analyticsTasks, historyNow, days);
    const weekdayCounts = new Array<number>(7).fill(0);
    const hourCounts = new Array<number>(24).fill(0);
    const cutoff = localDayStart(historyNow);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const cycleDays: number[] = [];
    for (const task of analyticsTasks) {
      if (!isTaskCompleted(task) || task.completedAt === undefined || task.completedAt < cutoff.getTime()) continue;
      const completed = new Date(task.completedAt);
      weekdayCounts[completed.getDay()] += 1;
      hourCounts[completed.getHours()] += 1;
      if (task.completedAt >= task.scheduledAt) cycleDays.push((task.completedAt - task.scheduledAt) / 86_400_000);
    }
    const bestWeekdayIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    cycleDays.sort((a, b) => a - b);
    const middle = Math.floor(cycleDays.length / 2);
    const medianCycle = cycleDays.length >= 3
      ? (cycleDays.length % 2 === 0 ? (cycleDays[middle - 1] + cycleDays[middle]) / 2 : cycleDays[middle])
      : null;
    return {
      series,
      rangeTotal: series.reduce((sum, count) => sum + count, 0),
      streak: streakFor(analyticsTasks, historyNow),
      longestStreak: longestStreakFor(analyticsTasks),
      bestWeekday: weekdayCounts[bestWeekdayIndex] > 0 ? WEEKDAY_LABELS[bestWeekdayIndex] : null,
      peakHour: hourCounts[peakHour] > 0 ? formatHour(peakHour) : null,
      medianCycle,
    };
  }, [analyticsTasks, historyNow, range]);

  const goalRows = useMemo(
    () => goals
      .map((goal) => ({ ...goal, ...(progressByGoalId[goal.id] ?? { total: 0, done: 0 }) }))
      .filter((goal) => goal.total > 0)
      .sort((a, b) => (b.done / b.total) - (a.done / a.total))
      .slice(0, 6),
    [goals, progressByGoalId]
  );

  const completed = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
    const cutoff =
      historyWindow === "all"
        ? undefined
        : historyNow - (historyWindow === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;

    return (completedTaskSource ?? tasks.filter(isTaskCompleted))
      .filter((task) => cutoff === undefined || completionTimestamp(task) >= cutoff)
      .filter((task) => {
        if (!normalizedQuery) return true;
        return `${task.title} ${task.description ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => completionTimestamp(b) - completionTimestamp(a));
  }, [completedTaskSource, historyNow, historyQuery, historyWindow, tasks]);

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
          <div className="space-y-4">
            <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-zinc-200">Recent momentum</h2>
                  <p className="mt-1 text-xs text-zinc-500">Completions across the selected rolling window.</p>
                </div>
                <div className="flex items-center gap-1 rounded-[6px] border border-white/[0.07] bg-black/20 p-1" role="group" aria-label="Momentum range">
                  {(["7d", "30d", "90d"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={range === option}
                      onClick={() => setRange(option)}
                      className={range === option
                        ? "rounded-[4px] bg-white/[0.1] px-2 py-1 text-[11px] text-zinc-100"
                        : "rounded-[4px] px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200"}
                    >
                      {option.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex h-28 items-end gap-1" role="img" aria-label={`${analytics.rangeTotal} tasks completed in the last ${RANGE_DAYS[range]} days`}>
                {analytics.series.map((count, index) => {
                  const peak = Math.max(...analytics.series, 1);
                  return (
                    <div key={`${range}-${index}`} className="group relative flex h-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-[3px] bg-[oklch(0.78_0.14_260_/_0.72)] transition-[height] duration-300 group-hover:bg-[oklch(0.78_0.14_260)]"
                        style={{ height: `${Math.max(count > 0 ? 8 : 2, (count / peak) * 100)}%` }}
                        title={`${count} completed`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
                <span>{analytics.rangeTotal} completed</span>
                <span>{RANGE_DAYS[range]} days</span>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Tasks" value={String(stats.totalTasks)} hint="Across inbox, scheduled, and completed." />
              <MetricCard label="Completed" value={String(stats.completedTasks)} hint="Tasks marked done." />
              <MetricCard label="Completion Rate" value={`${stats.completionRate}%`} hint="Completed divided by total tasks." />
              <MetricCard label="Overdue" value={String(stats.overdueTasks)} hint="Scheduled before today and still open." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
                <h2 className="text-sm font-medium text-zinc-200">Consistency</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricCard label="Current streak" value={`${analytics.streak}d`} hint="Consecutive days with a completion." />
                  <MetricCard label="Best streak" value={`${analytics.longestStreak}d`} hint="Longest completion run." />
                </div>
              </section>
              <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
                <h2 className="text-sm font-medium text-zinc-200">Work rhythm</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Most productive day</dt><dd className="text-zinc-200">{analytics.bestWeekday ?? "Not enough data"}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Peak completion hour</dt><dd className="text-zinc-200">{analytics.peakHour ?? "Not enough data"}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Median cycle time</dt><dd className="text-zinc-200">{analytics.medianCycle === null ? "Not enough data" : `${analytics.medianCycle.toFixed(1)}d`}</dd></div>
                </dl>
              </section>
            </div>

            {goalRows.length > 0 && (
              <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium text-zinc-200">Goals in motion</h2>
                    <p className="mt-1 text-xs text-zinc-500">Progress from linked tasks.</p>
                  </div>
                  <span className="text-xs text-zinc-600">{goalRows.length} active</span>
                </div>
                <div className="mt-4 space-y-3">
                  {goalRows.map((goal) => {
                    const percent = Math.round((goal.done / goal.total) * 100);
                    return (
                      <div key={goal.id}>
                        <div className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate text-zinc-300">{goal.text}</span><span className="tabular text-zinc-600">{goal.done}/{goal.total}</span></div>
                        <div className="mt-1.5 h-1 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[oklch(0.78_0.14_260)]" style={{ width: `${percent}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : (
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Completed Tasks</h2>
                <p className="mt-1 text-xs text-zinc-500">A searchable history of finished work.</p>
              </div>
              <div className="flex items-center gap-1 rounded-[6px] border border-white/[0.07] bg-black/20 p-1" role="group" aria-label="Completion history window">
                {(["7d", "30d", "all"] as const).map((window) => (
                  <button
                    key={window}
                    type="button"
                    onClick={() => setHistoryWindow(window)}
                    aria-pressed={historyWindow === window}
                    className={cn(
                      "rounded-[4px] px-2 py-1 text-[11px] transition-colors",
                      historyWindow === window
                        ? "bg-white/[0.1] text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-200"
                    )}
                  >
                    {window === "all" ? "All" : window.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="search"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search completed tasks…"
              aria-label="Search completed tasks"
              className="mt-4 w-full rounded-[6px] border border-white/[0.09] bg-black/25 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[oklch(0.78_0.14_260_/_0.45)]"
            />
            {completed.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                {historyQuery || historyWindow !== "all"
                  ? "No completed tasks match this view."
                  : "No completed tasks yet."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {completed.map((task) => (
                  <li key={task._id} className="rounded-[6px] border border-white/[0.07] bg-[#101013] px-3 py-2">
                    <p className="text-sm text-zinc-100">{task.title}</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Completed {new Date(completionTimestamp(task)).toLocaleDateString()}
                    </p>
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
