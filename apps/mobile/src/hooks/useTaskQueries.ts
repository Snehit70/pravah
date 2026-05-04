/**
 * useTaskQueries
 *
 * Owns all Convex query subscriptions for the task workspace. Queries are
 * kept always-on while the user is authenticated — never gated on which tab
 * is active. This ensures instant tab switches (data is already cached) and
 * prevents the blank-inbox regression that occurred when the query was skipped
 * while the user was on another tab.
 */

import { useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { addDays, toIsoDate } from "../lib/dates";

function getPriorityRank(priority?: "p1" | "p2" | "p3"): number {
  if (priority === "p1") return 0;
  if (priority === "p2") return 1;
  if (priority === "p3") return 2;
  return 3;
}

type UseTaskQueriesOptions = {
  /** Pass null/undefined when the session is not yet available — all queries skip. */
  isAuthenticated: boolean;
  /** Fetch all tasks only when features (e.g. Kairo) need full context. */
  includeAllTasks?: boolean;
};

export function useTaskQueries({ isAuthenticated, includeAllTasks = true }: UseTaskQueriesOptions) {
  const { today, tomorrow, weekEnd, overdueStart } = buildTimelineWindow(new Date());

  const inboxQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated ? { status: "inbox" } : "skip"
  );

  const timelineQuery = useQuery(
    api.tasks.getTimeline,
    // overdueStart (today − 14 days) keeps overdue scheduled tasks visible so
    // users can still complete or reschedule them from mobile. Using `today`
    // as the lower bound caused a regression where tasks scheduled before today
    // disappeared from all three tabs.
    isAuthenticated ? { startDate: overdueStart, endDate: weekEnd } : "skip"
  );

  const completedQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated ? { status: "completed" } : "skip"
  );

  const allTasksQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated && includeAllTasks ? {} : "skip"
  );

  const countsQuery = useQuery(
    api.tasks.getTaskCounts,
    isAuthenticated ? {} : "skip"
  );

  const mapTaskDoc = useCallback(
    (task: Doc<"tasks">): MobileTask => ({
      _id: task._id,
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      priority: task.priority,
      status: task.status,
      scheduledDate: task.scheduledDate,
      position: task.position,
      updatedAt: task.updatedAt,
    }),
    []
  );

  const inboxTasks = useMemo<MobileTask[]>(() => {
    return (
      (inboxQuery as Doc<"tasks">[] | undefined)
        ?.map(mapTaskDoc)
        .sort(
          (a, b) =>
            getPriorityRank(a.priority) - getPriorityRank(b.priority) ||
            a.position - b.position
        ) ?? []
    );
  }, [inboxQuery, mapTaskDoc]);

  const scheduledTasks = useMemo<MobileTask[]>(() => {
    const flat = Object.values(timelineQuery ?? {}).flat() as Doc<"tasks">[];
    return flat
      .map(mapTaskDoc)
      .sort(
        (a, b) =>
          (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") ||
          getPriorityRank(a.priority) - getPriorityRank(b.priority) ||
          a.position - b.position
      );
  }, [timelineQuery, mapTaskDoc]);

  const completedTasks = useMemo<MobileTask[]>(() => {
    return (
      (completedQuery as Doc<"tasks">[] | undefined)
        ?.map(mapTaskDoc)
        .sort((a, b) => b.updatedAt - a.updatedAt) ?? []
    );
  }, [completedQuery, mapTaskDoc]);

  const allWorkspaceTasks = useMemo<MobileTask[]>(
    () =>
      (allTasksQuery as Doc<"tasks">[] | undefined)?.map(mapTaskDoc) ?? [],
    [allTasksQuery, mapTaskDoc]
  );

  const timelineSections = useMemo<[string, MobileTask[]][]>(() => {
    const grouped = new Map<string, MobileTask[]>();
    for (const task of scheduledTasks) {
      const key = task.scheduledDate ?? "unscheduled";
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledTasks]);

  const inboxCount =
    countsQuery?.inboxCount ?? inboxTasks.length;
  const timelineCount =
    countsQuery?.timelineCount ?? scheduledTasks.length;
  const completedCount =
    countsQuery?.completedCount ?? completedTasks.length;

  const isInboxLoading = inboxQuery === undefined;
  const isTimelineLoading = timelineQuery === undefined;
  const isCompletedLoading = completedQuery === undefined;

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
    completedCount,
    isInboxLoading,
    isTimelineLoading,
    isCompletedLoading,
  };
}

// How many days back to look for overdue scheduled tasks. 14 days catches
// real-world overdue items without pulling years of history.
const OVERDUE_LOOKBACK_DAYS = 14;

export function buildTimelineWindow(baseDate: Date): {
  today: string;
  tomorrow: string;
  weekEnd: string;
  overdueStart: string;
} {
  return {
    today: toIsoDate(baseDate),
    tomorrow: toIsoDate(addDays(baseDate, 1)),
    weekEnd: toIsoDate(addDays(baseDate, 6)),
    // Overdue tasks scheduled before today are also included in the timeline
    // window so they remain visible (and actionable) until the user completes
    // or reschedules them. Without this lower bound they would vanish from all
    // three tabs, making it impossible to close the loop from the mobile UI.
    overdueStart: toIsoDate(addDays(baseDate, -OVERDUE_LOOKBACK_DAYS)),
  };
}
