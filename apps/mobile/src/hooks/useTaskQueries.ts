/**
 * useTaskQueries
 *
 * Owns Convex query subscriptions for the task workspace. Core tab data stays
 * live while authenticated; the expensive full-corpus subscription is loaded
 * only for features that need workspace-wide context.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { MobileTask } from "../components/TaskCard";
import { addDays, toIsoDate } from "../lib/dates";
import { compareTaskOrder, compareTasksWithinDay } from "../lib/taskLifecycle";

/**
 * Maps a raw task document to the MobileTask shape the UI consumes. Pure and
 * stable so the hook and tests share it. MUST preserve every field the UI
 * depends on — notably `time`, which the Timeline within-day sort reads (see
 * buildScheduledTasks / compareTasksWithinDay). Dropping a field here silently
 * disables behavior on the real data path even when isolated unit tests pass.
 */
export function mapTaskDoc(task: MobileTask): MobileTask {
  return {
    _id: task._id,
    title: task.title,
    description: task.description,
    deadline: task.deadline,
    time: task.time,
    scheduledAt: task.scheduledAt,
    completedAt: task.completedAt,
    cancelledAt: task.cancelledAt,
    priority: task.priority,
    position: task.position,
    updatedAt: task.updatedAt,
    createdAt: task.createdAt,
  };
}

/**
 * Builds the ordered Timeline list from raw task docs: map to MobileTask, then
 * sort by deadline date, then time-of-day within the day, then manual position.
 * Exported so tests exercise the REAL data path (mapping + sort together) and
 * catch regressions an isolated comparator test would miss.
 */
export function buildScheduledTasks(docs: MobileTask[]): MobileTask[] {
  return docs
    .map(mapTaskDoc)
    .sort(
      (a, b) =>
        (a.deadline ?? "").localeCompare(b.deadline ?? "") ||
        compareTasksWithinDay(a, b) ||
        compareTaskOrder(a, b)
    );
}

type UseTaskQueriesOptions = {
  /** Pass null/undefined when the session is not yet available — all queries skip. */
  isAuthenticated: boolean;
  /** Fetch all tasks only when features (e.g. Kairo) need full context. */
  includeAllTasks?: boolean;
};

export function useTaskQueries({ isAuthenticated, includeAllTasks = true }: UseTaskQueriesOptions) {
  const { today, tomorrow, weekEnd, queryEndDate } = buildTimelineWindow(new Date());

  const inboxQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated ? { status: "inbox" } : "skip"
  );

  const timelineQuery = useQuery(
    api.tasks.getTimeline,
    // Omit startDate so overdue tasks (deadline < today) are still surfaced.
    // queryEndDate is the far-future sentinel, so the full forward horizon is
    // fetched — no task is dropped for being scheduled beyond the next week.
    isAuthenticated ? { endDate: queryEndDate } : "skip"
  );

  const completedQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated ? { status: "completed" } : "skip"
  );

  const allTasksQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated && includeAllTasks ? {} : "skip"
  );

  const inboxTasks = useMemo<MobileTask[]>(() => {
    return (
      (inboxQuery as MobileTask[] | undefined)
        ?.map(mapTaskDoc)
        .sort(compareTaskOrder) ?? []
    );
  }, [inboxQuery]);

  const scheduledTasks = useMemo<MobileTask[]>(() => {
    const flat = Object.values(timelineQuery ?? {}).flat() as MobileTask[];
    return buildScheduledTasks(flat);
  }, [timelineQuery]);

  const completedTasks = useMemo<MobileTask[]>(() => {
    return (
      (completedQuery as MobileTask[] | undefined)
        ?.map(mapTaskDoc)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) ?? []
    );
  }, [completedQuery]);

  const allWorkspaceTasks = useMemo<MobileTask[]>(
    () => (allTasksQuery as MobileTask[] | undefined)?.map(mapTaskDoc) ?? [],
    [allTasksQuery]
  );

  const timelineSections = useMemo<[string, MobileTask[]][]>(() => {
    const grouped = new Map<string, MobileTask[]>();
    for (const task of scheduledTasks) {
      const key = task.deadline ?? "unscheduled";
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledTasks]);

  // Split timeline counts so the header can honestly distinguish
  // "still owed" (overdue) from "ahead of you" (this week). A single
  // combined count under the "through this week" label hides large
  // overdue backlogs and reads as misleading progress.
  const { overdueCount, thisWeekCount } = useMemo(() => {
    let overdue = 0;
    let thisWeek = 0;
    for (const task of scheduledTasks) {
      const date = task.deadline;
      if (!date) continue;
      if (date < today) overdue += 1;
      // Bound thisWeek by the labelled "this week" boundary (today+6). The
      // timeline fetches through TIMELINE_FAR_FUTURE, but tasks beyond this
      // labelled window stay out of the "through this week" metric.
      else if (date <= weekEnd) thisWeek += 1;
    }
    return { overdueCount: overdue, thisWeekCount: thisWeek };
  }, [scheduledTasks, today, weekEnd]);

  const timelineCount = scheduledTasks.length;
  const inboxCount = inboxTasks.length;
  const completedCount = completedTasks.length;

  const isInboxLoading = inboxQuery === undefined;
  const isTimelineLoading = timelineQuery === undefined;
  const isCompletedLoading = completedQuery === undefined;
  const isAllTasksReady = !includeAllTasks || allTasksQuery !== undefined;

  return {
    today,
    tomorrow,
    weekEnd,
    inboxTasks,
    scheduledTasks,
    completedTasks,
    allWorkspaceTasks,
    timelineSections,
    inboxCount,
    timelineCount,
    overdueCount,
    thisWeekCount,
    completedCount,
    isInboxLoading,
    isTimelineLoading,
    isCompletedLoading,
    isAllTasksReady,
  };
}

// Sentinel upper bound meaning "no horizon cap": the timeline fetches every
// future-dated task, not just the next week. For a single-user workspace this
// is a handful of indexed rows, and nothing further out is silently dropped.
export const TIMELINE_FAR_FUTURE = "9999-12-31";

export function buildTimelineWindow(baseDate: Date): {
  today: string;
  tomorrow: string;
  weekEnd: string;
  queryEndDate: string;
} {
  return {
    today: toIsoDate(baseDate),
    tomorrow: toIsoDate(addDays(baseDate, 1)),
    // Retained only for the overdue-triage "this week" reschedule target (today+6);
    // the timeline no longer buckets by "this week".
    weekEnd: toIsoDate(addDays(baseDate, 6)),
    // No upper bound — surface the full forward horizon so far-future tasks
    // (e.g. a multi-week study plan) are never hidden from the timeline.
    queryEndDate: TIMELINE_FAR_FUTURE,
  };
}
