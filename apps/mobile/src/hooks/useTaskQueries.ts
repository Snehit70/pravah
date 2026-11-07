/**
 * useTaskQueries
 *
 * Inbox and timeline stay live. Completed history, today's completed count,
 * and image collections subscribe only when the caller asks. The unfiltered
 * owner scan is not used.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { recordDiagnosticEvent } from "../lib/diagnostics";
import { collectServerImageIds } from "../lib/taskImageLibrary";
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
    imageCollection: task.imageCollection,
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

const IMAGE_OBSERVED_AT_BUCKET_MS = 5 * 60 * 1000;

function useImageObservedAt(enabled: boolean) {
  const [observedAt, setObservedAt] = useState(
    () => Math.floor(Date.now() / IMAGE_OBSERVED_AT_BUCKET_MS) * IMAGE_OBSERVED_AT_BUCKET_MS
  );
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      setObservedAt(Math.floor(Date.now() / IMAGE_OBSERVED_AT_BUCKET_MS) * IMAGE_OBSERVED_AT_BUCKET_MS);
    }, IMAGE_OBSERVED_AT_BUCKET_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  return observedAt;
}

type UseTaskQueriesOptions = {
  /** Pass null/undefined when the session is not yet available — all queries skip. */
  isAuthenticated: boolean;
  /** Goals and Progress. The full completedAt range. */
  includeCompletedHistory?: boolean;
  /** Timeline progress for today. One deadline, not the history range. */
  includeCompletedToday?: boolean;
  /** Task cards. Skipped on screens that do not show images. */
  includeImages?: boolean;
  /**
   * Last date (inclusive) of the always-live near timeline. Overdue tasks are
   * included. Omit to subscribe to the whole horizon in one query.
   */
  nearTimelineEnd?: string;
  /**
   * Subscribe to tasks after `nearTimelineEnd`. Off until the user scrolls past
   * the near window, so the common case reads only the next two weeks.
   */
  includeLaterTimeline?: boolean;
};

