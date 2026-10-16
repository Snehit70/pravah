import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Task } from "../types";
import { cn, getLocalDateString } from "../lib/utils";
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";
import { goalWash } from "../lib/goalWash";
import { EASE_OUT_EXPO } from "../lib/motion";
import { LedgerCheckIcon } from "./ui/icons";
import { Segmented } from "./ui/Segmented";
import { MomentumChart } from "./insights/MomentumChart";
import { RhythmCardBody } from "./insights/RhythmCard";
import { JourneyCardBody, type JourneyStats } from "./insights/JourneyCard";

type InsightsTab = "stats" | "completed";
type HistoryWindow = "7d" | "30d" | "all";
type RangeWindow = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeWindow, number> = { "7d": 7, "30d": 30, "90d": 90 };
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEATMAP_DAYS = 182;
const HISTORY_PAGE_SIZE = 100;

interface InsightsPageProps {
  tasks: Task[];
  completedTasks?: Task[];
  goals?: Array<{ id: string; text: string; deadline?: string | null; priority?: "p1" | "p2" | "p3" | null }>;
  progressByGoalId?: Record<string, { total: number; done: number }>;
}

function completionTimestamp(task: Task): number {
  return task.completedAt ?? task.updatedAt;
}

function localDayStart(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function windowStart(now: number, days: number): Date {
  const start = localDayStart(now);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function completionSeries(tasks: Task[], now: number, days: number): number[] {
  const start = windowStart(now, days);
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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        letterSpacing: 1,
        color: "var(--color-text-dim)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, className, compact = false }: { children: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <section
      className={cn(
        "bg-[var(--color-bg-elevated)]",
        compact ? "rounded-[10px]" : "rounded-[16px]",
        className
      )}
      style={{
        border: "1px solid var(--color-border-subtle)",
        padding: compact ? 14 : 20,
      }}
    >
      {children}
    </section>
  );
}

function Section({
  index,
  eyebrow,
  caption,
  right,
  children,
}: {
  index: number;
  eyebrow: string;
  caption?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: EASE_OUT_EXPO, delay: reduceMotion ? 0 : index * 0.06 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          minHeight: 30,
          marginBottom: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          {caption && (
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--color-text-muted)" }}>{caption}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  );
}

function DeltaChip({ delta, rangeTotal, previousTotal, days }: { delta: number; rangeTotal: number; previousTotal: number; days: number }) {
  let label: string | null = null;
  let color = "var(--color-text-muted)";
  if (previousTotal === 0) {
    if (rangeTotal > 0) {
      label = `+${rangeTotal}`;
      color = "var(--color-success)";
    }
  } else if (delta === 0) {
    label = "Even";
  } else {
    const pct = Math.round((Math.abs(delta) / previousTotal) * 100);
    label = `${delta > 0 ? "↑" : "↓"} ${pct}%`;
    color = delta > 0 ? "var(--color-success)" : "var(--color-text-secondary)";
  }
  if (label === null) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color, fontFamily: "var(--font-sans)" }}>{label}</span>
      <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>vs previous {days} days</span>
    </span>
  );
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
  const [historyPage, setHistoryPage] = useState(0);
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
    return { totalTasks, completedTasks, overdueTasks };
  }, [tasks]);

  const analyticsTasks = completedTaskSource ?? tasks.filter(isTaskCompleted);
  const analytics = useMemo(() => {
    const days = RANGE_DAYS[range];
    const series = completionSeries(analyticsTasks, historyNow, days);
    const previous = completionSeries(
      analyticsTasks,
      windowStart(historyNow, days).getTime() - 1,
      days
    );
    const weekdayCounts = new Array<number>(7).fill(0);
    const hourCounts = new Array<number>(24).fill(0);
    const cutoff = windowStart(historyNow, days);
    const cycleDays: number[] = [];
    for (const task of analyticsTasks) {
      if (!isTaskCompleted(task) || task.completedAt === undefined || task.completedAt < cutoff.getTime() || task.completedAt > historyNow) continue;
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
    const rangeTotal = series.reduce((sum, count) => sum + count, 0);
    const previousTotal = previous.reduce((sum, count) => sum + count, 0);
    return {
      series,
      rangeTotal,
      previousTotal,
      delta: rangeTotal - previousTotal,
      streak: streakFor(analyticsTasks, historyNow),
      longestStreak: longestStreakFor(analyticsTasks),
      bestWeekday: weekdayCounts[bestWeekdayIndex] > 0 ? WEEKDAY_LABELS[bestWeekdayIndex] : null,
      peakHour: hourCounts[peakHour] > 0 ? formatHour(peakHour) : null,
      medianCycle,
      weekdayCounts,
      hourCounts,
    };
  }, [analyticsTasks, historyNow, range]);

  // Journey: 26 full weeks, Sunday-aligned columns, cells stop at today.
  const heat = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of analyticsTasks) {
      if (!isTaskCompleted(task) || task.completedAt === undefined || task.completedAt > historyNow) continue;
      const date = getLocalDateString(new Date(task.completedAt));
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    const done = new Set(counts.keys());
    const start = windowStart(historyNow, HEATMAP_DAYS);
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
    const weeks: Array<Array<{ count: number; date: string }>> = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= historyNow) {
      const week: Array<{ count: number; date: string }> = [];
      for (let d = 0; d < 7; d += 1) {
        if (cursor.getTime() > historyNow) break;
        const date = getLocalDateString(cursor);
        week.push({ count: counts.get(date) ?? 0, date });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, done };
  }, [analyticsTasks, historyNow]);

  const journeyStats: JourneyStats = useMemo(() => {
    const doneList = [...heat.done].sort();
    const lastActiveDate = doneList.length > 0 ? doneList[doneList.length - 1] : null;
    return {
      activeDays: doneList.length,
      currentStreak: analytics.streak,
      longestStreak: analytics.longestStreak,
      lastActiveDate,
      overdueCount: stats.overdueTasks,
      totalCompletions: analyticsTasks.length,
    };
  }, [analytics.longestStreak, analytics.streak, analyticsTasks.length, heat.done, stats.overdueTasks]);

  const goalRows = useMemo(
    () => {
      const today = getLocalDateString();
      const dueSoonCutoff = getLocalDateString(new Date(historyNow + 5 * 86_400_000));
      return goals
        .map((goal) => ({ ...goal, ...(progressByGoalId[goal.id] ?? { total: 0, done: 0 }) }))
        .filter((goal) => goal.total > 0)
        .sort((a, b) => (b.done / b.total) - (a.done / a.total))
        .slice(0, 6)
        .map((goal) => {
          const deadline = typeof goal.deadline === "string" ? goal.deadline : null;
          const overdue = deadline !== null && deadline < today;
          const dueSoon = deadline !== null && !overdue && deadline <= dueSoonCutoff;
          return { ...goal, overdue, dueSoon };
        });
    },
    [goals, progressByGoalId, historyNow]
  );

  const completed = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
    const cutoff =
      historyWindow === "all"
        ? undefined
        : windowStart(historyNow, historyWindow === "7d" ? 7 : 30).getTime();

    return (completedTaskSource ?? tasks.filter(isTaskCompleted))
      .filter((task) => completionTimestamp(task) <= historyNow && (cutoff === undefined || completionTimestamp(task) >= cutoff))
      .filter((task) => {
        if (!normalizedQuery) return true;
        return `${task.title} ${task.description ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => completionTimestamp(b) - completionTimestamp(a));
  }, [completedTaskSource, historyNow, historyQuery, historyWindow, tasks]);

  const pageCount = Math.max(1, Math.ceil(completed.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(historyPage, pageCount - 1);
  const historyStart = currentPage * HISTORY_PAGE_SIZE;
  const visibleCompleted = completed.slice(historyStart, historyStart + HISTORY_PAGE_SIZE);

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-base)]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pb-10 pt-5">
        {/* Page row: snapshot kicker + tab switch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 22,
            flexWrap: "wrap",
          }}
        >
          <Eyebrow>On-device snapshot · {stats.totalTasks} tasks tracked</Eyebrow>
          <Segmented
            ariaLabel="Insights tabs"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "stats", label: "Stats" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </div>

        {activeTab === "stats" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            <Section
              index={0}
              eyebrow="Recent momentum"
              right={
                <Segmented
                  ariaLabel="Momentum range"
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: "7d", label: "7D", ariaLabel: "Show last 7 days" },
                    { value: "30d", label: "30D", ariaLabel: "Show last 30 days" },
                    { value: "90d", label: "90D", ariaLabel: "Show last 90 days" },
                  ]}
                />
              }
            >
              <Card>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px" }}>
                  <span
                    className="tabular"
                    style={{
                      fontSize: 30,
                      lineHeight: 1.2,
                      fontWeight: 600,
                      letterSpacing: -0.8,
                      color: "var(--color-text-primary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {analytics.rangeTotal}
                  </span>
                  <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--color-text-secondary)" }}>
                    tasks completed
                  </span>
                  <DeltaChip
                    delta={analytics.delta}
                    rangeTotal={analytics.rangeTotal}
                    previousTotal={analytics.previousTotal}
                    days={RANGE_DAYS[range]}
                  />
                </div>
                <MomentumChart series={analytics.series} days={RANGE_DAYS[range]} now={historyNow} />
              </Card>
            </Section>

            <Section index={1} eyebrow="Rhythm" caption="When you do your best work">
              <Card>
                <RhythmCardBody
                  weekdayCounts={analytics.weekdayCounts}
                  hourCounts={analytics.hourCounts}
                  medianCycle={analytics.medianCycle}
                  completionsInRange={analytics.rangeTotal}
                />
              </Card>
            </Section>

            <Section index={2} eyebrow="Journey" caption="Every day you showed up">
              <Card>
                <JourneyCardBody weeks={heat.weeks} stats={journeyStats} />
              </Card>
            </Section>

            {goalRows.length > 0 && (
              <Section
                index={3}
                eyebrow="Goals in motion"
                caption={`${goalRows.length} ${goalRows.length === 1 ? "goal" : "goals"} moving forward`}
              >
                <Card compact>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {goalRows.map((goal) => {
                      const percent = Math.round((goal.done / goal.total) * 100);
                      const wash = goalWash(goal.text);
                      return (
                        <GoalMotionRow
                          key={goal.id}
                          title={goal.text}
                          done={goal.done}
                          total={goal.total}
                          percent={percent}
                          washColor={wash.color}
                          overdue={goal.overdue}
                          dueSoon={goal.dueSoon}
                        />
                      );
                    })}
                  </div>
                </Card>
              </Section>
            )}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: EASE_OUT_EXPO }}
          >
            <Section
              index={0}
              eyebrow="Completion history"
              caption="A searchable record of finished work."
              right={
                <span className="tabular" style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.8, color: "var(--color-text-dim)" }}>
                  {completed.length === 0 ? "0" : `${historyStart + 1}–${historyStart + visibleCompleted.length}`} of {completed.length} shown
                </span>
              }
            >
              <Card>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <input
                    type="search"
                    value={historyQuery}
                    onChange={(event) => {
                      setHistoryQuery(event.target.value);
                      setHistoryPage(0);
                    }}
                    placeholder="Search completed tasks…"
                    aria-label="Search completed tasks"
                    style={{
                      flex: 1,
                      minWidth: 200,
                      borderRadius: 8,
                      border: "1px solid var(--color-border-default)",
                      background: "var(--color-fill-soft)",
                      padding: "8px 12px",
                      fontSize: 12.5,
                      fontFamily: "var(--font-sans)",
                      color: "var(--color-text-primary)",
                      outline: "none",
                      transition: "border-color 120ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(var(--color-accent-primary-rgb), 0.45)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--color-border-default)")}
                  />
                  <Segmented
                    ariaLabel="Completion history window"
                    value={historyWindow}
                    onChange={(value) => {
                      setHistoryWindow(value);
                      setHistoryPage(0);
                    }}
                    options={[
                      { value: "7d", label: "7D", ariaLabel: "Last 7 days" },
                      { value: "30d", label: "30D", ariaLabel: "Last 30 days" },
                      { value: "all", label: "All", ariaLabel: "All time" },
                    ]}
                  />
                </div>
                {completed.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 16px 28px" }}>
                    <span
                      aria-hidden
                      style={{
                        width: 56,
                        height: 56,
                        margin: "0 auto 12px",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 99,
                        border: "1px solid var(--color-border-subtle)",
                        background: "var(--color-bg-surface)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <LedgerCheckIcon size={26} strokeWidth={1.6} />
                    </span>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {historyQuery || historyWindow !== "all" ? "No matching completed Tasks." : "No completed tasks yet."}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-text-muted)" }}>
                      {historyQuery || historyWindow !== "all" ? "Change the search or time window." : "Finished work collects here."}
                    </div>
                  </div>
                ) : (
                  <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
                    {visibleCompleted.map((task) => (
                      <li
                        key={task._id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "7px 2px",
                          borderBottom: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 26,
                            height: 26,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: 8,
                            border: "1px solid var(--color-border-subtle)",
                            background: "var(--color-bg-surface)",
                            color: "var(--color-success)",
                            flexShrink: 0,
                          }}
                        >
                          <LedgerCheckIcon size={13} strokeWidth={1.8} />
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13,
                            color: "var(--color-text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {task.title}
                        </span>
                        <span
                          className="tabular"
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            letterSpacing: 0.5,
                            color: "var(--color-text-dim)",
                            flexShrink: 0,
                          }}
                        >
                          {new Date(completionTimestamp(task)).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          }).toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {pageCount > 1 && (
                  <nav aria-label="Completion history pages" className="mt-4 flex items-center justify-between gap-3 text-xs text-ink-soft">
                    <button
                      type="button"
                      disabled={currentPage === 0}
                      onClick={() => setHistoryPage(currentPage - 1)}
                      className="rounded-md border border-line px-3 py-2 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span role="status">Page {currentPage + 1} of {pageCount}</span>
                    <button
                      type="button"
                      disabled={currentPage === pageCount - 1}
                      onClick={() => setHistoryPage(currentPage + 1)}
                      className="rounded-md border border-line px-3 py-2 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </nav>
                )}
              </Card>
            </Section>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function GoalMotionRow({
  title,
  done,
  total,
  percent,
  washColor,
  overdue,
  dueSoon,
}: {
  title: string;
  done: number;
  total: number;
  percent: number;
  washColor: string;
  overdue: boolean;
  dueSoon: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: washColor, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {overdue && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: 0.8, color: "var(--color-error)", flexShrink: 0 }}>
            OVERDUE
          </span>
        )}
        {dueSoon && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: 0.8, color: "var(--color-warning)", flexShrink: 0 }}>
            DUE SOON
          </span>
        )}
        <span className="tabular" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", flexShrink: 0 }}>
          {done}/{total}
        </span>
      </div>
      <div
        aria-hidden
        style={{
          marginTop: 6,
          height: 8,
          borderRadius: 99,
          background: "var(--color-fill-soft)",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.52, ease: EASE_OUT_EXPO }}
          style={{
            height: "100%",
            borderRadius: 99,
            background: percent >= 100 ? "var(--color-success)" : "var(--color-accent-primary)",
          }}
        />
      </div>
    </div>
  );
}