export function useTaskQueries({
  isAuthenticated,
  includeCompletedHistory = false,
  includeCompletedToday = false,
  includeImages = false,
  nearTimelineEnd,
  includeLaterTimeline = false,
}: UseTaskQueriesOptions) {
  const { today, tomorrow, weekEnd, queryEndDate } = buildTimelineWindow(new Date());
  const imageObservedAt = useImageObservedAt(isAuthenticated && includeImages);

  const inboxQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated ? { status: "inbox" } : "skip"
  );

  const timelineQuery = useQuery(
    api.tasks.getTimeline,
    // Omit startDate so overdue tasks (deadline < today) are still surfaced.
    // The args stay identical all day, so this subscription never re-runs when
    // later dates load; the later range is a separate, disjoint query.
    isAuthenticated ? { endDate: nearTimelineEnd ?? queryEndDate } : "skip"
  );
  const laterStartDate = nearTimelineEnd ? nextIsoDate(nearTimelineEnd) : null;
  const laterTimelineQuery = useQuery(
    api.tasks.getTimeline,
    isAuthenticated && includeLaterTimeline && laterStartDate
      ? { startDate: laterStartDate, endDate: TIMELINE_FAR_FUTURE }
      : "skip"
  );
  const wantsLaterTimeline = isAuthenticated && includeLaterTimeline && laterStartDate !== null;

  const completedHistoryQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated && includeCompletedHistory ? { status: "completed" } : "skip"
  );
  const completedTodayQuery = useQuery(
    api.tasks.listTasks,
    isAuthenticated && includeCompletedToday && !includeCompletedHistory
      ? { status: "completed", date: today }
      : "skip"
  );
  const imageCollectionsQuery = useQuery(
    api.taskImages.listWorkspaceImageCollections,
    isAuthenticated && includeImages ? { observedAt: imageObservedAt } : "skip"
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    recordDiagnosticEvent("convex_subscriptions", "debug", {
      inbox: true,
      timeline: true,
      laterTimeline: wantsLaterTimeline,
      completedHistory: includeCompletedHistory,
      completedToday: includeCompletedToday && !includeCompletedHistory,
      images: includeImages,
    }, "sync");
  }, [
    isAuthenticated,
    includeCompletedHistory,
    includeCompletedToday,
    includeImages,
    wantsLaterTimeline,
  ]);

  const queryRows = useMemo(() => {
    if (!isAuthenticated) return null;
    return {
      inbox: Array.isArray(inboxQuery) ? inboxQuery.length : null,
      timeline: countTimelineRows(timelineQuery),
      laterTimeline: wantsLaterTimeline ? countTimelineRows(laterTimelineQuery) : null,
      completedHistory: includeCompletedHistory
        ? (Array.isArray(completedHistoryQuery) ? completedHistoryQuery.length : null)
        : null,
      completedToday: includeCompletedToday && !includeCompletedHistory
        ? (Array.isArray(completedTodayQuery) ? completedTodayQuery.length : null)
        : null,
      imageTasks: includeImages
        ? (Array.isArray(imageCollectionsQuery) ? imageCollectionsQuery.length : null)
        : null,
    };
  }, [
    completedHistoryQuery,
    completedTodayQuery,
    imageCollectionsQuery,
    inboxQuery,
    includeCompletedHistory,
    includeCompletedToday,
    includeImages,
    isAuthenticated,
    laterTimelineQuery,
    timelineQuery,
    wantsLaterTimeline,
  ]);
  const queryRowsKey = queryRows ? JSON.stringify(queryRows) : null;
  useEffect(() => {
    if (!queryRowsKey) return;
    const rows = JSON.parse(queryRowsKey) as Record<string, number | null>;
    if (Object.values(rows).every((value) => value === null)) return;
    recordDiagnosticEvent("convex_query_rows", "debug", rows, "sync");
  }, [queryRowsKey]);

  const imageCollections = useMemo(() => {
    const map = new Map<string, NonNullable<MobileTask["imageCollection"]>>();
    for (const item of (imageCollectionsQuery ?? []) as Array<{
      taskId: string;
      collection: NonNullable<MobileTask["imageCollection"]>;
    }>) {
      map.set(item.taskId, item.collection);
    }
    return map;
  }, [imageCollectionsQuery]);

  const withImages = useCallback(
    (task: MobileTask): MobileTask => ({
      ...mapTaskDoc(task),
      imageCollection: imageCollections.get(String(task._id)),
    }),
    [imageCollections]
  );

  const inboxTasks = useMemo<MobileTask[]>(() => {
    return (
      (inboxQuery as MobileTask[] | undefined)
        ?.map(withImages)
        .sort(compareTaskOrder) ?? []
    );
  }, [inboxQuery, withImages]);

  const scheduledTasks = useMemo<MobileTask[]>(() => {
    const flat = [
      ...Object.values(timelineQuery ?? {}).flat(),
      ...Object.values(laterTimelineQuery ?? {}).flat(),
    ] as MobileTask[];
    return buildScheduledTasks(flat).map(withImages);
  }, [laterTimelineQuery, timelineQuery, withImages]);

  const completedTasks = useMemo<MobileTask[]>(() => {
    const source = (includeCompletedHistory ? completedHistoryQuery : completedTodayQuery) as
      | MobileTask[]
      | undefined;
    return (
      source
        ?.map(withImages)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) ?? []
    );
  }, [completedHistoryQuery, completedTodayQuery, includeCompletedHistory, withImages]);

  const allWorkspaceTasks = useMemo<MobileTask[]>(() => {
    const byId = new Map<string, MobileTask>();
    for (const task of [...inboxTasks, ...scheduledTasks, ...completedTasks]) {
      byId.set(String(task._id), task);
    }
    return [...byId.values()];
  }, [completedTasks, inboxTasks, scheduledTasks]);

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
  const isLaterTimelineLoading = wantsLaterTimeline && laterTimelineQuery === undefined;
  const hasLaterTimeline = wantsLaterTimeline && laterTimelineQuery !== undefined;
  const isCompletedLoading =
    (includeCompletedHistory && completedHistoryQuery === undefined) ||
    (includeCompletedToday && !includeCompletedHistory && completedTodayQuery === undefined);
  const isAllTasksReady = isAuthenticated && !isInboxLoading && !isTimelineLoading &&
    !isLaterTimelineLoading && !isCompletedLoading;
  const isImageCollectionsReady = !includeImages || imageCollectionsQuery !== undefined;
  const retainedImageIds = useMemo(
    () => (isAuthenticated && includeImages ? collectServerImageIds(imageCollectionsQuery) : null),
    [imageCollectionsQuery, includeImages, isAuthenticated],
  );

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
    isLaterTimelineLoading,
    hasLaterTimeline,
    isCompletedLoading,
    isAllTasksReady,
    isImageCollectionsReady,
    imageCollections,
    retainedImageIds,
  };
}

function countTimelineRows(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  return Object.values(result as Record<string, unknown>).reduce<number>(
    (sum, day) => sum + (Array.isArray(day) ? day.length : 0),
    0,
  );
}

/** `2026-11-21` -> `2026-11-22`, in UTC so no local DST shift can skip a day. */
export function nextIsoDate(isoDate: string): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
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
